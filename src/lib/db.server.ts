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
    u.chipBalance = Number((u.chipBalance + amount).toFixed(2));
    return u;
  },
  async updateFields(id, patch) {
    const u = memory.find((x) => x.id === id);
    if (!u) return null;
    Object.assign(u, patch);
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

  return {
    async findByLogin(login) {
      const rx = new RegExp(`^${login.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "i");
      return (await col.findOne({ $or: [{ email: rx }, { username: rx }] })) as UserDoc | null;
    },
    async findById(id) {
      return (await col.findOne({ id })) as UserDoc | null;
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
      await col.updateOne({ id }, { $inc: { chipBalance: amount } });
      return (await col.findOne({ id })) as UserDoc | null;
    },
    async updateFields(id, patch) {
      await col.updateOne({ id }, { $set: patch });
      return (await col.findOne({ id })) as UserDoc | null;
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
