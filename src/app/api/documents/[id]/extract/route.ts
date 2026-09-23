import { randomUUID } from "node:crypto";
import { readFile, rename, writeFile, rm } from "node:fs/promises";
import path from "node:path";
import { readDocument, storageRoot, documentError, DocumentError } from "@/lib/server/document-store";
import { extractDocument } from "@/lib/server/extraction";
import { AiError } from "@/lib/server/openai-json";
import type { ParsedDocx } from "@/lib/server/docx-parser";
import type { ExtractionResult } from "@/lib/extraction";
import { toCanonicalOrganization } from "@/lib/canonical-organization";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;
const globalState = globalThis as typeof globalThis & { extractionLocks?: Set<string> };
const locks = globalState.extractionLocks ??= new Set<string>();
const cacheFile = (id: string) => path.join(storageRoot(), id, "extraction-v1.json");
async function cached(id: string): Promise<ExtractionResult | null> {
  try { return JSON.parse(await readFile(cacheFile(id), "utf8")); }
  catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return null; throw error; }
}
function fail(error: unknown) {
  if (error instanceof AiError) return Response.json({ error: error.message }, { status: error.status });
  if (error instanceof Error && ["AbortError", "TimeoutError"].includes(error.name)) return Response.json({ error: "Извлечение отменено или время ожидания истекло." }, { status: 504 });
  return documentError(error);
}
export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    await readDocument(id, true);
    const result = await cached(id);
    if (!result) throw new DocumentError("AI-извлечение ещё не выполнено.", 404);
    const download = new URL(request.url).searchParams.has("download");
    const payload = new URL(request.url).searchParams.get("view") === "canonical"
      ? toCanonicalOrganization([result], result.side) : { result };
    return Response.json(payload, { headers: { "Cache-Control": "no-store", ...(download ? { "Content-Disposition": 'attachment; filename="organization.json"' } : {}) } });
  } catch (error) { return fail(error); }
}
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  let acquired: string | null = null;
  try {
    const origin = request.headers.get("origin");
    if (origin && new URL(origin).host !== request.headers.get("host")) throw new DocumentError("Недопустимый источник запроса.", 403);
    const { id } = await context.params;
    const document = await readDocument(id, true);
    const existing = await cached(id);
    if (existing) return Response.json({ result: existing, cached: true });
    if (locks.has(id)) throw new DocumentError("Этот документ уже обрабатывается. Повторите запрос позже.", 409);
    if (!process.env.OPENAI_API_KEY?.trim()) throw new AiError("На сервере не задан OPENAI_API_KEY.", 503);
    locks.add(id); acquired = id;
    const result = await extractDocument(JSON.parse(document.data.toString()) as ParsedDocx, request.signal);
    const temporary = `${cacheFile(id)}.${randomUUID()}.tmp`;
    try {
      await writeFile(temporary, JSON.stringify(result));
      await rename(temporary, cacheFile(id));
    } finally { await rm(temporary, { force: true }); }
    return Response.json({ result, cached: false });
  } catch (error) { return fail(error); }
  finally { if (acquired) locks.delete(acquired); }
}
