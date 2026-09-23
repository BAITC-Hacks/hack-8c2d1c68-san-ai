import { getDatabase } from "@/lib/server/db";
import { organization } from "@/lib/server/organization";
import { apiError } from "@/lib/server/http";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET() {
  try {
    return Response.json(await organization(await getDatabase()));
  } catch (error) {
    return apiError(error);
  }
}
