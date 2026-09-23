import { randomUUID } from "node:crypto";
import { mkdir, readFile, readdir, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { MAX_UPLOAD_BYTES, type StoredDocument } from "../documents";
import { parseDocx, DocxParseError } from "./docx-parser";

export class DocumentError extends Error {
  constructor(message: string, public status = 400) { super(message); }
}
// Runtime data belongs on the persistent disk, never in Next's deployment bundle.
export const storageRoot = () => path.resolve(/* turbopackIgnore: true */ process.env.DOCUMENT_STORAGE_DIR || ".data/documents");
const validId = (id: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(id);

export async function listDocuments(root = storageRoot()): Promise<StoredDocument[]> {
  await mkdir(root, { recursive: true });
  const entries = await readdir(root, { withFileTypes: true });
  const documents = await Promise.all(entries.filter((e) => e.isDirectory() && validId(e.name))
    .map(async (e) => JSON.parse(await readFile(path.join(root, e.name, "metadata.json"), "utf8")) as StoredDocument));
  return documents.sort((a, b) => b.created_at.localeCompare(a.created_at));
}

export async function saveDocument(data: Uint8Array, name: string, side: string, root = storageRoot()) {
  if (side !== "before" && side !== "after") throw new DocumentError("Выберите комплект ДО или ПОСЛЕ.");
  if (!name || name.length > 240 || /[\x00-\x1f/\\]/u.test(name)) throw new DocumentError("Недопустимое имя файла.");
  const format = path.extname(name).slice(1).toLowerCase();
  if (format !== "docx" && format !== "pdf" && format !== "xlsx") throw new DocumentError("Поддерживаются DOCX, PDF и XLSX.");
  if (!data.length || data.length > MAX_UPLOAD_BYTES) throw new DocumentError("Файл должен быть непустым и не больше 10 МиБ.", 413);
  const signature = Buffer.from(data.subarray(0, 5)).toString("latin1");
  if (format === "pdf" ? signature !== "%PDF-" : !signature.startsWith("PK\x03\x04")) {
    throw new DocumentError("Содержимое файла не соответствует выбранному формату.");
  }
  const metadata: StoredDocument = {
    id: randomUUID(), name, side, format, size: data.length, created_at: new Date().toISOString(),
    status: "stored", fragment_count: 0, warnings: [],
  };
  let parsed;
  if (format === "docx") {
    try {
      parsed = parseDocx(data, name, side);
      metadata.status = "parsed";
      metadata.fragment_count = parsed.fragments.length;
      metadata.warnings = parsed.warnings;
    } catch (error) {
      if (!(error instanceof DocxParseError)) throw error;
      metadata.status = "parse_error";
      metadata.warnings = [error.message];
    }
  } else metadata.warnings = ["Файл сохранён. Извлечение текста из этого формата пока не подключено."];
  await mkdir(root, { recursive: true });
  const temporary = path.join(root, `.pending-${metadata.id}`);
  await mkdir(temporary);
  try {
    await writeFile(path.join(temporary, "original"), data);
    if (parsed) await writeFile(path.join(temporary, "parsed.json"), JSON.stringify(parsed));
    await writeFile(path.join(temporary, "metadata.json"), JSON.stringify(metadata));
    await rename(temporary, path.join(root, metadata.id));
  } catch (error) {
    await rm(temporary, { force: true, recursive: true });
    throw error;
  }
  return metadata;
}

export async function readDocument(id: string, parsed = false, root = storageRoot()) {
  if (!validId(id)) throw new DocumentError("Документ не найден.", 404);
  try {
    const metadata = JSON.parse(await readFile(path.join(root, id, "metadata.json"), "utf8")) as StoredDocument;
    if (parsed && metadata.status !== "parsed") throw new DocumentError("Извлечённый текст пока недоступен.", 404);
    return { metadata, data: await readFile(path.join(root, id, parsed ? "parsed.json" : "original")) };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") throw new DocumentError("Документ не найден.", 404);
    throw error;
  }
}

export function documentError(error: unknown) {
  return Response.json({ error: error instanceof DocumentError ? error.message : "Не удалось обратиться к хранилищу документов. Повторите попытку." },
    { status: error instanceof DocumentError ? error.status : 503 });
}

export async function readUpload(request: Request) {
  if (Number(request.headers.get("content-length")) > MAX_UPLOAD_BYTES) throw new DocumentError("Максимальный размер — 10 МиБ.", 413);
  const reader = request.body?.getReader();
  if (!reader) throw new DocumentError("Файл не передан.");
  const chunks: Uint8Array[] = [];
  let size = 0;
  let expired = false;
  const timer = setTimeout(() => { expired = true; void reader.cancel().catch(() => {}); }, 30000);
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (expired) throw new DocumentError("Время загрузки истекло. Повторите попытку.", 408);
      if (done) break;
      size += value.length;
      if (size > MAX_UPLOAD_BYTES) { await reader.cancel(); throw new DocumentError("Максимальный размер — 10 МиБ.", 413); }
      chunks.push(value);
    }
    return Buffer.concat(chunks);
  } finally { clearTimeout(timer); reader.releaseLock(); }
}
