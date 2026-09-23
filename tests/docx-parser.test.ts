import { test } from "node:test";
import assert from "node:assert/strict";
import { zipSync, strToU8 } from "fflate";
import { parseDocx, DocxParseError, MAX_DOCX_BYTES } from "../src/lib/server/docx-parser";
import { verifySource } from "../src/lib/server/document-sources";

function fixture(body: string) {
  return zipSync({ "word/document.xml": strToU8(
    `<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${body}</w:body></w:document>`,
  ) });
}

test("preserves split runs, Cyrillic, entities, tabs and paragraph coordinates", () => {
  const result = parseDocx(fixture(
    '<w:p/><w:p><w:r><w:t>5.8.1. Аудиторы не </w:t></w:r><w:r><w:t>имеют права &amp; обязанности</w:t><w:tab/><w:t>123</w:t><w:br/><w:t>продолжение</w:t></w:r></w:p>',
  ), "synthetic.docx", "before");
  assert.equal(result.fragments.length, 1);
  const fragment = result.fragments[0];
  assert.equal(fragment.text, "5.8.1. Аудиторы не имеют права & обязанности\t123\nпродолжение");
  assert.deepEqual(fragment.location, { format: "docx", paragraph: 2, section: "5.8.1" });
  assert.ok(verifySource(result.fragments, {
    document_id: result.document_id, side: "before", fragment_id: fragment.fragment_id,
    quote: "Аудиторы не имеют права & обязанности",
  }).ok);
});

test("keeps table paragraphs in document order", () => {
  const p = (text: string) => `<w:p><w:r><w:t>${text}</w:t></w:r></w:p>`;
  const result = parseDocx(fixture(
    `${p("Начало")}<w:tbl><w:tr><w:tc>${p("Ячейка A")}</w:tc><w:tc>${p("Ячейка B")}</w:tc></w:tr></w:tbl>${p("Конец")}`,
  ), "synthetic.docx", "after");
  assert.deepEqual(result.fragments.map((f) => f.text), ["Начало", "Ячейка A", "Ячейка B", "Конец"]);
});

test("excludes deleted text and field instructions, includes inserted and displayed text", () => {
  const result = parseDocx(fixture(
    '<w:p><w:del><w:r><w:delText>Удалено</w:delText></w:r></w:del><w:ins><w:r><w:t>Вставлено</w:t></w:r></w:ins><w:r><w:instrText>SECRET_FIELD</w:instrText><w:t> результат</w:t></w:r></w:p>',
  ), "synthetic.docx", "before");
  assert.equal(result.fragments[0].text, "Вставлено результат");
  assert.ok(result.warnings.some((w) => w.includes("правки")));
});

test("warns about automatic numbering instead of fabricating a section", () => {
  const result = parseDocx(fixture(
    '<w:p><w:pPr><w:numPr><w:numId w:val="1"/></w:numPr></w:pPr><w:r><w:t>Функция</w:t></w:r></w:p>',
  ), "synthetic.docx", "before");
  assert.ok(result.warnings.some((w) => w.includes("нумерация")));
  assert.ok(!("section" in result.fragments[0].location));
});

test("identity is deterministic and content-based, side remains separate", () => {
  const data = fixture('<w:p><w:r><w:t>Текст</w:t></w:r></w:p>');
  const before = parseDocx(data, "same.docx", "before");
  const after = parseDocx(data, "renamed.docx", "after");
  assert.equal(before.document_id, after.document_id);
  assert.equal(after.fragments[0].side, "after");
  assert.notEqual(before.document_id, parseDocx(fixture('<w:p><w:r><w:t>Другой</w:t></w:r></w:p>'), "same.docx", "before").document_id);
});

test("rejects invalid, empty, oversized and non-DOCX inputs", () => {
  for (const data of [new Uint8Array(), strToU8("not a zip"), fixture(""),
    new Uint8Array(MAX_DOCX_BYTES + 1), zipSync({ "other.xml": strToU8("x") }),
    fixture('<w:p><w:t>broken</w:p>'),
  ]) assert.throws(() => parseDocx(data, "bad.docx", "before"), DocxParseError);
  assert.throws(() => parseDocx(fixture(""), "bad.pdf", "before"), DocxParseError);
});

test("rejects entity declarations and oversized decompressed XML", () => {
  for (const xml of [
    '<!DOCTYPE test [<!ENTITY x "value">]><test>&x;</test>',
    " ".repeat(8 * 1024 * 1024 + 1),
  ]) {
    assert.throws(() => parseDocx(zipSync({ "word/document.xml": strToU8(xml) }), "bad.docx", "before"), DocxParseError);
  }
});
