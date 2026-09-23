import { documentError, readDocument } from "@/lib/server/document-store";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const parsed = new URL(request.url).searchParams.get("view") === "parsed";
    const { metadata, data } = await readDocument((await context.params).id, parsed);
    const filename = parsed ? `${metadata.name}.json` : metadata.name;
    return new Response(new Uint8Array(data), { headers: {
      "Content-Type": parsed ? "application/json; charset=utf-8" : "application/octet-stream",
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(filename).replace(/'/g, "%27")}`,
      "X-Content-Type-Options": "nosniff", "Cache-Control": "no-store",
    } });
  } catch (error) { return documentError(error); }
}
