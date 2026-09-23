import { comparisonModel } from "./ai-models";
import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import type { ComparisonResult } from "../comparison";
import type { ExtractionResult } from "../extraction";
import { comparisonId, compareOrganizations, prepareComparison } from "./comparison";
import { DocumentError, readDocument, storageRoot } from "./document-store";
import type { ParsedDocument } from "./document-parser";
import { AiError, type JsonRequest } from "./openai-json";

export interface ComparisonSelection { before_ids: string[]; after_ids: string[] }
export function validateSelection(value: unknown): ComparisonSelection {
  if (!value || typeof value !== "object") throw new DocumentError("Выберите документы ДО и ПОСЛЕ.");
  const input = value as Record<string, unknown>;
  for (const key of ["before_ids", "after_ids"]) {
    const ids = input[key];
    if (!Array.isArray(ids) || !ids.length || ids.length > 10 || ids.some(id => typeof id !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(id))) throw new DocumentError("Выберите от 1 до 10 загруженных документов каждой стороны.");
  }
  const selection = input as unknown as ComparisonSelection;
  const all = [...selection.before_ids, ...selection.after_ids];
  if (new Set(all).size !== all.length) throw new DocumentError("Документы в выборе не должны повторяться.");
  return selection;
}
const globalState = globalThis as typeof globalThis & { comparisonLocks?: Set<string> };
const locks = globalState.comparisonLocks ??= new Set<string>();

async function loadInputs(selection: ComparisonSelection, root: string) {
  const links: ComparisonResult["document_links"] = [];
  async function load(ids: string[], side: "before" | "after") {
    return Promise.all(ids.map(async id => {
      const { metadata, data } = await readDocument(id, true, root);
      if (metadata.side !== side) throw new DocumentError("Документ выбран не на своей стороне.");
      const parsed = JSON.parse(data.toString()) as ParsedDocument;
      let extracted: ExtractionResult;
      try { extracted = JSON.parse(await readFile(path.join(root, id, "extraction-v1.json"), "utf8")); }
      catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") throw new DocumentError(`Сначала извлеките функции: ${metadata.name}.`, 422); throw error; }
      if (extracted.document_id !== parsed.document_id || extracted.side !== side || extracted.processed_fragments !== parsed.fragments.length) throw new DocumentError("Извлечение не соответствует документу или выполнено не полностью. Обновите извлечение.", 422);
      // Recheck cached evidence against parser-owned text, not model-owned strings.
      for (const entity of [...extracted.units, ...extracted.functions]) for (const source of entity.evidence) {
        const fragment = parsed.fragments.find(f => f.fragment_id === source.fragment_id);
        if (!fragment || source.document_id !== parsed.document_id || source.side !== side || source.text !== fragment.text
          || !Number.isInteger(source.start) || !Number.isInteger(source.end) || source.start < 0 || source.end <= source.start
          || fragment.text.slice(source.start, source.end) !== source.quote || !source.quote
          || JSON.stringify(source.location) !== JSON.stringify(fragment.location)) throw new DocumentError("Источники извлечения не совпадают с документом. Обновите извлечение.", 422);
      }
      links.push({ document_id: parsed.document_id, side, storage_id: id });
      return extracted;
    }));
  }
  const [before, after] = await Promise.all([load(selection.before_ids, "before"), load(selection.after_ids, "after")]);
  links.sort((a, b) => a.storage_id.localeCompare(b.storage_id));
  return { before, after, links };
}

export async function storedComparison(selectionValue: unknown, options: { generate: boolean; refresh?: boolean; signal?: AbortSignal; root?: string; model?: string; provider?: (request: JsonRequest) => Promise<unknown> }) {
  const selection = validateSelection(selectionValue);
  const root = options.root ?? storageRoot();
  const inputs = await loadInputs(selection, root);
  prepareComparison(inputs.before, inputs.after);
  const model = options.model ?? comparisonModel();
  const id = comparisonId(inputs.before, inputs.after, model);
  const directory = path.join(root, ".comparisons");
  const filename = path.join(directory, `${id}.json`);
  try {
    const result = JSON.parse(await readFile(filename, "utf8")) as ComparisonResult;
    if (result.schema_version !== "comparison-v1" || result.comparison_id !== id) throw new Error("Invalid comparison cache");
    if (!options.refresh) return { result: { ...result, document_links: inputs.links }, cached: true };
  } catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
  if (!options.generate) throw new DocumentError("Для этого комплекта сравнение ещё не выполнено.", 404);
  const lockId = `${root}:${id}`;
  if (locks.has(lockId)) throw new DocumentError("Этот комплект уже сравнивается. Дождитесь завершения и откройте результат.", 409);
  if (locks.size >= 2) throw new DocumentError("Сервер уже выполняет сравнение. Повторите попытку позже.", 429);
  locks.add(lockId);
  try {
    const result = await compareOrganizations(inputs.before, inputs.after, options.signal, options.provider, model);
    result.document_links = inputs.links;
    // Do not publish a result if extraction changed while the model was working.
    const latest = await loadInputs(selection, root);
    if (comparisonId(latest.before, latest.after, model) !== id) throw new DocumentError("Извлечение обновилось во время сравнения. Запустите сравнение заново.", 409);
    options.signal?.throwIfAborted();
    await mkdir(directory, { recursive: true });
    const temporary = `${filename}.${randomUUID()}.tmp`;
    try { await writeFile(temporary, JSON.stringify(result)); await rename(temporary, filename); }
    finally { await rm(temporary, { force: true }); }
    return { result, cached: false };
  } finally { locks.delete(lockId); }
}

export function comparisonError(error: unknown) {
  if (error instanceof AiError || error instanceof DocumentError) return Response.json({ error: error.message }, { status: error.status });
  if (error instanceof Error && ["AbortError", "TimeoutError"].includes(error.name)) return Response.json({ error: "Сравнение остановлено или время ожидания истекло. Частичный результат не сохранён." }, { status: 504 });
  return Response.json({ error: "Не удалось выполнить сравнение. Проверьте доступность сервера и повторите попытку." }, { status: 503 });
}
