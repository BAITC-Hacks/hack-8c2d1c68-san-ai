import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { zipSync, strToU8 } from "fflate";
import { saveDocument, listDocuments, readDocument, readUpload, DocumentError, documentError } from "../src/lib/server/document-store";
import { MAX_UPLOAD_BYTES } from "../src/lib/documents";
const fixture = () => zipSync({ "word/document.xml": strToU8('<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>1.1. Контроль качества</w:t></w:r></w:p></w:body></w:document>') });

test("stores originals, metadata and parsed text across independent reads; same names never overwrite", async () => {
 const root = await mkdtemp(path.join(tmpdir(), "san-files-"));
 try {
  assert.deepEqual(await listDocuments(root), []);
  const bytes = fixture();
  const before = await saveDocument(bytes, "Положение.docx", "before", root);
  const after = await saveDocument(bytes, "Положение.docx", "after", root);
  assert.notEqual(before.id, after.id);
  assert.equal(before.status, "parsed");
  assert.equal(before.fragment_count, 1);
  assert.equal((await listDocuments(root)).length, 2);
  assert.deepEqual((await readDocument(before.id, false, root)).data, Buffer.from(bytes));
  const parsed = JSON.parse((await readDocument(after.id, true, root)).data.toString());
  assert.equal(parsed.side, "after");
  assert.equal(parsed.fragments[0].text, "1.1. Контроль качества");
  await assert.rejects(readDocument("../secret", false, root), (e: unknown) => e instanceof DocumentError && e.status === 404);
 } finally { await rm(root, { recursive:true, force:true }); }
});

test("PDF is honestly stored without extraction; invalid DOCX retains original with parse error", async () => {
 const root = await mkdtemp(path.join(tmpdir(), "san-files-"));
 try {
  const pdf = await saveDocument(strToU8("%PDF-1.7\nsynthetic"), "test.pdf", "before", root);
  assert.equal(pdf.status, "stored");
  await assert.rejects(readDocument(pdf.id, true, root), DocumentError);
  const invalid = await saveDocument(zipSync({ "other": strToU8("test") }), "test.docx", "after", root);
  assert.equal(invalid.status, "parse_error");
  assert.ok((await readDocument(invalid.id, false, root)).data.length > 0);
 } finally { await rm(root, { recursive:true, force:true }); }
});

test("rejects paths, unsupported formats, incorrect side, empty and mismatched contents", async () => {
 const root = await mkdtemp(path.join(tmpdir(), "san-files-"));
 try {
  for (const [name, side] of [["../test.docx","before"],["test.exe","after"],["test.docx","other"],["bad\\name.docx","before"]]) {
    await assert.rejects(saveDocument(fixture(), name, side, root), DocumentError);
  }
  await assert.rejects(saveDocument(new Uint8Array(), "test.docx", "before", root), DocumentError);
  await assert.rejects(saveDocument(strToU8("fake PDF"), "test.pdf", "before", root), DocumentError);
  assert.deepEqual(await listDocuments(root), []);
 } finally { await rm(root, { recursive:true, force:true }); }
});

test("stream limit works without Content-Length and storage errors do not leak paths", async () => {
 const request = new Request("http://localhost/api/documents", { method: "POST", body: new Uint8Array(MAX_UPLOAD_BYTES + 1) });
 await assert.rejects(readUpload(request), (e: unknown) => e instanceof DocumentError && e.status === 413);
 assert.equal((await readUpload(new Request("http://localhost", { method:"POST", body:"hello" }))).toString(), "hello");
 const response = documentError(new Error("/private/secret"));
 assert.equal(response.status,503);
 assert.ok(!(await response.text()).includes("/private"));
});
