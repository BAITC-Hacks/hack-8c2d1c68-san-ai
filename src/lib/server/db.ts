import { PGlite } from "@electric-sql/pglite";
import { Pool } from "pg";
import path from "node:path";
import { mkdir } from "node:fs/promises";

export interface Database {
  exec(sql: string): Promise<unknown>;
  query<T>(sql: string, params?: unknown[]): Promise<{ rows: T[] }>;
  transaction<T>(fn: (db: Database) => Promise<T>): Promise<T>;
  close(): Promise<void>;
}
function localAdapter(client: PGlite): Database {
  return {
    exec: (sql) => client.exec(sql),
    query: (sql, params) => client.query(sql, params),
    transaction: (fn) =>
      client.transaction((tx) =>
        fn({
          exec: (sql) => tx.exec(sql),
          query: (sql, params) => tx.query(sql, params),
          transaction: () => {
            throw new Error("Nested transaction is unsupported");
          },
          close: async () => {},
        }),
      ),
    close: () => client.close(),
  };
}
export async function createDatabase(): Promise<Database> {
  if (process.env.DATABASE_URL) {
    const pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      max: 5,
      connectionTimeoutMillis: 5000,
      statement_timeout: 15000,
    });
    return {
      exec: (sql) => pool.query(sql),
      query: async <T>(sql: string, params?: unknown[]) => ({
        rows: (await pool.query(sql, params)).rows as T[],
      }),
      transaction: async (fn) => {
        const client = await pool.connect();
        try {
          await client.query("BEGIN");
          const result = await fn({
            exec: (sql) => client.query(sql),
            query: async <T>(sql: string, params?: unknown[]) => ({
              rows: (await client.query(sql, params)).rows as T[],
            }),
            transaction: () => {
              throw new Error("Nested transaction is unsupported");
            },
            close: async () => {},
          });
          await client.query("COMMIT");
          return result;
        } catch (error) {
          await client.query("ROLLBACK");
          throw error;
        } finally {
          client.release();
        }
      },
      close: () => pool.end(),
    };
  }
  const directory = path.resolve(
    /* turbopackIgnore: true */ process.env.PGLITE_DATA_DIR || ".data/pglite",
  );
  await mkdir(directory, { recursive: true });
  const client = new PGlite(directory);
  await client.waitReady;
  return localAdapter(client);
}
const globalDb = globalThis as typeof globalThis & {
  orgDb?: Promise<Database>;
};
export function getDatabase() {
  globalDb.orgDb ??= createDatabase().catch((error) => {
    globalDb.orgDb = undefined;
    throw error;
  });
  return globalDb.orgDb;
}
