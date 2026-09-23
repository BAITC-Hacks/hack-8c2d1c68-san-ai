import { createDatabase } from "../src/lib/server/db";
import { migrate } from "../src/lib/server/migrate";
import { seed } from "../src/lib/server/seed";
async function main() {
  const db = await createDatabase();
  try {
    await migrate(db);
    const count = await seed(db);
    console.log(
      `Demo seed ready: 20,000 synthetic employees; ${count} total nodes. Existing rows preserved.`,
    );
  } finally {
    await db.close();
  }
}
main().catch(() => {
  console.error(
    "Seed failed. Stop the local PGlite app before seeding; check database configuration.",
  );
  process.exitCode = 1;
});
