import { test } from "node:test";
import assert from "node:assert/strict";
import { bundleKey, bundleReady, extractionKey, findingCount, createdUnitCount } from "../src/lib/analysis-flow";
import { comparisonFixture, fixtureProvider } from "./helpers/comparison-fixtures";
import { compareOrganizations } from "../src/lib/server/comparison";
import type { StoredDocument } from "../src/lib/documents";
const doc = (id: string, side: "before" | "after", status: StoredDocument["status"] = "parsed"): StoredDocument => ({ id, side, status, name: `${id}.docx`, format: "docx", size: 100, created_at: "2026-09-23", fragment_count: 1, warnings: [] });
test("bundle readiness requires both valid sides; add/remove and extraction refresh invalidate views", () => {
  const docs = [doc("8", "before"), doc("9", "after")];
  assert.equal(bundleReady(docs), true);
  assert.equal(bundleReady([docs[0]]), false);
  assert.equal(bundleReady([...docs, doc("broken", "after", "parse_error")]), false);
  assert.equal(bundleKey(docs), bundleKey([...docs].reverse()));
  assert.notEqual(bundleKey(docs), bundleKey([...docs, doc("appendix", "before")]));
  const extraction = comparisonFixture("before").extraction;
  assert.notEqual(extractionKey(docs, { "8": extraction }), extractionKey(docs, { "8": { ...extraction, created_at: "2026-09-24" } }));
});
test("incomplete, identical and unassessable analysis never render unknown metrics as zero", async () => {
  const result = await compareOrganizations([comparisonFixture("before").extraction], [comparisonFixture("after").extraction], undefined, fixtureProvider, "synthetic");
  assert.equal(findingCount(result, "lost"), 1);
  assert.equal(createdUnitCount(result), 1);
  assert.equal(findingCount({ ...result, absence_assessable: false }, "lost"), null);
  assert.equal(createdUnitCount({ ...result, absence_assessable: false }), null);
  for (const flags of [{ analysis_complete: false }, { identical_sources: true }]) {
    for (const type of ["lost", "transferred", "duplicated", "conflict"] as const) assert.equal(findingCount({ ...result, ...flags }, type), null);
    assert.equal(createdUnitCount({ ...result, ...flags }), null);
  }
});
