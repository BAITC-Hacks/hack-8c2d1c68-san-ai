import { readFile } from "node:fs/promises";
import path from "node:path";
import type { Database } from "./db";
export async function migrate(db: Database) {
  for (const file of ["001_organization.sql", "002_demo_directors.sql"]) {
    const sql = await readFile(
      path.join(process.cwd(), "db/migrations", file),
      "utf8",
    );
    await db.transaction(async (tx) => {
      await tx.exec(sql);
    });
  }
}
