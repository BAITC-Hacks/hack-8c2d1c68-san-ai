import { getDatabase } from "@/lib/server/db";
import { graphParams, searchNodes } from "@/lib/server/organization";
import { apiError } from "@/lib/server/http";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  try {
    const params = new URL(request.url).searchParams;
    const { department } = graphParams(params);
    return Response.json({
      nodes: await searchNodes(
        await getDatabase(),
        params.get("q") ?? "",
        department,
      ),
      limit: 20,
    });
  } catch (error) {
    return apiError(error);
  }
}
