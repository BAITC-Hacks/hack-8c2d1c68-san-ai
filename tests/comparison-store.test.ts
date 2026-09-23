import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { comparisonError, storedComparison, validateSelection } from "../src/lib/server/comparison-store";
import { DocumentError, saveDocument } from "../src/lib/server/document-store";
import { comparisonFixture, fixtureProvider } from "./helpers/comparison-fixtures";
import { POST } from "../src/app/api/comparisons/route";

async function storedPair(root: string) {
  const ids: string[] = [];
  for (const side of ["before", "after"] as const) {
    const f = comparisonFixture(side);
    const document = await saveDocument(f.bytes, f.extraction.document, side, root);
    await writeFile(path.join(root, document.id, "extraction-v1.json"), JSON.stringify(f.extraction));
    ids.push(document.id);
  }
  return { before_ids: [ids[0]], after_ids: [ids[1]] };
}

test("saved comparison is reloadable, has original document links and invalidates after extraction changes", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "comparison-store-"));
  try {
    const selection = await storedPair(root);
    const options = { root, model: "synthetic", provider: fixtureProvider };
    await assert.rejects(storedComparison(selection, { ...options, generate: false }), (error: unknown) => error instanceof DocumentError && error.status === 404);
    const fresh = await storedComparison(selection, { ...options, generate: true });
    assert.equal(fresh.cached, false); assert.equal(fresh.result.document_links.length, 2);
    assert.equal(fresh.result.document_links.find(d => d.side === "before")!.storage_id, selection.before_ids[0]);
    const cached = await storedComparison(selection, { ...options, generate: true, provider: async () => { throw new Error("must not call AI for cache"); } });
    assert.equal(cached.cached, true); assert.deepEqual(cached.result, fresh.result);
    const file = path.join(root, selection.after_ids[0], "extraction-v1.json");
    const extraction = JSON.parse(await readFile(file, "utf8")); extraction.created_at = "updated";
    await writeFile(file, JSON.stringify(extraction));
    await assert.rejects(storedComparison(selection, { ...options, generate: false }), (error: unknown) => error instanceof DocumentError && error.status === 404);
    const next = await storedComparison(selection, { ...options, generate: true });
    assert.notEqual(next.result.comparison_id, fresh.result.comparison_id);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("wrong side and tampered cached source fail before external calls", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "comparison-source-"));
  try {
    const selection = await storedPair(root);
    await assert.rejects(storedComparison({ before_ids: selection.after_ids, after_ids: selection.before_ids }, { root, generate: true }), /не на своей стороне/);
    const file = path.join(root, selection.after_ids[0], "extraction-v1.json");
    const extraction = JSON.parse(await readFile(file, "utf8"));
    extraction.functions[0].evidence[0].location.paragraph = 999;
    await writeFile(file, JSON.stringify(extraction));
    await assert.rejects(storedComparison(selection, { root, generate: true }), /Источники извлечения/);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("failed or changed-in-flight comparison is not published and its lock is released", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "comparison-atomic-"));
  try {
    const selection = await storedPair(root);
    let changed = false;
    await assert.rejects(storedComparison(selection, { root, generate: true, provider: async request => {
      if (!changed) {
        changed = true;
        const file = path.join(root, selection.after_ids[0], "extraction-v1.json");
        const extraction = JSON.parse(await readFile(file, "utf8")); extraction.created_at = "changed-during-comparison";
        await writeFile(file, JSON.stringify(extraction));
      }
      return fixtureProvider(request);
    } }), /обновилось во время/);
    assert.ok(!(await readdir(root)).includes(".comparisons"));
    await assert.rejects(storedComparison(selection, { root, generate: true, provider: async () => { throw new Error("provider failure"); } }), /provider failure/);
    assert.ok(!(await readdir(root)).includes(".comparisons"));
    assert.equal((await storedComparison(selection, { root, generate: true, provider: fixtureProvider })).cached, false);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("selection rejects traversal/duplicates; endpoint rejects foreign origins and malformed/oversize JSON", async () => {
  assert.throws(() => validateSelection({ before_ids: ["../env"], after_ids: ["x"] }), DocumentError);
  const id = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
  assert.throws(() => validateSelection({ before_ids: [id], after_ids: [id] }), /повторяться/);
  assert.equal((await POST(new Request("http://localhost/api/comparisons", { method: "POST", headers: { origin: "http://foreign", host: "localhost" }, body: "{}" }))).status, 403);
  assert.equal((await POST(new Request("http://localhost/api/comparisons", { method: "POST", body: "{" }))).status, 400);
  assert.equal((await POST(new Request("http://localhost/api/comparisons", { method: "POST", body: "x".repeat(5000) }))).status, 413);
  const response = comparisonError(new Error("/private/secret"));
  assert.equal(response.status, 503); assert.ok(!(await response.text()).includes("/private"));
});
