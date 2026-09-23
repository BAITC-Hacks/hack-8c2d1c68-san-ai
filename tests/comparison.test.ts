import { test } from "node:test";
import assert from "node:assert/strict";
import { comparisonId, compareOrganizations, prepareComparison } from "../src/lib/server/comparison";
import { AiError } from "../src/lib/server/openai-json";
import { comparisonFixture, fixtureProvider } from "./helpers/comparison-fixtures";

const pair = () => ({ before: comparisonFixture("before").extraction, after: comparisonFixture("after").extraction });
test("comparison covers preserved, transferred, lost, duplicated, conflict with evidence and proposed recommendations", async () => {
  const { before, after } = pair();
  const original = JSON.stringify([before, after]);
  const result = await compareOrganizations([before], [after], undefined, fixtureProvider, "synthetic");
  assert.deepEqual(new Set(result.findings.map(f => f.type)), new Set(["preserved", "transferred", "lost", "duplicated", "conflict"]));
  assert.equal(result.owner_groups[0].status, "transformed");
  assert.equal(result.owner_groups[1].status, "preserved");
  assert.equal(result.owner_groups[2].status, "created");
  assert.equal(result.before.state, "current"); assert.equal(result.after.state, "proposed");
  assert.equal(new Set(result.matches.map(m => m.before_id)).size, before.functions.length);
  const sources = [...result.before.sources, ...result.after.sources];
  for (const finding of result.findings) {
    assert.ok(finding.evidence_refs.length);
    for (const id of finding.evidence_refs) {
      const source = sources.find(s => s.source_id === id)!;
      assert.ok(source); assert.equal(source.text.slice(source.start, source.end), source.quote);
    }
  }
  assert.equal(result.recommendations.length, 3);
  assert.ok(result.recommendations.every(r => r.status === "proposed" && !r.target_changes.length));
  assert.match(result.conclusion, /не изменяют текущую/);
  assert.equal(JSON.stringify([before, after]), original);
});

test("rejected extraction and unresolved ownership suppress loss instead of interpreting absence", async () => {
  for (const kind of ["rejected", "owner", "warning"]) {
    const { before, after } = pair();
    if (kind === "rejected") after.rejected_items = 1;
    if (kind === "owner") after.functions[0].unit_name = null;
    if (kind === "warning") after.warnings.push("Страницы без извлечённого текста: 2. Возможно, потребуется OCR.");
    const result = await compareOrganizations([before], [after], undefined, fixtureProvider);
    assert.equal(result.absence_assessable, false);
    assert.ok(!result.findings.some(f => f.type === "lost"));
    assert.ok(!result.owner_groups.some(g => g.status === "created"));
    assert.match(result.conclusion, /потери не оценивались/);
    assert.ok(result.matches.some(m => m.status === "needs_review"));
  }
});

test("partial and low confidence matches cannot become loss or transfer", async () => {
  const { before, after } = pair();
  const result = await compareOrganizations([before], [after], undefined, async request => {
    const value = await fixtureProvider(request) as { matches: { relation: string; confidence: number }[] };
    if (request.schemaName === "comparison_matches") for (const row of value.matches) {
      if (row.relation === "equivalent") row.relation = "partial";
      else row.confidence = 0.4;
    }
    return value;
  });
  assert.ok(result.matches.every(m => m.status === "needs_review"));
  assert.ok(!result.findings.some(f => ["lost", "transferred", "preserved"].includes(f.type)));
});

test("bad or missing model references become explicit review rows without fabricated findings", async () => {
  const { before, after } = pair();
  for (const failure of ["id", "missing", "kind", "confidence"]) {
    const result = await compareOrganizations([before], [after], undefined, async request => {
      const value = await fixtureProvider(request) as { groups: { entity_type: string }[]; matches: { after_ids: string[]; confidence: number }[] };
      if (failure === "kind" && request.schemaName === "comparison_owners") value.groups[0].entity_type = "position";
      if (request.schemaName === "comparison_matches") {
        if (failure === "id") value.matches[0].after_ids = ["invented-function"];
        if (failure === "missing") value.matches.pop();
        if (failure === "confidence") value.matches[0].confidence = 5;
      }
      return value;
    });
    assert.equal(result.analysis_complete, false);
    assert.equal(result.absence_assessable, false);
    assert.ok(!result.findings.some(f => f.type === "lost"));
    assert.equal(new Set(result.matches.map(m => m.before_id)).size, before.functions.length);
    assert.ok(result.warnings.some(w => /частич|Неполное/.test(w)));
    assert.ok(!result.matches.some(m => m.after_id === "invented-function"));
  }
});

