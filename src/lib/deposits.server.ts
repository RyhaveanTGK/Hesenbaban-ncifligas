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
    console.log(`[MEMORY] Inserting deposit: ${d.id} for user: ${d.userId}`);
    memory.set(d.id, d);
  },
  async find(id) {
    const result = memory.get(id) ?? null;
    console.log(`[MEMORY] Finding deposit: ${id} - ${result ? 'FOUND' : 'NOT FOUND'}`);
    return result;
  },
  async update(id, patch) {
    const cur = memory.get(id);
    if (cur) {
      const updated = { ...cur, ...patch };
      memory.set(id, updated);
      console.log(`[MEMORY] Updated deposit: ${id} - New status: ${patch.status || 'unchanged'}`);
    }
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
    console.log(`[MEMORY] Set admin chat ID: ${chatId}`);
  },
};

let cached: Promise<DepositStore> | null = null;

async function createMongoDepositStore(uri: string): Promise<DepositStore> {
  console.log(`[MONGO] Connecting to MongoDB...`);
  const mod = await import(/* @vite-ignore */ "mongodb");
  const client = new mod.MongoClient(uri);
  await client.connect();
  console.log(`[MONGO] Connected successfully`);
  
  const db = client.db(process.env["MONGODB_DB"] || "cobra_poker");
  const col = db.collection("deposits");
  const cfg = db.collection("config");
  await col.createIndex({ id: 1 }, { unique: true });

  return {
    async insert(d) {
      try {
        console.log(`[MONGO] Inserting deposit: ${d.id} for user: ${d.userId} amount: ${d.amount}`);
        await col.insertOne({ ...d });
        console.log(`[MONGO] Deposit inserted successfully: ${d.id}`);
      } catch (err: any) {
        // If duplicate key error, it means the document already exists - that's fine
        if (err.code === 11000 || err.code === 11001) {
          console.log(`[MONGO] Duplicate key ignored for deposit: ${d.id} (already exists)`);
          return;
        }
        console.error(`[MONGO] Insert error for ${d.id}:`, err.message);
        throw err;
      }
    },
    async find(id) {
      try {
        const doc = (await col.findOne({ id })) as DepositDoc | null;
        console.log(`[MONGO] Finding deposit: ${id} - ${doc ? 'FOUND' : 'NOT FOUND'}`);
        if (doc) {
          console.log(`[MONGO] Found deposit: id=${doc.id} user=${doc.userId} status=${doc.status}`);
        }
        return doc;
      } catch (err) {
        console.error(`[MONGO] Find error for ${id}:`, err);
        return null;
      }
    },
    async update(id, patch) {
      try {
        console.log(`[MONGO] Updating deposit: ${id} with patch:`, patch);
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
          .limit(20)
          .toArray()) as unknown as DepositDoc[];
        console.log(`[MONGO] Found ${docs.length} deposits for user ${userId}`);
        return docs;
      } catch (err) {
        console.error(`[MONGO] listByUser error for ${userId}:`, err);
        return [];
      }
    },
    async getAdminChatId() {
      try {
        const doc = (await cfg.findOne({ key: "adminChatId" })) as { value?: number } | null;
        const chatId = doc?.value ?? null;
        console.log(`[MONGO] Admin chat ID: ${chatId}`);
        return chatId;
      } catch (err) {
        console.error(`[MONGO] getAdminChatId error:`, err);
        return null;
      }
    },
    async setAdminChatId(chatId) {
      try {
        console.log(`[MONGO] Setting admin chat ID: ${chatId}`);
        await cfg.updateOne({ key: "adminChatId" }, { $set: { value: chatId } }, { upsert: true });
      } catch (err) {
        console.error(`[MONGO] setAdminChatId error:`, err);
        throw err;
      }
    },
  };
}

