/**
 * Shared MongoDB Client Singleton
 * 
 * Prevents multiple MongoDB connections from being created.
 * All stores (users, deposits, withdrawals) share this single connection.
 * 
 * IMPORTANT: In production (MONGODB_URI set), memory fallback is DISABLED.
 * If MongoDB goes down, the app fails fast rather than silently losing data.
 */

let mongoClientInstance: any = null;
let connectionFailed = false;
let connectionPromise: Promise<any> | null = null;

export async function getMongoClient() {
  const uri = process.env["MONGODB_URI"];
  if (!uri) {
    throw new Error("MONGODB_URI is not configured.");
  }

  // If already connected, return the instance
  if (mongoClientInstance) {
    return mongoClientInstance;
  }

  // If connection in progress, wait for it
  if (connectionPromise) {
    return connectionPromise;
  }

  // Start new connection
  connectionPromise = (async () => {
    try {
      console.log(`[MONGO-CLIENT] Creating singleton MongoDB client...`);
      const mod = await import(/* @vite-ignore */ "mongodb");
      const client = new mod.MongoClient(uri, {
        maxPoolSize: 10,
        minPoolSize: 2,
        retryWrites: true,
        maxIdleTimeMS: 30000,
        socketTimeoutMS: 15000,
        serverSelectionTimeoutMS: 10000,
        connectTimeoutMS: 10000,
      });
      
      await client.connect();
      console.log(`[MONGO-CLIENT] Connected successfully`);
      
      // Test connection with ping
      const adminDb = client.db("admin");
      const pingResult = await Promise.race([
        adminDb.command({ ping: 1 }),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error("Ping timeout")), 5000)
        ),
      ]);
      console.log(`[MONGO-CLIENT] Ping verified successfully`);
      
      mongoClientInstance = client;
      connectionFailed = false;
      return client;
    } catch (error) {
      console.error(
        `[MONGO-CLIENT] Connection failed:`,
        error instanceof Error ? error.message : error
      );
      connectionFailed = true;
      connectionPromise = null;
      throw error;
    }
  })();

  return connectionPromise;
}

export async function getMongoDb() {
  if (connectionFailed) {
    connectionPromise = null; // Reset to retry
    mongoClientInstance = null;
  }
  
  const client = await getMongoClient();
  const dbName = process.env["MONGODB_DB"] || "cobra_poker";
  return client.db(dbName);
}
