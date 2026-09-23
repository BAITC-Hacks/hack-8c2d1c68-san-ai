import { test } from "node:test";
import assert from "node:assert/strict";
import { requestOpenAiJson, AiError } from "../src/lib/server/openai-json";
const request = { instructions: "Extract synthetic data", input: "test", schemaName: "test", schema: { type: "object", properties: {}, additionalProperties: false } };
const fake = (response: Response) => (async () => response) as typeof fetch;
test("server sends strict schema, model, no storage and reads Responses output", async () => {
 const fetcher = (async (url: string, init: RequestInit) => {
  assert.equal(url, "https://api.openai.com/v1/responses");
  const body = JSON.parse(init.body as string);
  assert.equal(body.store, false); assert.equal(body.text.format.strict, true);
  assert.equal(body.model, "test-model");
  assert.equal(body.input, request.input);
  return Response.json({ status: "completed", output: [{ type: "message", content: [{ type: "output_text", text: '{"ok":true}' }] }] });
 }) as typeof fetch;
 assert.deepEqual(await requestOpenAiJson(request, { apiKey: "synthetic-key", model: "test-model", fetcher }), { ok: true });
});
test("missing key and provider errors are actionable and never expose raw provider response", async () => {
 await assert.rejects(requestOpenAiJson(request, { apiKey: "" }), AiError);
 for (const status of [400,401,403,404,429,500]) {
  await assert.rejects(requestOpenAiJson(request, { apiKey: "synthetic-key", fetcher: fake(new Response("secret-provider-body", { status })) }),
   (e: unknown) => e instanceof AiError && !e.message.includes("secret-provider-body"));
 }
});
test("incomplete, refused and malformed outputs never become successful data", async () => {
 for (const body of [
  { status: "incomplete", output: [] },
  { status: "completed", output: [{ type: "message", content: [{ type: "refusal" }] }] },
  { status: "completed", output: [{ type: "message", content: [{ type: "output_text", text: "bad json" }] }] },
 ]) await assert.rejects(requestOpenAiJson(request, { apiKey: "synthetic-key", fetcher: fake(Response.json(body)) }), AiError);
});
test("slow provider is aborted with a bounded timeout", async () => {
 const fetcher = ((_url: unknown, init: RequestInit) => new Promise<Response>((_resolve, reject) => {
  init.signal!.addEventListener("abort", () => reject(new Error("aborted")), { once: true });
 })) as typeof fetch;
 await assert.rejects(requestOpenAiJson(request, { apiKey: "synthetic-key", timeoutMs: 10, fetcher }),
  (e: unknown) => e instanceof AiError && e.status === 504);
});
