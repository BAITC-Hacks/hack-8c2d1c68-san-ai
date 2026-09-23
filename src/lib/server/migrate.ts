import { readFile } from "node:fs/promises";
import path from "node:path";
import type { Database } from "./db";
export async function migrate(db: Database) {
  const sql = await readFile(
    path.join(process.cwd(), "db/migrations/001_organization.sql"),
    "utf8",
  );
  await db.transaction(async (tx) => {
    await tx.exec(sql);
  });
}
