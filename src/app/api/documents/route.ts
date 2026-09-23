import { documentError, DocumentError, listDocuments, readUpload, saveDocument } from "@/lib/server/document-store";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET() {
  try { return Response.json({ documents: await listDocuments() }); }
  catch (error) { return documentError(error); }
}
export async function POST(request: Request) {
  try {
    const origin = request.headers.get("origin");
    if (origin && new URL(origin).host !== request.headers.get("host")) throw new DocumentError("Недопустимый источник запроса.", 403);
    const params = new URL(request.url).searchParams;
    const document = await saveDocument(await readUpload(request), params.get("name") || "", params.get("side") || "");
    return Response.json({ document }, { status: 201 });
  } catch (error) { return documentError(error); }
}
