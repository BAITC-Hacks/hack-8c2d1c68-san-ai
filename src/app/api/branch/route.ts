import { getDatabase } from "@/lib/server/db";
import {
  branchData,
  branchParams,
  NodeNotFoundError,
} from "@/lib/server/branch";
import { apiError } from "@/lib/server/http";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  try {
    const { root, page } = branchParams(new URL(request.url).searchParams);
    return Response.json(await branchData(await getDatabase(), root, page));
  } catch (error) {
    if (error instanceof NodeNotFoundError)
      return Response.json({ error: error.message }, { status: 404 });
    return apiError(error);
  }
}
