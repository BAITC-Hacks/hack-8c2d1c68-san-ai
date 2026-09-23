/** Live smoke check: synthetic DOCX only, isolated temporary storage. */
import { mkdtemp, rm } from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";
import { zipSync, strToU8 } from "fflate";
import { saveDocument } from "../src/lib/server/document-store";
import { POST, GET } from "../src/app/api/documents/[id]/extract/route";
import type { ExtractionResult } from "../src/lib/extraction";
async function main() {
 const root = await mkdtemp(path.join(tmpdir(), "san-ai-smoke-"));
 const previous = process.env.DOCUMENT_STORAGE_DIR;
 process.env.DOCUMENT_STORAGE_DIR = root;
 try {
  const bytes = zipSync({ "word/document.xml": strToU8('<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>Синтетический документ для теста.</w:t></w:r></w:p><w:p><w:r><w:t>1. Отдел аудита проверяет качество отчётов.</w:t></w:r></w:p><w:p><w:r><w:t>2. Отделу аудита запрещено утверждать платежи.</w:t></w:r></w:p></w:body></w:document>') });
  const doc = await saveDocument(bytes, "synthetic-smoke.docx", "before");
  const params = { params: Promise.resolve({ id: doc.id }) };
  const response = await POST(new Request(`http://localhost/api/documents/${doc.id}/extract`, {method:"POST"}), params);
  const body = await response.json() as { result?: ExtractionResult; error?: string };
  if (!response.ok || !body.result) throw new Error(body.error || "Извлечение не выполнено.");
  if (!body.result.functions.some((f) => f.modality === "prohibition") || !body.result.functions.some((f) => f.modality === "duty")) throw new Error("Контрольное извлечение обязанности и запрета не прошло.");
  const cached = await POST(new Request(`http://localhost/api/documents/${doc.id}/extract`,{method:"POST"}), params);
  if (!(await cached.json()).cached) throw new Error("Кэш не сработал.");
  const download = await GET(new Request(`http://localhost/api/documents/${doc.id}/extract?download=1`),params);
  if (!download.ok || !download.headers.get("Content-Disposition")) throw new Error("Скачивание не прошло.");
  console.log(JSON.stringify({synthetic:true,units:body.result.units.length,functions:body.result.functions.length,rejected:body.result.rejected_items,cache:true,download:true}));
 } finally {
  if (previous === undefined) delete process.env.DOCUMENT_STORAGE_DIR;
  else process.env.DOCUMENT_STORAGE_DIR = previous;
  await rm(root,{recursive:true,force:true});
 }
}
main().catch((e: unknown) => {console.error(e instanceof Error ? e.message : "Синтетическая проверка не прошла.");process.exitCode=1;});
