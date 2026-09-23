import { test } from "node:test";
import assert from "node:assert/strict";
import { ExtractionPool } from "../src/lib/server/extraction-pool";

test("shared pool bounds concurrency and gives queued requests capacity", async () => {
  const pool = new ExtractionPool(4);
  const releases: Array<() => void> = [];
  let active = 0;
  let peak = 0;
  const started: number[] = [];
  const tasks = Array.from({ length: 8 }, (_, index) => pool.run(new AbortController().signal, async () => {
    started.push(index);
    peak = Math.max(peak, ++active);
    await new Promise<void>(resolve => releases.push(resolve));
    active--;
    return index;
  }));
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(started, [0, 1, 2, 3]);
  releases.splice(0).forEach(release => release());
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(started, [0, 1, 2, 3, 4, 5, 6, 7]);
  releases.splice(0).forEach(release => release());
  assert.deepEqual(await Promise.all(tasks), started);
  assert.equal(peak, 4);
});

test("cancelled waiting requests never run; failures release capacity", async () => {
  const pool = new ExtractionPool(1);
  let release!: () => void;
  const first = pool.run(new AbortController().signal, () => new Promise<void>(resolve => { release = resolve; }));
  const controller = new AbortController();
  let called = false;
  const cancelled = pool.run(controller.signal, async () => { called = true; });
  const rejected = assert.rejects(cancelled, { name: "AbortError" });
  controller.abort();
  await rejected;
  release();
  await first;
  assert.equal(called, false);
  await assert.rejects(pool.run(new AbortController().signal, async () => { throw new Error("provider failed"); }), /provider failed/);
  assert.equal(await pool.run(new AbortController().signal, async () => "available"), "available");
});
