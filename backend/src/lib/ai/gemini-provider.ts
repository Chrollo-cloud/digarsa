import { GoogleGenAI } from "@google/genai";
import { z } from "zod";

export type GeminiFailureCode = "DISABLED" | "NOT_CONFIGURED" | "TIMEOUT" | "QUOTA" | "PROVIDER_ERROR" | "INVALID_RESPONSE";

export type GeminiResult<T> =
  | { ok: true; value: T; model: string }
  | { ok: false; code: GeminiFailureCode };

export type GeminiProviderConfig = {
  enabled: boolean;
  apiKey?: string;
  model: string;
  timeoutMs: number;
};

export type GeminiJsonRequest<T> = {
  systemInstruction: string;
  userContent: string;
  responseJsonSchema: Record<string, unknown>;
  responseSchema: z.ZodType<T>;
  maxOutputTokens: number;
};

type GeminiClient = Pick<GoogleGenAI, "models">;
type GeminiClientFactory = (apiKey: string) => GeminiClient;

const DEFAULT_MODEL = "gemini-3.8-flash";
const DEFAULT_TIMEOUT_MS = 2500;
const MAX_TIMEOUT_MS = 8000;
const MAX_OUTPUT_TOKENS = 768;

function boundedTimeout(value: string | undefined) {
  if (!value || !/^\d+$/.test(value)) return DEFAULT_TIMEOUT_MS;
  const timeout = Number(value);
  if (!Number.isSafeInteger(timeout)) return DEFAULT_TIMEOUT_MS;
  return Math.max(250, Math.min(timeout, MAX_TIMEOUT_MS));
}

export function readGeminiConfig(env: NodeJS.ProcessEnv = process.env): GeminiProviderConfig {
  const modelValue = env.GEMINI_MODEL?.trim();
  return {
    enabled: env.AI_ENABLED === "true",
    ...(env.GEMINI_API_KEY?.trim() ? { apiKey: env.GEMINI_API_KEY.trim() } : {}),
    model: modelValue && /^gemini-[a-z0-9.-]{2,100}$/i.test(modelValue) ? modelValue : DEFAULT_MODEL,
    timeoutMs: boundedTimeout(env.GEMINI_TIMEOUT_MS),
  };
}

function failureCode(error: unknown): GeminiFailureCode {
  if (error && typeof error === "object") {
    const record = error as { name?: unknown; status?: unknown; code?: unknown };
    if (record.name === "AbortError" || record.name === "TimeoutError" || record.code === "ETIMEDOUT") return "TIMEOUT";
    if (record.status === 429 || record.code === 429) return "QUOTA";
  }
  return "PROVIDER_ERROR";
}

/** Shared, injectable Google GenAI provider. It never logs request data or provider errors. */
export function createGeminiProvider(
  getConfig: () => GeminiProviderConfig = () => readGeminiConfig(),
  clientFactory: GeminiClientFactory = (apiKey) => new GoogleGenAI({ apiKey }),
) {
  let client: GeminiClient | undefined;
  let clientApiKey: string | undefined;

  function availability() {
    const config = getConfig();
    if (!config.enabled) return "DISABLED" as const;
    if (!config.apiKey) return "NOT_CONFIGURED" as const;
    return "AVAILABLE" as const;
  }

  async function generateJson<T>(request: GeminiJsonRequest<T>): Promise<GeminiResult<T>> {
    const config = getConfig();
    if (!config.enabled) return { ok: false, code: "DISABLED" };
    if (!config.apiKey) return { ok: false, code: "NOT_CONFIGURED" };
    if (request.userContent.length > 18000 || request.maxOutputTokens < 1) {
      return { ok: false, code: "INVALID_RESPONSE" };
    }

    try {
      if (!client || clientApiKey !== config.apiKey) {
        client = clientFactory(config.apiKey);
        clientApiKey = config.apiKey;
      }
      const response = await client.models.generateContent({
        model: config.model,
        contents: request.userContent,
        config: {
          systemInstruction: request.systemInstruction,
          responseMimeType: "application/json",
          responseJsonSchema: request.responseJsonSchema,
          temperature: 0,
          maxOutputTokens: Math.min(request.maxOutputTokens, MAX_OUTPUT_TOKENS),
          abortSignal: AbortSignal.timeout(config.timeoutMs),
          httpOptions: {
            timeout: config.timeoutMs,
            retryOptions: { attempts: 1 },
          },
        },
      });
      if (typeof response.text !== "string" || response.text.length > 12000) {
        return { ok: false, code: "INVALID_RESPONSE" };
      }
      let json: unknown;
      try {
        json = JSON.parse(response.text);
      } catch {
        return { ok: false, code: "INVALID_RESPONSE" };
      }
      const validated = request.responseSchema.safeParse(json);
      if (!validated.success) return { ok: false, code: "INVALID_RESPONSE" };
      return { ok: true, value: validated.data, model: config.model };
    } catch (error) {
      return { ok: false, code: failureCode(error) };
    }
  }

  return {
    availability,
    generateJson,
  };
}

export const geminiProvider = createGeminiProvider();