test("prohibition versus duty can never be an equivalent assignment", async () => {
  const { before, after } = pair();
  const prohibition = before.functions.find(f => f.modality === "prohibition")!;
  const result = await compareOrganizations([before], [after], undefined, async request => {
    const value = await fixtureProvider(request) as { matches: { before_id: string; after_ids: string[] }[] };
    if (request.schemaName === "comparison_matches") {
      const input = JSON.parse(request.input);
      const b = input.target_before.find((f: { modality: string }) => f.modality === "prohibition");
      const a = input.all_after.find((f: { object: string; modality: string }) => f.object === "платежи" && f.modality === "duty");
      value.matches.find(m => m.before_id === b.id)!.after_ids = [a.id];
    }
    return value;
  });
  assert.equal(result.matches.find(m => m.before_id === prohibition.function_id)?.status, "needs_review");
});

test("identical documents bypass AI even when independent extractions disagree", async () => {
  const { before } = pair();
  const after = structuredClone(before);
  after.side = "after";
  after.units.forEach(u => { u.unit_id = `after-${u.unit_id}`; u.evidence.forEach(s => { s.side = "after"; }); });
  after.functions.forEach(f => { f.function_id = `after-${f.function_id}`; f.evidence.forEach(s => { s.side = "after"; }); });
  after.functions.pop(); // Stochastic extraction differs, source content does not.
  const result = await compareOrganizations([before], [after], undefined, async () => { throw new Error("AI must not be called for identical sources"); });
  assert.equal(result.identical_sources, true);
  assert.equal(result.analysis_complete, false); // Intra-state risk audit was intentionally not run.
  assert.match(result.conclusion, /побайтно/);
  assert.ok(result.findings.every(f => f.type === "preserved"));
  assert.equal(result.recommendations.length, 0);
  assert.ok(result.matches.some(m => m.status === "needs_review"));
});

test("management vertical is not duplicate ownership; same responsibility duties are not a conflict", async () => {
  const { before, after } = pair();
  after.units[1].parent_unit = after.units[0].unit_name;
  const result = await compareOrganizations([before], [after], undefined, fixtureProvider);
  assert.ok(!result.findings.some(f => f.type === "duplicated"));
  assert.ok(result.findings.some(f => f.type === "conflict"));
  assert.ok(result.warnings.some(w => w.includes("Гипотез рисков")));
});

test("legacy and broken evidence fail before model calls; model failure or cancellation has no partial success", async () => {
  const { before, after } = pair();
  const legacy = structuredClone(before); delete legacy.units[0].entity_type;
  assert.throws(() => prepareComparison([legacy], [after]), /старое извлечение/);
  const broken = structuredClone(before); broken.functions[0].evidence[0].quote = "invented";
  assert.throws(() => prepareComparison([broken], [after]), /источники/);
  await assert.rejects(compareOrganizations([before], [after], undefined, async () => { throw new AiError("Synthetic outage"); }), /Synthetic outage/);
  const controller = new AbortController();
  await assert.rejects(compareOrganizations([before], [after], controller.signal, async request => {
    controller.abort(); return fixtureProvider(request);
  }), { name: "AbortError" });
});

test("identical source content on both sides is allowed; same-side copies are rejected and cache follows content/model", () => {
  const { before, after } = pair();
  after.document_id = before.document_id;
  assert.doesNotThrow(() => prepareComparison([before], [after]));
  assert.throws(() => prepareComparison([before, before], [after]), /копия/);
  const id = comparisonId([before], [after], "one");
  assert.notEqual(id, comparisonId([before], [after], "two"));
  after.functions[0].scope = "Изменённая область";
  assert.notEqual(id, comparisonId([before], [after], "one"));
});

test("comparison model matches provider requests, result provenance and cache key", async () => {
 const { before, after } = pair();
 for (const model of ["gpt-6-sol", "gpt-4.1-mini"]) {
  let calls = 0;
  const result = await compareOrganizations([before], [after], undefined, async request => {
   calls++;
   assert.equal(request.model, model);
   assert.equal(request.reasoningEffort, model === "gpt-6-sol" ? "low" : undefined);
   return fixtureProvider(request);
  }, model);
  assert.ok(calls > 0);
  assert.equal(result.model, model);
  assert.equal(result.comparison_id, comparisonId([before], [after], model));
 }
 assert.notEqual(comparisonId([before], [after], "gpt-6-sol"), comparisonId([before], [after], "gpt-4.1-mini"));
});
