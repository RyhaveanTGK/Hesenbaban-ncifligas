/**
 * Deposit records + Telegram admin notifications.
 *
 * Uses MongoDB when MONGODB_URI is configured, otherwise an in-memory map so
 * the flow keeps working in preview.
 * 
 * NOW: Uses Telegram Bot API directly (no Lovable gateway needed)
 */

export type DepositStatus = "pending" | "approved" | "rejected";

export type DepositDoc = {
  id: string;
  userId: string;
  username: string;
  bank: string;
  amount: number;
  status: DepositStatus;
  createdAt: string;
  messageId?: number;
  chatId?: number;
};

type DepositStore = {
  insert(d: DepositDoc): Promise<void>;
  find(id: string): Promise<DepositDoc | null>;
  update(id: string, patch: Partial<DepositDoc>): Promise<void>;
  listByUser(userId: string): Promise<DepositDoc[]>;
  getAdminChatId(): Promise<number | null>;
  setAdminChatId(chatId: number): Promise<void>;
};

const memory = new Map<string, DepositDoc>();
let memoryAdminChat: number | null = null;

const memoryStore: DepositStore = {
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
  async getAdminChatId() {
    return memoryAdminChat;
  },
  async setAdminChatId(chatId) {
    memoryAdminChat = chatId;
  },
};

let cached: Promise<DepositStore> | null = null;

async function createMongoDepositStore(uri: string): Promise<DepositStore> {
  const mod = await import(/* @vite-ignore */ "mongodb");
  const client = new mod.MongoClient(uri);
  await client.connect();
  const db = client.db(process.env["MONGODB_DB"] || "cobra_poker");
  const col = db.collection("deposits");
  const cfg = db.collection("config");
  await col.createIndex({ id: 1 }, { unique: true });

  return {
    async insert(d) {
      await col.insertOne({ ...d });
    },
    async find(id) {
      return (await col.findOne({ id })) as DepositDoc | null;
    },
    async update(id, patch) {
      await col.updateOne({ id }, { $set: patch });
    },
    async listByUser(userId) {
      return (await col
        .find({ userId })
        .sort({ createdAt: -1 })
        .limit(20)
        .toArray()) as unknown as DepositDoc[];
    },
    async getAdminChatId() {
      const doc = (await cfg.findOne({ key: "adminChatId" })) as { value?: number } | null;
      return doc?.value ?? null;
    },
    async setAdminChatId(chatId) {
      await cfg.updateOne({ key: "adminChatId" }, { $set: { value: chatId } }, { upsert: true });
    },
  };
}

export function getDepositStore(): Promise<DepositStore> {
  if (!cached) {
    const uri = process.env["MONGODB_URI"];
    cached = uri
      ? createMongoDepositStore(uri).catch((err) => {
          console.error("Deposit store falling back to memory:", err);
          return memoryStore;
        })
      : Promise.resolve(memoryStore);
  }
  return cached;
}

// Get Telegram Bot API token
function getTelegramToken(): string {
  const token = process.env["TELEGRAM_API_KEY"];
  if (!token) throw new Error("TELEGRAM_API_KEY is not configured.");
  return token;
}

// Telegram Bot API base URL
function getTelegramApiUrl(method: string): string {
  const token = getTelegramToken();
  return `https://api.telegram.org/bot${token}/${method}`;
}

export async function telegramCall(method: string, body: unknown) {
  const url = getTelegramApiUrl(method);
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  if (!res.ok) {
    console.error(`Telegram ${method} failed [${res.status}]: ${text}`);
    throw new Error(`Telegram ${method} failed [${res.status}]: ${text}`);
  }
  const json = JSON.parse(text) as { ok: boolean; error_code?: number; description?: string; result?: unknown };
  if (!json.ok) {
    console.error(`Telegram ${method} error: ${text}`);
    throw new Error(`Telegram ${method} error: ${json.description ?? text}`);
  }
  return json.result;
}

