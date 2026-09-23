import { before, test } from "node:test";
import assert from "node:assert/strict";
import type { SourceClaim, SourceFragment } from "../src/lib/server/document-sources";

// URL import also allows running this isolated module without installed dependencies.
let verifySource: typeof import("../src/lib/server/document-sources").verifySource;
before(async () => {
  ({ verifySource } = await import(
    new URL("../src/lib/server/document-sources.ts", import.meta.url).href
  ));
});

const fragment: SourceFragment = {
  document_id: "document-1",
  document: "synthetic-before.pdf",
  side: "before",
  fragment_id: "p2-4.1",
  text: "4.1. Департамент обеспечивает\n  контроль\u00a0качества аудита.",
  location: { format: "pdf", page: 2, section: "4.1" },
};
const claim: SourceClaim = {
  document_id: fragment.document_id,
  side: "before",
  fragment_id: fragment.fragment_id,
  quote: "обеспечивает контроль качества аудита.",
};

test("citation retains actual parser location and original whitespace", () => {
  const result = verifySource([fragment], claim);
  assert.ok(result.ok);
  assert.deepEqual(result.source.location, fragment.location);
  assert.equal(result.source.quote, "обеспечивает\n  контроль\u00a0качества аудита.");
  assert.equal(fragment.text.slice(result.source.start, result.source.end), result.source.quote);
});

test("invented text and empty citations are rejected", () => {
  for (const quote of ["", " \n\t"]) {
    assert.deepEqual(verifySource([fragment], { ...claim, quote }), {
      ok: false, reason: "empty_quote",
    });
  }
  assert.deepEqual(verifySource([fragment], { ...claim, quote: "Осуществляет закупки" }), {
    ok: false, reason: "quote_not_found",
  });
});

test("document, side and fragment must all match, including identical filenames", () => {
  for (const change of [
    { document_id: "other" }, { side: "after" as const }, { fragment_id: "p9" },
  ]) {
    assert.deepEqual(verifySource([fragment], { ...claim, ...change }), {
      ok: false, reason: "source_not_found",
    });
  }
});

test("duplicate source identities are rejected instead of choosing arbitrary evidence", () => {
  assert.deepEqual(verifySource([fragment, { ...fragment, text: "Другой текст" }], claim), {
    ok: false, reason: "ambiguous_source",
  });
});

test("negation inside a quote is not removed or normalized", () => {
  const restriction = { ...fragment, text: "Аудиторы не имеют права внедрять процессы." };
  assert.deepEqual(verifySource([restriction], {
    ...claim, quote: "Аудиторы имеют права внедрять процессы.",
  }), { ok: false, reason: "quote_not_found" });
});

test("DOCX and XLSX evidence has native locations, without fabricated pages", () => {
  for (const location of [
    { format: "docx" as const, paragraph: 12, section: "4.1" },
    { format: "xlsx" as const, sheet: "Функции", cells: "B2:D2" },
  ]) {
    const result = verifySource([{ ...fragment, location }], claim);
    assert.ok(result.ok);
    assert.deepEqual(result.source.location, location);
    assert.ok(!("page" in result.source.location));
  }
});

test("UTF-16 offsets correctly preserve Cyrillic and emoji", () => {
  const result = verifySource([{ ...fragment, text: "📄 Контроль\nкачества" }], {
    ...claim, quote: "Контроль качества",
  });
  assert.ok(result.ok);
  assert.equal(result.source.start, 3);
  assert.equal(result.source.quote, "Контроль\nкачества");
});
