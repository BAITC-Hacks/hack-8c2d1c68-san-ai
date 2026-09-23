import { createHash } from "node:crypto";
import path from "node:path";
import { unzipSync } from "fflate";
import { XMLParser, XMLValidator } from "fast-xml-parser";
import { getDocumentProxy } from "unpdf";
import { parseDocx, DocxParseError, type ParsedDocx } from "./docx-parser";
import type { DocumentSide } from "./document-sources";
import { MAX_UPLOAD_BYTES } from "../documents";

/** All parsers share the existing fragments boundary, regardless of file format. */
export type ParsedDocument = ParsedDocx;
export class DocumentParseError extends Error {}
const MAX_TEXT = 500_000;
const base = (data: Uint8Array, document: string, side: DocumentSide): ParsedDocument => ({
  document_id: `doc-${createHash("sha256").update(data).digest("hex")}`, document, side, fragments: [], warnings: [],
});

export async function parsePdf(data: Uint8Array, document: string, side: DocumentSide): Promise<ParsedDocument> {
  const result = base(data, document, side);
  let pdf: Awaited<ReturnType<typeof getDocumentProxy>> | undefined;
  let expired = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const work = async () => {
    pdf = await getDocumentProxy(new Uint8Array(data), { verbosity: 0 });
    if (expired) { await pdf.loadingTask.destroy(); throw new DocumentParseError("Время чтения PDF истекло."); }
    if (pdf.numPages > 200) throw new DocumentParseError("В PDF больше 200 страниц. Разделите документ.");
    let total = 0;
    const empty: number[] = [];
    for (let page = 1; page <= pdf.numPages; page++) {
      if (expired) throw new DocumentParseError("Время чтения PDF истекло.");
      const sheet = await pdf.getPage(page);
      const content = await sheet.getTextContent();
      let text = "";
      for (const item of content.items) {
        if ("str" in item) text += item.str + (item.hasEOL ? "\n" : " ");
      }
      sheet.cleanup();
      text = text.trim();
      total += text.length;
      if (total > MAX_TEXT) throw new DocumentParseError("Слишком много текста в PDF. Разделите документ.");
      if (!text) { empty.push(page); continue; }
      // Bounded fragments retain real page coordinates even for dense pages.
      for (let start = 0, part = 1; start < text.length; start += 6000, part++) result.fragments.push({
        document_id: result.document_id, document, side, fragment_id: `page-${page}-part-${part}`,
        text: text.slice(start, start + 6000), location: { format: "pdf", page },
      });
    }
    if (!result.fragments.length) throw new DocumentParseError("В PDF нет текстового слоя. Для скана потребуется OCR; загрузите текстовый PDF или DOCX.");
    result.warnings.push("Извлечён текст PDF по страницам. Изображения не распознаются; порядок текста в сложных таблицах требует проверки.");
    if (empty.length) result.warnings.push(`Страницы без извлечённого текста: ${empty.join(", ")}. Возможно, потребуется OCR.`);
    return result;
  };
  try {
    return await Promise.race([work(), new Promise<never>((_, reject) => {
      timer = setTimeout(() => { expired = true; reject(new DocumentParseError("Время чтения PDF истекло. Разделите документ.")); }, 30_000);
    })]);
  } catch (error) {
    if (error instanceof DocumentParseError) throw error;
    throw new DocumentParseError("Не удалось прочитать PDF. Проверьте файл и снимите защиту паролем, если она установлена.");
  } finally { clearTimeout(timer); if (pdf) await pdf.loadingTask.destroy().catch(() => {}); }
}

