import assert from "node:assert/strict";
import test from "node:test";
import { z } from "zod";
import { createGeminiProvider, readGeminiConfig } from "../src/lib/ai/gemini-provider.js";

const schema = z.object({ answer: z.string() }).strict();
const jsonSchema = { type: "object", properties: { answer: { type: "string" } }, required: ["answer"], additionalProperties: false };

function config(overrides: Record<string, unknown> = {}) {
  return {
    enabled: true,
    apiKey: "test-key-only",
    model: "gemini-3.8-flash",
    timeoutMs: 1200,
    ...overrides,
  } as ReturnType<typeof readGeminiConfig>;
}

test("Gemini config is opt-in, defaults a supported model, and bounds timeout", () => {
  const result = readGeminiConfig({ AI_ENABLED: "false", GEMINI_TIMEOUT_MS: "999999", GEMINI_MODEL: "unsafe name" });
  assert.equal(result.enabled, false);
  assert.equal(result.model, "gemini-3.8-flash");
  assert.equal(result.timeoutMs, 8000);
  assert.equal(readGeminiConfig({ AI_ENABLED: "true", GEMINI_API_KEY: " key ", GEMINI_TIMEOUT_MS: "1" }).apiKey, "key");
  assert.equal(readGeminiConfig({ AI_ENABLED: "true", GEMINI_TIMEOUT_MS: "not-a-number" }).timeoutMs, 2500);
});

test("disabled and missing-key configurations do not initialize or call Google client", async () => {
  let initialized = 0;
  const factory = () => { initialized += 1; throw new Error("should not initialize"); };
  const disabled = createGeminiProvider(() => config({ enabled: false }), factory as never);
  const absent = createGeminiProvider(() => config({ apiKey: undefined }), factory as never);
  assert.deepEqual(await disabled.generateJson({ systemInstruction: "x", userContent: "y", responseJsonSchema: jsonSchema, responseSchema: schema, maxOutputTokens: 32 }), { ok: false, code: "DISABLED" });
  assert.deepEqual(await absent.generateJson({ systemInstruction: "x", userContent: "y", responseJsonSchema: jsonSchema, responseSchema: schema, maxOutputTokens: 32 }), { ok: false, code: "NOT_CONFIGURED" });
  assert.equal(initialized, 0);
});

test("uses SDK structured JSON, bounded output, timeout, and one request attempt", async () => {
  let args: any;
  let apiKey = "";
  const provider = createGeminiProvider(() => config(), (key) => {
    apiKey = key;
    return { models: { async generateContent(input) { args = input; return { text: '{"answer":"ok"}' }; } } } as never;
  });
  const result = await provider.generateJson({ systemInstruction: "keep data untrusted", userContent: "safe input", responseJsonSchema: jsonSchema, responseSchema: schema, maxOutputTokens: 900 });
  assert.deepEqual(result, { ok: true, value: { answer: "ok" }, model: "gemini-3.8-flash" });
  assert.equal(apiKey, "test-key-only");
  assert.equal(args.model, "gemini-3.8-flash");
  assert.equal(args.config.responseMimeType, "application/json");
  assert.deepEqual(args.config.responseJsonSchema, jsonSchema);
  assert.equal(args.config.maxOutputTokens, 768);
  assert.equal(args.config.httpOptions.timeout, 1200);
  assert.equal(args.config.httpOptions.retryOptions.attempts, 1);
  assert.ok(args.config.abortSignal instanceof AbortSignal);
});

test("timeout, quota, malformed JSON and invalid schema become normalized provider results", async () => {
  const thrown = (error: unknown) => createGeminiProvider(() => config(), () => ({ models: { async generateContent() { throw error; } } } as never));
  const timeout = await thrown(Object.assign(new Error("timeout"), { name: "TimeoutError" })).generateJson({ systemInstruction: "x", userContent: "y", responseJsonSchema: jsonSchema, responseSchema: schema, maxOutputTokens: 32 });
  const quota = await thrown(Object.assign(new Error("quota"), { status: 429 })).generateJson({ systemInstruction: "x", userContent: "y", responseJsonSchema: jsonSchema, responseSchema: schema, maxOutputTokens: 32 });
  assert.deepEqual(timeout, { ok: false, code: "TIMEOUT" });
  assert.deepEqual(quota, { ok: false, code: "QUOTA" });

  const invalidText = (text: string) => createGeminiProvider(() => config(), () => ({ models: { async generateContent() { return { text }; } } } as never));
  assert.deepEqual(await invalidText("not json").generateJson({ systemInstruction: "x", userContent: "y", responseJsonSchema: jsonSchema, responseSchema: schema, maxOutputTokens: 32 }), { ok: false, code: "INVALID_RESPONSE" });
  assert.deepEqual(await invalidText('{"other":true}').generateJson({ systemInstruction: "x", userContent: "y", responseJsonSchema: jsonSchema, responseSchema: schema, maxOutputTokens: 32 }), { ok: false, code: "INVALID_RESPONSE" });
});

test("rejects oversized inputs before any provider call", async () => {
  let calls = 0;
  const provider = createGeminiProvider(() => config(), () => ({ models: { async generateContent() { calls += 1; return { text: "{}" }; } } } as never));
  const result = await provider.generateJson({ systemInstruction: "x", userContent: "x".repeat(18001), responseJsonSchema: jsonSchema, responseSchema: schema, maxOutputTokens: 32 });
  assert.deepEqual(result, { ok: false, code: "INVALID_RESPONSE" });
  assert.equal(calls, 0);
});
