import { getDatabase } from "@/lib/server/db";
import { graphData, graphParams } from "@/lib/server/organization";
import { apiError } from "@/lib/server/http";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  try {
    const { mode, department } = graphParams(new URL(request.url).searchParams);
    return Response.json(
      await graphData(await getDatabase(), mode, department),
    );
  } catch (error) {
    return apiError(error);
  }
}
