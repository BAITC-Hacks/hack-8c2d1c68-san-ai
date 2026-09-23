import { zipSync, strToU8 } from "fflate";
import { parseDocx } from "../../src/lib/server/docx-parser";
import { validateExtraction } from "../../src/lib/server/extraction";
import type { ExtractionResult } from "../../src/lib/extraction";
import type { JsonRequest } from "../../src/lib/server/openai-json";

export function comparisonFixture(side: "before" | "after") {
  const audit = side === "before" ? "Отдел аудита" : "Отдел внутреннего аудита";
  const ops = "Операционный отдел";
  const descriptions: { owner: string; action: string; object: string; modality: string; scope?: string }[] = side === "before" ? [
    { owner: audit, action: "проверять", object: "качество отчётности", modality: "duty" },
    { owner: ops, action: "вести", object: "реестр рисков", modality: "duty" },
    { owner: audit, action: "контролировать", object: "инвестиционную программу", modality: "duty" },
    { owner: audit, action: "утверждать", object: "платежи", modality: "prohibition" },
  ] : [
    { owner: audit, action: "оценивать", object: "качество отчётов", modality: "duty" },
    { owner: audit, action: "вести", object: "реестр рисков", modality: "duty" },
    { owner: audit, action: "вести", object: "реестр поставщиков", modality: "duty" },
    { owner: ops, action: "вести", object: "реестр поставщиков", modality: "duty" },
    { owner: audit, action: "утверждать", object: "платежи", modality: "prohibition" },
    { owner: audit, action: "утверждать", object: "платежи", modality: "duty" },
    { owner: audit, action: "организовывать", object: "обучение сотрудников", modality: "duty", scope: "только сотрудники Отдела внутреннего аудита" },
    { owner: ops, action: "организовывать", object: "обучение сотрудников", modality: "duty", scope: "только сотрудники Операционного отдела" },
  ];
  const names = [audit, ops, ...(side === "after" ? ["Отдел методологии"] : [])];
  const paragraphs = ["Синтетический контрольный комплект. Все сведения вымышлены.",
    ...names.map(name => `${name} — самостоятельное подразделение компании.`),
    ...(side === "after" ? ["Отдел аудита переименован в Отдел внутреннего аудита, правопреемственность сохранена."] : []),
    ...descriptions.map(f => `${f.owner}: ${f.modality === "prohibition" ? "запрещено" : "обязан"} ${f.action} ${f.object}; область: ${f.scope ?? "вся компания"}.`)];
  const xml = `<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${paragraphs.map(t => `<w:p><w:r><w:t>${t}</w:t></w:r></w:p>`).join("")}</w:body></w:document>`;
  const bytes = zipSync({ "word/document.xml": strToU8(xml) });
  const name = `synthetic-${side}.docx`;
  const parsed = parseDocx(bytes, name, side);
  const citation = (index: number) => ({ fragment_id: parsed.fragments[index].fragment_id, quote: paragraphs[index] });
  const raw = { units: names.map((name, i) => ({ unit_name: name, entity_type: "unit", parent_unit: null, evidence: [citation(i + 1), ...(side === "after" && i === 0 ? [citation(4)] : [])] })),
    functions: descriptions.map((f, i) => ({ unit_name: f.owner, action: f.action, object: f.object, scope: f.scope ?? "вся компания", conditions: null, responsibility_type: "execution", modality: f.modality,
      evidence: [citation(paragraphs.length - descriptions.length + i)] })) };
  const validated = validateExtraction(raw, parsed.fragments);
  const extraction: ExtractionResult = { schema_version: "extraction-v1", document_id: parsed.document_id, document: name, side, model: "synthetic-fixture", created_at: "2026-09-23T00:00:00Z", review_required: true,
    processed_fragments: parsed.fragments.length, rejected_items: 0, warnings: parsed.warnings, units: validated.units, functions: validated.functions };
  return { bytes, parsed, extraction };
}

/** Deterministic provider for boundary tests, never used by the application. */
export async function fixtureProvider(request: JsonRequest): Promise<unknown> {
  const input = JSON.parse(request.input);
  if (request.schemaName === "comparison_owners") {
    return { groups: [
      { entity_type: "unit", before_ids: [input.before[0].id], after_ids: [input.after[0].id], confidence: 0.95, reason: "В источнике ПОСЛЕ прямо указано переименование отдела аудита." },
      { entity_type: "unit", before_ids: [input.before[1].id], after_ids: [input.after[1].id], confidence: 0.95, reason: "Операционный отдел сохранён." },
      ...input.after.slice(2).map((owner: { id: string }) => ({ entity_type: "unit", before_ids: [], after_ids: [owner.id], confidence: 0.9, reason: "В исходном комплекте подразделение не найдено." })),
    ] };
  }
  if (request.schemaName === "comparison_matches") {
    return { matches: input.target_before.map((b: { id: string; object: string; modality: string }) => {
      const equivalent = (text: string) => text === "качество отчётов" ? "качество отчётности" : text;
      const after_ids = input.all_after.filter((a: { object: string; modality: string }) => equivalent(a.object) === equivalent(b.object) && a.modality === b.modality).map((a: { id: string }) => a.id);
      return { before_id: b.id, after_ids, relation: after_ids.length ? "equivalent" : "not_found", confidence: 0.95, reason: after_ids.length ? "Действие, объект и область ответственности совпадают." : "В выбранных функциях ПОСЛЕ нет контроля инвестиционной программы." };
    }) };
  }
  if (request.schemaName === "comparison_risks") {
    const registry = input.all_after.filter((a: { object: string }) => a.object === "реестр поставщиков");
    const payments = input.all_after.filter((a: { object: string }) => a.object === "платежи");
    return { risks: [
      { type: "duplicated", first_id: registry[0].id, second_id: registry[1].id, confidence: 0.95, reason: "Ведение одного реестра всей компании назначено двум независимым отделам." },
      { type: "conflict", first_id: payments[0].id, second_id: payments[1].id, confidence: 0.95, reason: "Одному отделу одновременно запрещено и предписано утверждать платежи." },
    ].filter(r => input.target_ids.includes(r.first_id)) };
  }
  throw new Error("Unexpected test stage");
}
