import { createHash } from "node:crypto";
import { unzipSync } from "fflate";
import { XMLParser, XMLValidator } from "fast-xml-parser";
import type { DocumentSide, SourceFragment } from "./document-sources";

export const MAX_DOCX_BYTES = 10 * 1024 * 1024;
const MAX_XML_BYTES = 8 * 1024 * 1024;

export class DocxParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DocxParseError";
  }
}

export interface ParsedDocx {
  document_id: string;
  document: string;
  side: DocumentSide;
  fragments: SourceFragment[];
  warnings: string[];
}

type XmlNode = { [key: string]: XmlNode[] | string };

function children(node: XmlNode, tag: string): XmlNode[] {
  const value = node[tag];
  return Array.isArray(value) ? value : [];
}

/** Text of one paragraph: fields' displayed values count; field instructions do not. */
function paragraphText(nodes: XmlNode[]): string {
  const output: string[] = [];
  const stack = [...nodes].reverse();
  while (stack.length) {
    const node = stack.pop()!;
    const tag = Object.keys(node).find((key) => key !== ":@");
    if (!tag || ["del", "moveFrom", "instrText", "p", "pPr", "rPr"].includes(tag)) continue;
    if (tag === "t") {
      for (const child of children(node, tag)) {
        if (typeof child["#text"] === "string") output.push(child["#text"]);
      }
    } else if (tag === "tab") output.push("\t");
    else if (tag === "br" || tag === "cr") output.push("\n");
    else if (tag === "noBreakHyphen") output.push("\u2011");
    else if (tag === "softHyphen") output.push("\u00ad");
    else stack.push(...children(node, tag).slice().reverse());
  }
  return output.join("");
}

/** Local-only DOCX parsing; does not infer units, functions or changes. */
export function parseDocx(
  data: Uint8Array,
  document: string,
  side: DocumentSide,
): ParsedDocx {
  if (!document.toLowerCase().endsWith(".docx")) {
    throw new DocxParseError("Ожидается файл .docx.");
  }
  if (side !== "before" && side !== "after") throw new DocxParseError("Укажите before или after.");
  if (!data.length || data.length > MAX_DOCX_BYTES) {
    throw new DocxParseError("DOCX должен быть непустым и не превышать 10 МиБ.");
  }
  let xml: string;
  try {
    const archive = unzipSync(data, {
      filter: (entry) => {
        if (entry.name !== "word/document.xml") return false;
        if (entry.originalSize > MAX_XML_BYTES) throw new Error("XML too large");
        return true;
      },
    });
    const body = archive["word/document.xml"];
    if (!body || body.length > MAX_XML_BYTES) throw new Error("Missing document");
    xml = new TextDecoder("utf-8", { fatal: true }).decode(body);
  } catch {
    throw new DocxParseError("Не удалось прочитать DOCX: повреждённый, зашифрованный или слишком большой документ.");
  }
  if (/<!DOCTYPE|<!ENTITY/i.test(xml) || XMLValidator.validate(xml) !== true) {
    throw new DocxParseError("Некорректный или неподдерживаемый XML внутри DOCX.");
  }
  const parser = new XMLParser({
    preserveOrder: true,
    removeNSPrefix: true,
    ignoreAttributes: true,
    parseTagValue: false,
    trimValues: false,
  });
  let nodes: XmlNode[];
  try {
    nodes = parser.parse(xml) as XmlNode[];
  } catch {
    throw new DocxParseError("Не удалось разобрать содержимое DOCX.");
  }
  const root = nodes.find((node) => "document" in node);
  const body = root && children(root, "document").find((node) => "body" in node);
  if (!body) throw new DocxParseError("В DOCX отсутствует основной текст документа.");

  const document_id = `doc-${createHash("sha256").update(data).digest("hex")}`;
  const fragments: SourceFragment[] = [];
  const warnings = new Set<string>([
    "Извлечён основной текст, включая абзацы таблиц. Колонтитулы, сноски, изображения и вложения не анализируются. Номера страниц не определяются.",
  ]);
  const stack = children(body, "body").slice().reverse();
  let paragraph = 0;
  while (stack.length) {
    const node = stack.pop()!;
    const tag = Object.keys(node).find((key) => key !== ":@");
    if (!tag) continue;
    if (["del", "moveFrom", "ins", "moveTo"].includes(tag)) {
      warnings.add("Документ содержит правки: удалённый текст исключён, вставки включены. Требуется проверка принятой редакции.");
      if (tag === "del" || tag === "moveFrom") continue;
    }
    if (tag === "numPr") warnings.add("Автоматическая нумерация Word не восстановлена; используйте номера абзацев.");
    if (tag === "p") {
      paragraph++;
      const text = paragraphText(children(node, tag));
      if (text.trim()) {
        const section = /^\s*(\d+(?:\.\d+)*)(?:\.(?=\s)|(?=\s))/u.exec(text)?.[1];
        fragments.push({
          document_id, document, side, fragment_id: `paragraph-${paragraph}`, text,
          location: { format: "docx", paragraph, ...(section ? { section } : {}) },
        });
      }
    }
    stack.push(...children(node, tag).slice().reverse());
  }
  if (!fragments.length) throw new DocxParseError("В документе нет читаемого текста. Для изображений потребуется OCR.");
  return { document_id, document, side, fragments, warnings: [...warnings] };
}
