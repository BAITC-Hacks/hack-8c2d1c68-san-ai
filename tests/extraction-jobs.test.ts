import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { ExtractionJobs, extractionJobs } from "../src/lib/server/extraction-jobs";
import { saveDocument } from "../src/lib/server/document-store";
import { AiError } from "../src/lib/server/openai-json";
import { POST } from "../src/app/api/documents/[id]/extract/route";
import { comparisonFixture } from "./helpers/comparison-fixtures";

test("refresh replaces cache only on success and concurrent refreshes share a job", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "extraction-refresh-"));
  const fixture = comparisonFixture("before");
  const updated = { ...fixture.extraction, created_at: "2026-09-23T01:00:00Z" };
  const gate = Promise.withResolvers<void>();
  let calls = 0;
  const jobs = new ExtractionJobs(async (_parsed, _signal, progress) => {
    calls++;
    progress(0, 1);
    await gate.promise;
    return updated;
  });
  try {
    const doc = await saveDocument(fixture.bytes, fixture.extraction.document, "before", root);
    const file = path.join(root, doc.id, "extraction-v1.json");
    await writeFile(file, JSON.stringify(fixture.extraction));
    assert.equal((await jobs.start(doc.id, root)).cached, true);
    assert.equal(calls, 0);
    const started = await jobs.start(doc.id, root, true);
    assert.equal(started.cached, false);
    if (started.cached) throw new Error("refresh returned stale cache");
    const concurrent = await jobs.start(doc.id, root, true);
    assert.equal(concurrent.cached, false);
    if (concurrent.cached) throw new Error("refresh returned stale cache");
    assert.equal(concurrent.job, started.job);
    assert.equal(calls, 1);
    assert.equal((await jobs.status(doc.id, root, true)).status, "running");
    const saved = await jobs.status(doc.id, root);
    assert.ok("result" in saved);
    assert.deepEqual(saved.result, fixture.extraction);
    gate.resolve();
    await started.job.promise;
    assert.deepEqual(JSON.parse(await readFile(file, "utf8")), updated);
    assert.equal((await jobs.status(doc.id, root, true)).status, "complete");
  } finally { gate.resolve(); await rm(root, { recursive: true, force: true }); }
});

test("failed or cancelled refresh retains the previous successful result", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "extraction-preserve-"));
  const fixture = comparisonFixture("before");
  try {
    const doc = await saveDocument(fixture.bytes, fixture.extraction.document, "before", root);
    const file = path.join(root, doc.id, "extraction-v1.json");
    await writeFile(file, JSON.stringify(fixture.extraction));
    for (const outcome of ["failed", "cancelled"] as const) {
      const jobs = new ExtractionJobs(async (_parsed, signal) => {
        if (outcome === "failed") throw new AiError("Synthetic provider failure");
        await new Promise<void>(resolve => signal.addEventListener("abort", () => resolve(), { once: true }));
        return { ...fixture.extraction, created_at: "must-not-be-saved" };
      });
      const started = await jobs.start(doc.id, root, true);
      if (started.cached) throw new Error("refresh returned stale cache");
      if (outcome === "cancelled") assert.equal((await jobs.cancel(doc.id, root)).cancel_requested, true);
      await started.job.promise;
      assert.equal((await jobs.status(doc.id, root, true)).status, outcome);
      assert.deepEqual(JSON.parse(await readFile(file, "utf8")), fixture.extraction);
      assert.equal((await jobs.start(doc.id, root)).cached, true);
    }
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("synchronous request cancellation reaches the job while background requests return 202", async t => {
  const state = { status: "running" as const, completed_chunks: 0, total_chunks: 1 };
  const controller = new AbortController();
  const job = { state, controller, promise: new Promise<void>(resolve => {
    controller.signal.addEventListener("abort", () => resolve(), { once: true });
  }), errorStatus: 409 };
  const entered = Promise.withResolvers<void>();
  t.mock.method(extractionJobs, "status", async () => state);
  const start = t.mock.method(extractionJobs, "start", async () => {
    entered.resolve();
    return { cached: false as const, job };
  });
  const context = { params: Promise.resolve({ id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" }) };
  const requestController = new AbortController();
  const response = POST(new Request("http://localhost/extract?refresh=1", {
    method: "POST", signal: requestController.signal,
  }), context);
  await entered.promise;
  requestController.abort();
  assert.equal((await response).status, 409);
  assert.equal(controller.signal.aborted, true);
  assert.equal(start.mock.calls[0].arguments[2], true);

  const backgroundController = new AbortController();
  t.mock.method(extractionJobs, "start", async () => ({ cached: false as const,
    job: { state, controller: backgroundController, promise: Promise.resolve() },
  }));
  const backgroundRequest = new AbortController();
  const background = await POST(new Request("http://localhost/extract?background=1&refresh=1", {
    method: "POST", signal: backgroundRequest.signal,
  }), context);
  assert.equal(background.status, 202);
  backgroundRequest.abort();
  assert.equal(backgroundController.signal.aborted, false);
});
