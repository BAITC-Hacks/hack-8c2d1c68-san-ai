import { test } from "node:test";
import assert from "node:assert/strict";
import { extractionModel, comparisonModel, comparisonReasoning } from "../src/lib/server/ai-models";

test("workloads resolve independently and legacy model only affects extraction", t => {
 const names = ["OPENAI_MODEL", "OPENAI_EXTRACTION_MODEL", "OPENAI_COMPARISON_MODEL"];
 const previous = names.map(name => process.env[name]);
 t.after(() => names.forEach((name, i) => { if (previous[i] === undefined) delete process.env[name]; else process.env[name] = previous[i]; }));
 process.env.OPENAI_MODEL = "legacy-model";
 process.env.OPENAI_EXTRACTION_MODEL = "";
 process.env.OPENAI_COMPARISON_MODEL = "";
 assert.equal(extractionModel(), "legacy-model");
 assert.equal(comparisonModel(), "gpt-6-sol");
 process.env.OPENAI_EXTRACTION_MODEL = "gpt-4.1-mini";
 process.env.OPENAI_COMPARISON_MODEL = "gpt-4.1-mini";
 assert.equal(extractionModel(), "gpt-4.1-mini");
 assert.equal(comparisonModel(), "gpt-4.1-mini");
 assert.equal(comparisonReasoning(comparisonModel()), undefined);
 assert.equal(comparisonReasoning("gpt-6-sol"), "low");
});
