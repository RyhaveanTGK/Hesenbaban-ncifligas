/**
 * Shared MongoDB Client Singleton
 * 
 * Prevents multiple MongoDB connections from being created.
 * All stores (users, deposits, withdrawals) share this single connection.
 * 
 * IMPORTANT: In production (MONGODB_URI set), memory fallback is DISABLED.
 * If MongoDB goes down, the app fails fast rather than silently losing data.
 */

let mongoClientInstance: Promise<any> | null = null;
let connectionFailed = false;

export async function getMongoClient() {
  if (!mongoClientInstance) {
    const uri = process.env["MONGODB_URI"];
    if (!uri) {
      throw new Error("MONGODB_URI is not configured.");
    }

    mongoClientInstance = (async () => {
      try {
        console.log(`[MONGO-CLIENT] Creating singleton MongoDB client...`);
        const mod = await import(/* @vite-ignore */ "mongodb");
        const client = new mod.MongoClient(uri, {
          maxPoolSize: 10,
          minPoolSize: 2,
          retryWrites: true,
          maxIdleTimeMS: 30000,
          socketTimeoutMS: 45000,
        });
        
        await client.connect();
        
        // Test connection
        await client.db("admin").command({ ping: 1 });
        console.log(`[MONGO-CLIENT] Connected and verified successfully`);
        
        // Listen for connection events
        client.on("serverClosed", () => {
          console.error(`[MONGO-CLIENT] Connection closed!`);
          connectionFailed = true;
          mongoClientInstance = null;
        });
        
        client.on("error", (error) => {
          console.error(`[MONGO-CLIENT] Connection error:`, error.message);
          connectionFailed = true;
          mongoClientInstance = null;
        });
        
        return client;
      } catch (error) {
        console.error(`[MONGO-CLIENT] Connection failed:`, error instanceof Error ? error.message : error);
        connectionFailed = true;
        mongoClientInstance = null;
        throw error;
      }
    })();
  }
  return mongoClientInstance;
}

export async function getMongoDb() {
  if (connectionFailed) {
    mongoClientInstance = null; // Reset to retry connection
  }
  
  const client = await getMongoClient();
  const dbName = process.env["MONGODB_DB"] || "cobra_poker";
  return client.db(dbName);
}