export function getDepositStore(): Promise<DepositStore> {
  if (!cached) {
    const uri = process.env["MONGODB_URI"];
    console.log(`[STORE] Getting deposit store - MONGODB_URI: ${uri ? 'SET' : 'NOT SET'}`);
    
    cached = uri
      ? createMongoDepositStore(uri).catch((err) => {
          console.error("[STORE] MongoDB connection failed, falling back to memory:", err.message);
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
  console.log(`[TELEGRAM] Calling ${method}`);
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  if (!res.ok) {
    console.error(`[TELEGRAM] ${method} failed [${res.status}]: ${text}`);
    throw new Error(`Telegram ${method} failed [${res.status}]: ${text}`);
  }
  const json = JSON.parse(text) as { ok: boolean; error_code?: number; description?: string; result?: unknown };
  if (!json.ok) {
    console.error(`[TELEGRAM] ${method} error: ${text}`);
    throw new Error(`Telegram ${method} error: ${json.description ?? text}`);
  }
  console.log(`[TELEGRAM] ${method} succeeded`);
  return json.result;
}

async function telegramSendPhoto(form: FormData) {
  const url = getTelegramApiUrl("sendPhoto");
  console.log(`[TELEGRAM] Sending photo...`);
  const res = await fetch(url, {
    method: "POST",
    body: form,
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`Telegram sendPhoto failed [${res.status}]: ${text}`);
  const json = JSON.parse(text) as { ok: boolean; description?: string; result?: { message_id: number } };
  if (!json.ok) throw new Error(`Telegram sendPhoto error: ${json.description ?? text}`);
  console.log(`[TELEGRAM] Photo sent successfully, message_id: ${json.result?.message_id}`);
  return json.result!;
}

export async function resolveAdminChatId(): Promise<number> {
  const fromEnv = process.env["TELEGRAM_ADMIN_CHAT_ID"];
  if (fromEnv) {
    console.log(`[ADMIN] Using TELEGRAM_ADMIN_CHAT_ID from env: ${fromEnv}`);
    return Number(fromEnv);
  }
  const store = await getDepositStore();
  const saved = await store.getAdminChatId();
  if (saved) {
    console.log(`[ADMIN] Using admin chat ID from database: ${saved}`);
    return saved;
  }
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
  console.log(`[DEPOSIT] Submitting deposit: user=${input.userId} amount=${input.amount} bank=${input.bank}`);
  
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

  console.log(`[DEPOSIT] Created deposit record: ${deposit.id}`);

  // Persist BEFORE notifying Telegram
  await store.insert(deposit);
  console.log(`[DEPOSIT] Deposit persisted to database: ${deposit.id}`);

  const payload = `${deposit.id}:${deposit.userId}:${deposit.amount.toFixed(2)}`;
  const markup = {
    inline_keyboard: [
      [
        { text: "\u2705 Q\u0259bul et", callback_data: `dep:ok:${payload}` },
        { text: "\u274c R\u0259dd et", callback_data: `dep:no:${payload}` },
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
    console.log(`[DEPOSIT] Telegram notification sent: ${deposit.id}`);
  } catch (err) {
    console.error(`[DEPOSIT] Telegram notification failed for ${deposit.id}:`, err);
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

function depositFromCaption(id: string, caption: string, chatId: number): DepositDoc | null {
  console.log(`[RECOVERY] Reconstructing deposit from caption: ${id}`);
  const plain = caption
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
  
  const bank = /Bank:\s*(.+)/.exec(plain)?.[1]?.trim();
  const amount = Number(/Amount:\s*([\d.,]+)/.exec(plain)?.[1]?.replace(",", "."));
  const userId = /User ID:\s*(\S+)/.exec(plain)?.[1]?.trim();
  const username = /Username:\s*(.+)/.exec(plain)?.[1]?.trim() ?? "";
  
  console.log(`[RECOVERY] Parsed: bank=${bank} amount=${amount} userId=${userId} username=${username}`);
  
  if (!userId || !Number.isFinite(amount) || amount <= 0) {
    console.log(`[RECOVERY] Recovery failed: missing userId or invalid amount`);
    return null;
  }
  
  const doc = {
    id,
    userId,
    username,
    bank: bank || "Bank",
    amount,
    status: "pending" as DepositStatus,
    createdAt: new Date().toISOString(),
    chatId,
  };
  
  console.log(`[RECOVERY] Successfully reconstructed deposit: ${id}`);
  return doc;
}

/** Handles the Accept / Reject inline buttons for deposits. */
export async function handleDepositCallback(
  data: string,
  chatId: number,
  messageId: number,
  caption?: string,
) {
  console.log(`[CALLBACK] Handling deposit callback: data="${data}" chatId=${chatId} messageId=${messageId}`);
  
  // dep:<ok|no>:<depositId>[:<userId>:<amount>]
  const parts = data.split(":");
  const action = parts[1];
  const depositId = parts[2];
  const cbUserId = parts[3];
  const cbAmount = Number(parts[4]);

  console.log(`[CALLBACK] Parsed: action=${action} depositId=${depositId} cbUserId=${cbUserId} cbAmount=${cbAmount}`);

  if (!depositId || (action !== "ok" && action !== "no")) {
    console.error(`[CALLBACK] Invalid action or depositId`);
    return "Unknown action";
  }

  const store = await getDepositStore();
  let deposit = await store.find(depositId);

  console.log(`[CALLBACK] Database lookup: ${deposit ? 'FOUND' : 'NOT FOUND'}`);

  // Recovery order: callback payload -> message caption
  if (!deposit && cbUserId && Number.isFinite(cbAmount) && cbAmount > 0) {
    console.log(`[CALLBACK] Attempting recovery from callback payload...`);
    deposit = {
      id: depositId,
      userId: cbUserId,
      username: caption ? (/Username:\s*(.+)/.exec(caption)?.[1]?.trim() ?? "") : "",
      bank: caption ? (/Bank:\s*(.+)/.exec(caption)?.[1]?.trim() ?? "Bank") : "Bank",
      amount: cbAmount,
      status: "pending",
      createdAt: new Date().toISOString(),
      chatId,
    };
    console.log(`[CALLBACK] Recovered from callback payload: ${depositId}`);
  }

  if (!deposit && caption) {
    console.log(`[CALLBACK] Attempting recovery from message caption...`);
    deposit = depositFromCaption(depositId, caption, chatId);
  }

  if (deposit) {
    try {
      await store.insert(deposit);
      console.log(`[CALLBACK] Deposit re-inserted for safety: ${depositId}`);
    } catch {
      console.log(`[CALLBACK] Deposit already exists (expected): ${depositId}`);
    }
  }

  if (!deposit) {
    console.error(`[CALLBACK] CRITICAL: Deposit not found and recovery failed: ${depositId}`);
    console.error(`[CALLBACK] Caption provided: ${caption ? 'YES' : 'NO'}`);
    if (caption) {
      console.error(`[CALLBACK] Caption length: ${caption.length}`);
      console.error(`[CALLBACK] Caption preview: ${caption.substring(0, 100)}...`);
    }
    return "Deposit Not Found - Database Error";
  }

  if (deposit.status !== "pending") {
    const msg = deposit.status === "approved" ? "Already approved" : "Already rejected";
    console.log(`[CALLBACK] Deposit already processed: ${depositId} status=${deposit.status}`);
    return msg;
  }

  if (action === "ok") {
    console.log(`[CALLBACK] Approving deposit: ${depositId}`);
    // Update status FIRST
    await store.update(depositId, { status: "approved" });
    console.log(`[CALLBACK] Deposit marked as approved: ${depositId}`);
    
    // Then add balance
    const { getStore } = await import("./db.server");
    const users = await getStore();
    const updated = await users.addBalance(deposit.userId, deposit.amount);
    
    if (!updated) {
      console.error(`[CALLBACK] Failed to add balance for user: ${deposit.userId}`);
      return `User not found`;
    }
    console.log(`[CALLBACK] Balance added for user: ${deposit.userId} amount: ${deposit.amount}`);
  } else {
    console.log(`[CALLBACK] Rejecting deposit: ${depositId}`);
    await store.update(depositId, { status: "rejected" });
    console.log(`[CALLBACK] Deposit marked as rejected: ${depositId}`);
  }

  const suffix =
    action === "ok" ? "\n\n\u2705 Q\u0259bul edildi" : "\n\n\u274c R\u0259dd edildi";

  await telegramCall("editMessageCaption", {
    chat_id: chatId,
    message_id: messageId,
    parse_mode: "HTML",
    caption: depositCaption({ ...deposit }, suffix),
    reply_markup: { inline_keyboard: [] },
  }).catch((e) => console.error("[CALLBACK] editMessageCaption failed:", e));

  const result = action === "ok" ? "Approved" : "Rejected";
  console.log(`[CALLBACK] Callback completed successfully: ${depositId} - ${result}`);
  return result;
}
