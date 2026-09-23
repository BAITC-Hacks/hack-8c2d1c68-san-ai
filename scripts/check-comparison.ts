/** Real model verification on explicitly synthetic, evidence-verified inputs only. */
import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { comparisonFixture } from "../tests/helpers/comparison-fixtures";
import { saveDocument } from "../src/lib/server/document-store";
import { storedComparison } from "../src/lib/server/comparison-store";

async function main() {
  const root = await mkdtemp(path.join(tmpdir(), "san-comparison-live-"));
  try {
    const input = { before_ids: [] as string[], after_ids: [] as string[] };
    for (const side of ["before", "after"] as const) {
      const fixture = comparisonFixture(side);
      const document = await saveDocument(fixture.bytes, fixture.extraction.document, side, root);
      await writeFile(path.join(root, document.id, "extraction-v1.json"), JSON.stringify(fixture.extraction));
      input[`${side}_ids`].push(document.id);
    }
    const { result } = await storedComparison(input, { root, generate: true });
    const types = [...new Set(result.findings.map(f => f.type))].sort();
    if (types.length !== 5) console.error(JSON.stringify({ synthetic: true, absence_assessable: result.absence_assessable, review: result.matches.filter(m => m.status !== "matched") }));
    assert.deepEqual(types, ["conflict", "duplicated", "lost", "preserved", "transferred"]);
    const trainingIds = result.after.functions.filter(f => f.object === "обучение сотрудников").map(f => f.function_id);
    assert.ok(!result.findings.some(f => f.type === "duplicated" && f.after_entity_ids.some(id => trainingIds.includes(id))), "Different training scopes must not be flagged as duplicate");
    assert.equal(result.owner_groups.find(g => g.before_ids.includes(result.before.units[0].unit_id))?.status, "transformed");
    assert.equal((await storedComparison(input, { root, generate: false })).cached, true);
    assert.equal((await storedComparison(input, { root, generate: true })).cached, true);
    console.log(JSON.stringify({ synthetic: true, live_model: true, types, findings: result.findings.length, recommendations: result.recommendations.length, cache: true, evidence: "verified against parsed documents", current: result.before.state, after: result.after.state }));
  } finally { await rm(root, { recursive: true, force: true }); }
}
main().catch((error: unknown) => { console.error(error instanceof Error ? error.message : "Synthetic comparison check failed"); process.exitCode = 1; });
