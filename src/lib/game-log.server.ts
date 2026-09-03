/**
 * Persistent game log (MongoDB).
 *
 * Every blackjack round, every bet and every payout is written here so the
 * numbers shown in the app are always backed by the database. When
 * MONGODB_URI is missing (preview) an in-memory log is used instead.
 */

export type BetLog = {
  userId: string;
  username: string;
  amount: number;
  total: number;
  outcome: "win" | "lose" | "push" | "refund";
  payout: number;
};

export type RoundLog = {
  game: "blackjack";
  roundId: number;
  tableId: string;
  createdAt: string;
  pot: number;
  dealerTotal: number;
  winners: string[];
  bets: BetLog[];
};

type LogStore = {
  insertRound(round: RoundLog): Promise<void>;
  listRounds(userId: string, limit: number): Promise<RoundLog[]>;
};

const memoryRounds: RoundLog[] = [];

const memoryLog: LogStore = {
  async insertRound(round) {
    memoryRounds.unshift(round);
    if (memoryRounds.length > 200) memoryRounds.pop();
  },
  async listRounds(userId, limit) {
    return memoryRounds.filter((r) => r.bets.some((b) => b.userId === userId)).slice(0, limit);
  },
};

let cached: Promise<LogStore> | null = null;

async function createMongoLog(uri: string): Promise<LogStore> {
  const mod = await import(/* @vite-ignore */ "mongodb");
  const client = new mod.MongoClient(uri);
  await client.connect();
  const dbName = process.env["MONGODB_DB"] || "cobra_poker";
  const col = client.db(dbName).collection("game_rounds");
  await col.createIndex({ roundId: -1 });
  await col.createIndex({ "bets.userId": 1 });

  return {
    async insertRound(round) {
      await col.insertOne({ ...round });
    },
    async listRounds(userId, limit) {
      return (await col
        .find({ "bets.userId": userId })
        .sort({ roundId: -1 })
        .limit(limit)
        .toArray()) as unknown as RoundLog[];
    },
  };
}

export function getGameLog(): Promise<LogStore> {
  if (!cached) {
    const uri = process.env["MONGODB_URI"];
    cached = uri
      ? createMongoLog(uri).catch((err) => {
          console.error("Game log: MongoDB unavailable, using memory log:", err);
          return memoryLog;
        })
      : Promise.resolve(memoryLog);
  }
  return cached;
}
