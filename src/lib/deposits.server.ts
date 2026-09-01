/**
 * Deposit records + Telegram admin notifications.
 *
 * Uses MongoDB when MONGODB_URI is configured, otherwise an in-memory map so
 * the flow keeps working in preview.
 */

const GATEWAY = "https://connector-gateway.lovable.dev/telegram";

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

function tgHeaders() {
  const lovableKey = process.env["LOVABLE_API_KEY"];
  const telegramKey = process.env["TELEGRAM_API_KEY"];
  if (!lovableKey || !telegramKey) throw new Error("Telegram connection is not configured.");
  return {
    Authorization: `Bearer ${lovableKey}`,
    "X-Connection-Api-Key": telegramKey,
  };
}

export async function telegramCall(method: string, body: unknown) {
  const res = await fetch(`${GATEWAY}/${method}`, {
    method: "POST",
    headers: { ...tgHeaders(), "Content-Type": "application/json" },
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
  const res = await fetch(`${GATEWAY}/sendPhoto`, {
    method: "POST",
    headers: tgHeaders(),
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
  const tz = "Asia/Tbilisi";
  const date = now.toLocaleDateString("en-GB", { timeZone: tz });
  const time = now.toLocaleTimeString("en-GB", { timeZone: tz, hour12: false });

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

  const caption =
    `<b>DEPOSIT</b>\n` +
    `Bank: <b>${escapeHtml(input.bank)}</b>\n` +
    `Amount: <b>${input.amount.toFixed(2)} GEL</b>\n` +
    `User ID: <code>${escapeHtml(input.userId)}</code>\n` +
    `Date: ${date}\n` +
    `Time: ${time}`;

  const markup = {
    inline_keyboard: [
      [
        { text: "✅ Qəbul et", callback_data: `dep:ok:${deposit.id}` },
        { text: "❌ Rədd et", callback_data: `dep:no:${deposit.id}` },
      ],
    ],
  };

  const form = new FormData();
  form.append("chat_id", String(chatId));
  form.append("caption", caption);
  form.append("parse_mode", "HTML");
  form.append("reply_markup", JSON.stringify(markup));
  const { blob, filename } = dataUrlToBlob(input.receipt);
  form.append("photo", blob, filename);

  const sent = await telegramSendPhoto(form);
  deposit.messageId = sent.message_id;

  await store.insert(deposit);
  return deposit;
}

export function escapeHtml(s: string) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** Handles the Accept / Reject inline buttons coming back from Telegram. */
export async function handleDepositCallback(data: string, chatId: number, messageId: number) {
  const [, action, depositId] = data.split(":");
  if (!depositId || (action !== "ok" && action !== "no")) return "Unknown action";

  const store = await getDepositStore();
  const deposit = await store.find(depositId);
  if (!deposit) return "Deposit not found";
  if (deposit.status !== "pending") return "Already processed";

  if (action === "ok") {
    const { getStore } = await import("./db.server");
    const users = await getStore();
    await users.addBalance(deposit.userId, deposit.amount);
    await store.update(depositId, { status: "approved" });
  } else {
    await store.update(depositId, { status: "rejected" });
  }

  const suffix = action === "ok" ? "\n\n✅ Qəbul edildi" : "\n\n❌ Rədd edildi";
  await telegramCall("editMessageCaption", {
    chat_id: chatId,
    message_id: messageId,
    parse_mode: "HTML",
    caption:
      `<b>DEPOSIT</b>\n` +
      `Bank: <b>${escapeHtml(deposit.bank)}</b>\n` +
      `Amount: <b>${deposit.amount.toFixed(2)} GEL</b>\n` +
      `User ID: <code>${escapeHtml(deposit.userId)}</code>\n` +
      `Date: ${new Date(deposit.createdAt).toLocaleDateString("en-GB", { timeZone: "Asia/Tbilisi" })}\n` +
      `Time: ${new Date(deposit.createdAt).toLocaleTimeString("en-GB", { timeZone: "Asia/Tbilisi", hour12: false })}` +
      suffix,
    reply_markup: { inline_keyboard: [] },
  }).catch((e) => console.error(e));

  return action === "ok" ? "Qəbul edildi" : "Rədd edildi";
}
