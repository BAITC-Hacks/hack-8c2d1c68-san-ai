import { createDatabase } from "../src/lib/server/db";
import { migrate } from "../src/lib/server/migrate";
async function main() {
  const db = await createDatabase();
  try {
    await migrate(db);
    console.log("Database schema ready.");
  } finally {
    await db.close();
  }
}
main().catch(() => {
  console.error(
    "Migration failed. Check database availability and configuration.",
  );
  process.exitCode = 1;
});