type Obj = Record<string, unknown>;
const obj = (v: unknown): Obj => v && typeof v === "object" && !Array.isArray(v) ? v as Obj : {};
const arr = (v: unknown): unknown[] => v === undefined ? [] : Array.isArray(v) ? v : [v];
const scalar = (v: unknown): string => typeof v === "string" || typeof v === "number" ? String(v) : String(obj(v)["#text"] ?? "");
function rich(v: unknown): string {
  const node = obj(v);
  return node.t !== undefined ? scalar(node.t) : arr(node.r).map(r => scalar(obj(r).t)).join("");
}
export function parseXlsx(data: Uint8Array, document: string, side: DocumentSide): ParsedDocument {
  const result = base(data, document, side);
  try {
    let expanded = 0;
    const archive = unzipSync(data, { filter: entry => {
      if (!/^xl\/.*\.(xml|rels)$/.test(entry.name)) return false;
      expanded += entry.originalSize;
      if (expanded > 16 * 1024 * 1024) throw new DocumentParseError("Содержимое XLSX слишком большое. Разделите книгу.");
      return true;
    } });
    const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "@", removeNSPrefix: true, parseTagValue: false, parseAttributeValue: false, trimValues: false });
    const read = (name: string) => {
      if (!archive[name]) throw new DocumentParseError("В XLSX отсутствует часть книги.");
      const xml = new TextDecoder().decode(archive[name]);
      if (/<!DOCTYPE|<!ENTITY/i.test(xml) || XMLValidator.validate(xml) !== true) throw new DocumentParseError("Некорректный XML в XLSX.");
      return obj(parser.parse(xml));
    };
    const workbook = obj(read("xl/workbook.xml").workbook);
    const relationships = arr(obj(read("xl/_rels/workbook.xml.rels").Relationships).Relationship).map(obj);
    const strings = archive["xl/sharedStrings.xml"] ? arr(obj(read("xl/sharedStrings.xml").sst).si).map(rich) : [];
    const sheets = arr(obj(workbook.sheets).sheet).map(obj);
    if (!sheets.length || sheets.length > 100) throw new DocumentParseError("В книге нет листов или их больше 100.");
    const warnings = new Set<string>(["Извлечены значения ячеек по листам. Формулы не пересчитываются; числовые форматы и даты сохранены как исходные значения. Изображения и диаграммы не анализируются."]);
    let total = 0;
    sheets.forEach((sheet, index) => {
      const name = scalar(sheet["@name"]);
      const rel = relationships.find(r => r["@Id"] === sheet["@id"]);
      if (!name || !rel || rel["@TargetMode"] === "External") throw new DocumentParseError("Не удалось определить лист XLSX.");
      const target = scalar(rel["@Target"]);
      const filename = path.posix.normalize(target.startsWith("/") ? target.slice(1) : `xl/${target}`);
      if (!filename.startsWith("xl/") || filename.includes("\\")) throw new DocumentParseError("Некорректная ссылка на лист XLSX.");
      const worksheet = obj(read(filename).worksheet);
      if (!Object.keys(worksheet).length) { warnings.add(`Лист «${name}» не является таблицей и пропущен.`); return; }
      if (sheet["@state"] && sheet["@state"] !== "visible") warnings.add(`Включён скрытый лист «${name}».`);
      for (const row of arr(obj(worksheet.sheetData).row).map(obj)) {
        const cells: {address: string; text: string}[] = [];
        for (const cell of arr(row.c).map(obj)) {
          const address = scalar(cell["@r"]);
          if (!/^[A-Z]{1,3}[1-9]\d{0,6}$/.test(address)) throw new DocumentParseError("В XLSX отсутствует корректный адрес ячейки.");
          let text = cell["@t"] === "inlineStr" ? rich(cell.is) : scalar(cell.v);
          if (cell["@t"] === "s") {
            if (!/^\d+$/.test(text) || strings[Number(text)] === undefined) throw new DocumentParseError("Повреждён текст ячейки XLSX.");
            text = strings[Number(text)];
          }
          if (cell.f !== undefined) {
            warnings.add("Книга содержит формулы: использованы сохранённые результаты, которые могут быть устаревшими.");
            if (!text) warnings.add(`Формула без сохранённого значения: ${name}!${address}.`);
          }
          if (text.trim()) cells.push({address, text});
        }
        if (!cells.length) continue;
        const text = cells.map(c => `${c.address}: ${c.text}`).join(" | ");
        total += text.length;
        if (total > MAX_TEXT || result.fragments.length >= 20_000 || text.length > 14000) throw new DocumentParseError("Слишком много данных в XLSX. Разделите книгу или длинные строки.");
        const range = cells.length === 1 ? cells[0].address : `${cells[0].address}:${cells.at(-1)!.address}`;
        result.fragments.push({ document_id: result.document_id, document, side,
          fragment_id: `sheet-${index + 1}-${range}`, text, location: { format: "xlsx", sheet: name, cells: range } });
      }
    });
    if (!result.fragments.length) throw new DocumentParseError("В XLSX нет читаемых значений ячеек.");
    result.warnings = [...warnings];
    return result;
  } catch (error) {
    if (error instanceof DocumentParseError) throw error;
    throw new DocumentParseError("Не удалось прочитать XLSX: файл повреждён, защищён или слишком большой.");
  }
}
export async function parseDocument(data: Uint8Array, name: string, side: DocumentSide): Promise<ParsedDocument> {
  if (!data.length || data.length > MAX_UPLOAD_BYTES) throw new DocumentParseError("Файл должен быть непустым и не больше 10 МиБ.");
  if (side !== "before" && side !== "after") throw new DocumentParseError("Укажите ДО или ПОСЛЕ.");
  try {
    if (/\.docx$/i.test(name)) return parseDocx(data, name, side);
    if (/\.pdf$/i.test(name)) return await parsePdf(data, name, side);
    if (/\.xlsx$/i.test(name)) return parseXlsx(data, name, side);
  } catch (error) { if (error instanceof DocxParseError) throw new DocumentParseError(error.message); throw error; }
  throw new DocumentParseError("Поддерживаются DOCX, PDF и XLSX.");
}
