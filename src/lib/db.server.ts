/**
 * Data layer.
 *
 * If MONGODB_URI is set (Render / production), all users are stored in MongoDB.
 * Otherwise an in-memory store is used so the app still runs in preview.
 */

export type UserDoc = {
  id: string;
  username: string;
  email: string;
  passwordHash: string;
  createdAt: string;
  chipBalance: number;
  totalGames: number;
  wins: number;
  highestWin: number;
};

type Store = {
  findByLogin(login: string): Promise<UserDoc | null>;
  findById(id: string): Promise<UserDoc | null>;
  insert(user: UserDoc): Promise<void>;
  addBalance(id: string, amount: number): Promise<UserDoc | null>;
  updateFields(
    id: string,
    patch: Partial<Pick<UserDoc, "username" | "email" | "passwordHash">>,
  ): Promise<UserDoc | null>;
  listAll(): Promise<UserDoc[]>;
  setBalance(id: string, amount: number): Promise<UserDoc | null>;
};


const memory: UserDoc[] = [];

const memoryStore: Store = {
  async findByLogin(login) {
    const l = login.toLowerCase();
    return memory.find((u) => u.email.toLowerCase() === l || u.username.toLowerCase() === l) ?? null;
  },
  async findById(id) {
    return memory.find((u) => u.id === id) ?? null;
  },
  async insert(user) {
    memory.push(user);
  },
  async addBalance(id, amount) {
    const u = memory.find((x) => x.id === id);
    if (!u) return null;
    const base = Number.isFinite(u.chipBalance) ? u.chipBalance : 0;
    u.chipBalance = Math.max(0, Number((base + amount).toFixed(2)));
    return u;
  },
  async updateFields(id, patch) {
    const u = memory.find((x) => x.id === id);
    if (!u) return null;
    Object.assign(u, patch);
    return u;
  },
  async listAll() {
    return [...memory].sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  },
  async setBalance(id, amount) {
    const u = memory.find((x) => x.id === id);
    if (!u) return null;
    u.chipBalance = Math.max(0, Number(Number(amount).toFixed(2)));
    return u;
  },

};


let cached: Promise<Store> | null = null;

async function createMongoStore(uri: string): Promise<Store> {
  const { getMongoDb } = await import("./mongo-client");
  const db = await getMongoDb();
  const col = db.collection("users");
  await col.createIndex({ email: 1 }, { unique: true });
  await col.createIndex({ username: 1 }, { unique: true });

  /** Coerce legacy/missing numeric fields so the UI never sees NaN/undefined. */
  const clean = (doc: any): UserDoc | null => {
    if (!doc) return null;
    const n = (v: unknown) => (Number.isFinite(Number(v)) ? Number(v) : 0);
    return {
      ...doc,
      chipBalance: Math.max(0, Number(n(doc.chipBalance).toFixed(2))),
      totalGames: n(doc.totalGames),
      wins: n(doc.wins),
      highestWin: n(doc.highestWin),
    } as UserDoc;
  };

  /** Atomic, rounded, never-negative balance write done fully inside MongoDB. */
  const applyBalance = async (id: string, expr: any): Promise<UserDoc | null> => {
    const res = await col.findOneAndUpdate(
      { id },
      [{ $set: { chipBalance: { $max: [0, { $round: [expr, 2] }] } } }],
      { returnDocument: "after", projection: { _id: 0 } },
    );
    // Driver versions differ: some return the doc directly, some wrap it in { value }.
    return clean((res as any)?.value ?? res);
  };

  return {
    async findByLogin(login) {
      const rx = new RegExp(`^${login.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "i");
      return clean(await col.findOne({ $or: [{ email: rx }, { username: rx }] }));
    },
    async findById(id) {
      return clean(await col.findOne({ id }, { projection: { _id: 0 } }));
    },
    async insert(user) {
      try {
        await col.insertOne({ ...user });
      } catch (err: any) {
        if (err.code === 11000 || err.code === 11001) {
          console.log(`[MONGO] Duplicate key ignored for user: ${user.id} (already exists)`);
          return;
        }
        console.error(`[MONGO] Insert error for ${user.id}:`, err.message);
        throw err;
      }
    },
    async addBalance(id, amount) {
      return applyBalance(id, { $add: [{ $ifNull: ["$chipBalance", 0] }, amount] });
    },
    async updateFields(id, patch) {
      await col.updateOne({ id }, { $set: patch });
      return clean(await col.findOne({ id }, { projection: { _id: 0 } }));
    },
    async listAll() {
      const docs = (await col
        .find({}, { projection: { _id: 0 } })
        .sort({ createdAt: -1 })
        .limit(500)
        .toArray()) as any[];
      return docs.map((d) => clean(d)!) as UserDoc[];
    },
    async setBalance(id, amount) {
      return applyBalance(id, { $literal: Number(amount) });
    },
  };

}


export function getStore(): Promise<Store> {
  if (!cached) {
    const uri = process.env["MONGODB_URI"];
    if (!uri) {
      console.log("[STORE] No MONGODB_URI - using memory store (dev mode)");
      cached = Promise.resolve(memoryStore);
    } else {
      console.log("[STORE] MONGODB_URI set - production mode (NO fallback to memory)");
      // In production, fail fast if MongoDB is unavailable
      cached = createMongoStore(uri);
    }
  }
  return cached;
}
