import { MongoClient, type Db } from "mongodb";

/*
 * The website's single MongoDB connection, shared by pages, server actions
 * and the proxy (kept on globalThis so every bundle in the process reuses it).
 *
 * The website connects as its own database user (MONGODB_SITE_URI). Its role
 * can read everything, add versions and edit the platform list, submissions,
 * summaries and sessions. It cannot change or delete a stored version. See
 * README.md for the role.
 */
const globalForMongo = globalThis as unknown as { fineprintMongo?: Promise<MongoClient> };

function connect(): Promise<MongoClient> {
  // MONGODB_READ_URI is accepted so older setups keep serving the public
  // pages; submissions and admin edits need the site role.
  const uri = process.env.MONGODB_SITE_URI ?? process.env.MONGODB_READ_URI;
  if (!uri) throw new Error("MONGODB_SITE_URI is not set. See .env.example.");
  const client = new MongoClient(uri, {
    appName: "fine-print-web",
    maxPoolSize: 10,
    serverSelectionTimeoutMS: 5_000,
    readPreference: "primary",
  });
  return client.connect();
}

export async function getDb(): Promise<Db> {
  globalForMongo.fineprintMongo ??= connect().catch((error) => {
    globalForMongo.fineprintMongo = undefined; // retry on the next request
    throw error;
  });
  const client = await globalForMongo.fineprintMongo;
  return client.db(process.env.MONGODB_DB ?? "fine_print");
}
