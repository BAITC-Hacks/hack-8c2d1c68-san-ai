import { comparisonError, storedComparison } from "@/lib/server/comparison-store";
import { DocumentError } from "@/lib/server/document-store";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 600;

export async function POST(request: Request) {
  try {
    const origin = request.headers.get("origin");
    if (origin && new URL(origin).host !== request.headers.get("host")) throw new DocumentError("Недопустимый источник запроса.", 403);
    const reader = request.body?.getReader();
    if (!reader) throw new DocumentError("Выберите документы для сравнения.");
    const chunks: Uint8Array[] = [];
    let size = 0;
    const timer = setTimeout(() => { void reader.cancel().catch(() => {}); }, 10000);
    try {
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        size += value.length;
        if (size > 4096) { await reader.cancel(); throw new DocumentError("Слишком большой запрос сравнения.", 413); }
        chunks.push(value);
      }
    } finally { clearTimeout(timer); reader.releaseLock(); }
    let input: unknown;
    try { input = JSON.parse(Buffer.concat(chunks).toString()); } catch { throw new DocumentError("Некорректный запрос сравнения."); }
    return Response.json(await storedComparison(input, { generate: true, refresh: new URL(request.url).searchParams.get("refresh") === "1", signal: request.signal }), { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return comparisonError(error); }
}

export async function GET(request: Request) {
  try {
    const query = new URL(request.url).searchParams;
    const payload = await storedComparison({ before_ids: query.getAll("before"), after_ids: query.getAll("after") }, { generate: false, signal: request.signal });
    return Response.json(payload, { headers: { "Cache-Control": "no-store", ...(query.has("download") ? { "Content-Disposition": 'attachment; filename="comparison.json"' } : {}) } });
  } catch (error) { return comparisonError(error); }
}