async function telegramSendPhoto(form: FormData) {
  const url = getTelegramApiUrl("sendPhoto");
  const res = await fetch(url, {
    method: "POST",
    body: form,
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`Telegram sendPhoto failed [${res.status}]: ${text}`);
  const json = JSON.parse(text) as { ok: boolean; description?: string; result?: { message_id: number } };
  if (!json.ok) throw new Error(`Telegram sendPhoto error: ${json.description ?? text}`);
  return json.result!;
}

export async function resolveAdminChatId(): Promise<number> {
  const fromEnv = process.env["TELEGRAM_ADMIN_CHAT_ID"];
  if (fromEnv) return Number(fromEnv);
  const store = await getDepositStore();
  const saved = await store.getAdminChatId();
  if (saved) return saved;
  throw new Error(
    "Admin chat is not set yet. Send /start to the bot from the admin account, or set TELEGRAM_ADMIN_CHAT_ID.",
  );
}

function dataUrlToBlob(dataUrl: string): { blob: Blob; filename: string } {
  const match = /^data:([^;]+);base64,(.*)$/s.exec(dataUrl);
  if (!match) throw new Error("Invalid receipt image.");
  const mime = match[1]!;
  const bytes = Uint8Array.from(atob(match[2]!), (c) => c.charCodeAt(0));
  const ext = mime.includes("png") ? "png" : mime.includes("webp") ? "webp" : "jpg";
  return { blob: new Blob([bytes], { type: mime }), filename: `receipt.${ext}` };
}

export async function submitDeposit(input: {
  userId: string;
  username: string;
  bank: string;
  amount: number;
  receipt: string;
}): Promise<DepositDoc> {
  const store = await getDepositStore();
  const chatId = await resolveAdminChatId();

  const now = new Date();

  const deposit: DepositDoc = {
    id: crypto.randomUUID().replace(/-/g, "").slice(0, 12),
    userId: input.userId,
    username: input.username,
    bank: input.bank,
    amount: input.amount,
    status: "pending",
    createdAt: now.toISOString(),
    chatId,
  };

  // Persist BEFORE notifying Telegram: the webhook may be handled by another
  // instance, so the record must already exist when the buttons are pressed.
  await store.insert(deposit);

  const markup = {
    inline_keyboard: [
      [
        { text: "\u2705 Q\u0259bul et", callback_data: `dep:ok:${deposit.id}` },
        { text: "\u274c R\u0259dd et", callback_data: `dep:no:${deposit.id}` },
      ],
    ],
  };

  const form = new FormData();
  form.append("chat_id", String(chatId));
  form.append("caption", depositCaption(deposit));
  form.append("parse_mode", "HTML");
  form.append("reply_markup", JSON.stringify(markup));
  const { blob, filename } = dataUrlToBlob(input.receipt);
  form.append("photo", blob, filename);

  try {
    const sent = await telegramSendPhoto(form);
    deposit.messageId = sent.message_id;
    await store.update(deposit.id, { messageId: sent.message_id });
  } catch (err) {
    // Keep the pending record; surface the failure to the caller.
    throw err;
  }

  return deposit;
}

export function escapeHtml(s: string) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

const TZ = "Asia/Tbilisi";

function depositCaption(d: DepositDoc, suffix = "") {
  const date = new Date(d.createdAt);
  return (
    `<b>DEPOSIT</b>\n` +
    `Bank: <b>${escapeHtml(d.bank)}</b>\n` +
    `Amount: <b>${d.amount.toFixed(2)} GEL</b>\n` +
    `Username: <b>${escapeHtml(d.username)}</b>\n` +
    `User ID: <code>${escapeHtml(d.userId)}</code>\n` +
    `Date: ${date.toLocaleDateString("en-GB", { timeZone: TZ })}\n` +
    `Time: ${date.toLocaleTimeString("en-GB", { timeZone: TZ, hour12: false })}` +
    suffix
  );
}

/**
 * Rebuilds a deposit from the Telegram caption when the stored record is
 * missing (e.g. the in-memory store lives in a different instance, or the DB
 * was reset). This guarantees the Accept / Reject buttons always work.
 */
function depositFromCaption(id: string, caption: string, chatId: number): DepositDoc | null {
  const bank = /Bank:\s*(.+)/.exec(caption)?.[1]?.trim();
  const amount = Number(/Amount:\s*([\d.]+)/.exec(caption)?.[1]);
  const userId = /User ID:\s*(\S+)/.exec(caption)?.[1]?.trim();
  const username = /Username:\s*(.+)/.exec(caption)?.[1]?.trim() ?? "";
  if (!bank || !userId || !Number.isFinite(amount) || amount <= 0) return null;
  return {
    id,
    userId,
    username,
    bank,
    amount,
    status: "pending",
    createdAt: new Date().toISOString(),
    chatId,
  };
}

/** Handles the Accept / Reject inline buttons for deposits. */
export async function handleDepositCallback(
  data: string,
  chatId: number,
  messageId: number,
  caption?: string,
) {
  const parts = data.split(":");
  const action = parts[1];
  const depositId = parts[2];

  if (!depositId || (action !== "ok" && action !== "no")) return "Unknown action";

  const store = await getDepositStore();
  let deposit = await store.find(depositId);

  if (!deposit && caption) {
    const recovered = depositFromCaption(depositId, caption, chatId);
    if (recovered) {
      deposit = recovered;
      try {
        await store.insert(recovered);
      } catch {
        /* already there, ignore */
      }
    }
  }

  if (!deposit) return "Deposit not found";

  if (deposit.status !== "pending") {
    return deposit.status === "approved" ? "Artıq qəbul edilib" : "Artıq rədd edilib";
  }

  if (action === "ok") {
    const { getStore } = await import("./db.server");
    const users = await getStore();
    const updated = await users.addBalance(deposit.userId, deposit.amount);
    if (!updated) return "İstifadəçi tapılmadı";
    await store.update(depositId, { status: "approved" });
  } else {
    await store.update(depositId, { status: "rejected" });
  }

  const suffix =
    action === "ok" ? "\n\n\u2705 Q\u0259bul edildi" : "\n\n\u274c R\u0259dd edildi";

  await telegramCall("editMessageCaption", {
    chat_id: chatId,
    message_id: messageId,
    parse_mode: "HTML",
    caption: depositCaption({ ...deposit }, suffix),
    reply_markup: { inline_keyboard: [] },
  }).catch((e) => console.error("editMessageCaption failed:", e));

  return action === "ok" ? "Qəbul edildi" : "Rədd edildi";
}
