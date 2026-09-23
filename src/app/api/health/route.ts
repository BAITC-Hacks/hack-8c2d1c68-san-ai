import { getDatabase } from "@/lib/server/db";
import { apiError } from "@/lib/server/http";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET() {
  try {
    const db = await getDatabase();
    const result = await db.query<{ count: number }>(
      "SELECT count(*)::int count FROM org_nodes",
    );
    return Response.json({
      status: "ok",
      database: process.env.DATABASE_URL ? "postgresql" : "pglite",
      mock: true,
      nodes: result.rows[0].count,
    });
  } catch (error) {
    return apiError(error);
  }
}
