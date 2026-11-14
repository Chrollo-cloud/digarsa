import assert from "node:assert/strict";
import test from "node:test";
import { classifyMessage } from "../src/modules/conversations/message-moderation.js";
import { moderateMessageOnce, moderateMessageWithGemini, sanitizeMessageForGemini } from "../src/modules/conversations/gemini-message-moderation.js";
import { createMessageSchema } from "../src/modules/conversations/conversation.schema.js";

const approvedDisposableUrl = "postgresql://digarsa_concurrency_test_user:local-test-only@localhost:5432/digarsa_concurrency_test?schema=public";
process.env.NODE_ENV = "test";
process.env.DIRECT_URL_CONCURRENCY_TEST = approvedDisposableUrl;

const { createConversationMessageHandlers } = await import("../src/modules/conversations/conversation.controller.js");
const { authenticate } = await import("../src/middleware/auth.middleware.js");
const conversationRoutes = (await import("../src/modules/conversations/conversation.routes.js")).default;

function route(method: string, path: string) {
  const stack = (conversationRoutes as unknown as { stack: { route?: { path: string; methods: Record<string, boolean>; stack: { handle: Function }[] } }[] }).stack;
  const target = stack.find((layer) => layer.route?.path === path && layer.route.methods[method]);
  assert.ok(target?.route, `${method.toUpperCase()} ${path} exists`);
  return target.route;
}

function response() {
  let statusCode = 0;
  let body: any;
  return {
    res: {
      locals: { auth: { userId: "customer-1" } },
      status(code: number) { statusCode = code; return this; },
      json(value: unknown) { body = value; return this; },
    },
    get statusCode() { return statusCode; },
    get body() { return body; },
  };
}

function fakeDatabase({ participant = true, conversationExists = true } = {}) {
  const storedMessages: any[] = [];
  const notifications: any[] = [];
  let messageLookups = 0;
  let transactionCalls = 0;
  let conversationLookups = 0;
  const conversationRecord = {
    id: "conversation-1",
    customerId: "customer-1",
    seller: { userId: "seller-owner-1" },
  };
  const tx = {
    conversation: {
      findFirst: async () => {
        conversationLookups += 1;
        return participant && conversationExists ? conversationRecord : null;
      },
    },
    message: {
      create: async ({ data }: any) => {
        const record = {
          id: `message-${storedMessages.length + 1}`,
          ...data,
          createdAt: new Date("2026-11-14T10:00:00.000Z"),
        };
        storedMessages.push(record);
        return record;
      },
      findMany: async () => {
        messageLookups += 1;
        return [...storedMessages].reverse();
      },
    },
    notification: {
      create: async ({ data }: any) => { notifications.push(data); return data; },
    },
  };
  const db = {
    conversation: tx.conversation,
    message: tx.message,
    $transaction: async (operation: (client: typeof tx) => Promise<unknown>) => {
      transactionCalls += 1;
      return operation(tx);
    },
  } as never;
  return { db, storedMessages, notifications, get messageLookups() { return messageLookups; }, get transactionCalls() { return transactionCalls; }, get conversationLookups() { return conversationLookups; } };
}

const classify = (text: string) => classifyMessage(text);

test("ordinary conversation messages are not flagged", () => {
  assert.deepEqual(classify("The first logo draft is ready. I will share it here tomorrow."), {
    flagged: false,
    reasons: [],
    severity: null,
  });
});

test("explicit off-platform personal payment requests are flagged medium", () => {
  const result = classify("Please transfer the deposit to my personal bank account outside the platform.");
  assert.equal(result.flagged, true);
  assert.deepEqual(result.reasons, ["OFF_PLATFORM_PAYMENT_REQUEST"]);
  assert.equal(result.severity, "MEDIUM");
});

test("mentioning WhatsApp or a bank account without an off-platform request is not enough to flag", () => {
  assert.equal(classify("I can send the payment invoice via WhatsApp after the work is approved.").flagged, false);
  assert.equal(classify("The client asked which bank account to use for their own bookkeeping.").flagged, false);
});

test("suspicious links are flagged and urgency plus account threat is classified as phishing", () => {
  const link = classify("Project files: https://bit.ly/digarsa-brief");
  assert.equal(link.flagged, true);
  assert.deepEqual(link.reasons, ["SUSPICIOUS_LINK"]);
  assert.equal(link.severity, "LOW");

  const phishing = classify("Your account is suspended. Verify immediately at https://example.com/login");
  assert.ok(phishing.reasons.includes("PHISHING_ATTEMPT"));
  assert.equal(phishing.severity, "HIGH");
});

test("credential and OTP requests are high severity while safety advice is not flagged", () => {
  const result = classify("Please send me your OTP verification code to confirm the account.");
  assert.ok(result.reasons.includes("CREDENTIAL_REQUEST"));
  assert.equal(result.severity, "HIGH");
  assert.equal(classify("Never share your password or OTP with anyone, including me.").flagged, false);
});

test("message validation rejects empty and oversized bodies", () => {
  assert.equal(createMessageSchema.safeParse({ body: "   " }).success, false);
  assert.equal(createMessageSchema.safeParse({ body: "x".repeat(5001) }).success, false);
  assert.equal(createMessageSchema.safeParse({ body: "x".repeat(5000) }).success, true);
});

test("participant can send and reread persisted moderation metadata with one notification", async () => {
  const fake = fakeDatabase();
  const handlers = createConversationMessageHandlers(fake.db);
  const sent = response();
  await handlers.sendConversationMessage({ params: { conversation_id: "conversation-1" }, body: { body: "Transfer the deposit to my personal bank account outside the platform." } } as never, sent.res as never);

  assert.equal(sent.statusCode, 201);
  assert.deepEqual(sent.body.data.moderation, {
    flagged: true,
    reasons: ["OFF_PLATFORM_PAYMENT_REQUEST"],
    severity: "MEDIUM",
    source: "rule_based",
    status: "RULE_BASED_FALLBACK",
  });
  assert.equal(fake.storedMessages[0].flagSeverity, "MEDIUM");
  assert.equal(fake.storedMessages[0].moderationSource, "RULE_BASED");
  assert.equal(fake.notifications.length, 1);
  assert.equal(fake.notifications[0].userId, "seller-owner-1");
  assert.equal(fake.notifications[0].type, "NEW_MESSAGE");

  const read = response();
  await handlers.listConversationMessages({ params: { conversation_id: "conversation-1" }, query: {} } as never, read.res as never);
  assert.equal(read.statusCode, 200);
  assert.deepEqual(read.body.data[0].moderation, sent.body.data.moderation);
  assert.equal(fake.messageLookups, 1);
});

test("a normal message is persisted without a moderation flag and still notifies the other participant", async () => {
  const fake = fakeDatabase();
  const handlers = createConversationMessageHandlers(fake.db);
  const sent = response();
  await handlers.sendConversationMessage({ params: { conversation_id: "conversation-1" }, body: { body: "I will share the first draft tomorrow." } } as never, sent.res as never);

  assert.equal(sent.statusCode, 201);
  assert.deepEqual(sent.body.data.moderation, { flagged: false, reasons: [], severity: null, source: "rule_based", status: "RULE_BASED_FALLBACK" });
  assert.equal(fake.storedMessages[0].isFlagged, false);
  assert.deepEqual(fake.storedMessages[0].flagReasons, []);
  assert.equal(fake.storedMessages[0].flagSeverity, null);
  assert.equal(fake.notifications.length, 1);
});

test("nonparticipant cannot read or send another user's conversation", async () => {
  const fake = fakeDatabase({ participant: false });
  let moderationCalls = 0;
  const withSpy = createConversationMessageHandlers(fake.db, async () => {
    moderationCalls += 1;
    throw new Error("unauthorized message must never be sent to Gemini");
  });
  const read = response();
  await assert.rejects(
    withSpy.listConversationMessages({ params: { conversation_id: "conversation-1" }, query: {} } as never, read.res as never),
    { code: "CONVERSATION_NOT_FOUND" },
  );
  const sent = response();
  await assert.rejects(
    withSpy.sendConversationMessage({ params: { conversation_id: "conversation-1" }, body: { body: "Hello" } } as never, sent.res as never),
    { code: "CONVERSATION_NOT_FOUND" },
  );
  assert.equal(fake.messageLookups, 0);
  assert.equal(fake.storedMessages.length, 0);
  assert.equal(fake.notifications.length, 0);
  assert.equal(moderationCalls, 0);
});

test("missing conversation cannot trigger Gemini or start a transaction", async () => {
  const fake = fakeDatabase({ conversationExists: false });
  let moderationCalls = 0;
  const handlers = createConversationMessageHandlers(fake.db, async () => {
    moderationCalls += 1;
    throw new Error("must not reach provider");
  });
  await assert.rejects(
    handlers.sendConversationMessage({ params: { conversation_id: "missing" }, body: { body: "Hello" } } as never, response().res as never),
    { code: "CONVERSATION_NOT_FOUND" },
  );
  assert.equal(moderationCalls, 0);
  assert.equal(fake.transactionCalls, 0);
  assert.equal(fake.storedMessages.length, 0);
  assert.equal(fake.notifications.length, 0);
});

test("invalid message cannot trigger Gemini or perform a conversation lookup", async () => {
  const fake = fakeDatabase();
  let moderationCalls = 0;
  const handlers = createConversationMessageHandlers(fake.db, async () => {
    moderationCalls += 1;
    throw new Error("must not reach provider");
  });
  await assert.rejects(
    handlers.sendConversationMessage({ params: { conversation_id: "conversation-1" }, body: { body: "   " } } as never, response().res as never),
    { code: "VALIDATION_FAILED" },
  );
  assert.equal(moderationCalls, 0);
  assert.equal(fake.conversationLookups, 0);
  assert.equal(fake.transactionCalls, 0);
});

test("Gemini classifications use controlled reasons and preserve rule-based flags", async () => {
  const benign = await moderateMessageWithGemini("We can discuss the transfer through the platform.", {
    availability: () => "AVAILABLE",
    async generateJson() { return { ok: true, model: "test-model", value: { flagged: false, reasons: [], severity: null } }; },
  } as never);
  assert.equal(benign.source, "GEMINI");
  assert.equal(benign.status, "AI_COMPLETED");
  assert.deepEqual(benign.result, { flagged: false, reasons: [], severity: null });

  const ruleFlag = await moderateMessageWithGemini("Please transfer the deposit to my personal bank account outside the platform.", {
    availability: () => "AVAILABLE",
    async generateJson() { return { ok: true, model: "test-model", value: { flagged: false, reasons: [], severity: null } }; },
  } as never);
  assert.equal(ruleFlag.result.flagged, true);
  assert.ok(ruleFlag.result.reasons.includes("OFF_PLATFORM_PAYMENT_REQUEST"));
});

test("Gemini detects mocked Indonesian, English, and mixed-language scam classifications", async () => {
  const messages = [
    { body: "Kirim OTP kamu sekarang untuk konfirmasi.", reason: "CREDENTIAL_REQUEST" },
    { body: "Your Digarsa account is locked; verify immediately.", reason: "PHISHING_ATTEMPT" },
    { body: "Bayar deposit to rekening pribadi outside platform.", reason: "OFF_PLATFORM_PAYMENT_REQUEST" },
  ];
  for (const item of messages) {
    const result = await moderateMessageWithGemini(item.body, {
      availability: () => "AVAILABLE",
      async generateJson() { return { ok: true, model: "mock", value: { flagged: true, reasons: [item.reason], severity: item.reason === "OFF_PLATFORM_PAYMENT_REQUEST" ? "MEDIUM" : "HIGH" } }; },
    } as never);
    assert.ok(result.result.reasons.includes(item.reason as never));
    assert.equal(result.source, "GEMINI");
  }
});

test("Gemini timeout, missing configuration, and malformed output fall back to rules", async () => {
  const ruleFlag = "Please transfer the deposit to my personal bank account outside the platform.";
  const disabled = await moderateMessageWithGemini(ruleFlag, { availability: () => "DISABLED", async generateJson() { assert.fail("disabled provider must not run"); } } as never);
  assert.equal(disabled.status, "RULE_BASED_FALLBACK");
  assert.equal(disabled.result.flagged, true);

  const timeout = await moderateMessageWithGemini("Normal service update.", {
    availability: () => "AVAILABLE",
    async generateJson() { return { ok: false, code: "TIMEOUT" }; },
  } as never);
  assert.equal(timeout.fallbackReason, "TIMEOUT");
  assert.equal(timeout.status, "RULE_BASED_FALLBACK");

  const malformed = await moderateMessageWithGemini("Normal service update.", {
    availability: () => "AVAILABLE",
    async generateJson() { return { ok: false, code: "INVALID_RESPONSE" }; },
  } as never);
  assert.equal(malformed.status, "RULE_BASED_FALLBACK");
  assert.equal(malformed.result.flagged, false);

  const invalidMetadata = await moderateMessageWithGemini("Normal service update.", {
    availability: () => "AVAILABLE",
    async generateJson() { return { ok: true, model: "mock", value: { flagged: true, reasons: ["ADMIN_OVERRIDE"], severity: "CRITICAL" } }; },
  } as never);
  assert.equal(invalidMetadata.status, "RULE_BASED_FALLBACK");
  assert.equal(invalidMetadata.fallbackReason, "INVALID_RESPONSE");
  assert.deepEqual(invalidMetadata.result, { flagged: false, reasons: [], severity: null });
});

test("message sent to Gemini masks email, phone, codes, and URL tokens but preserves hostname", () => {
  const sanitized = sanitizeMessageForGemini("Contact me at person@example.com or +62 812-3456-7890, OTP 123456, account 1234567890123456. Visit https://bit.ly/offer?token=secret");
  assert.ok(!sanitized.includes("person@example.com"));
  assert.ok(!sanitized.includes("812-3456-7890"));
  assert.ok(!sanitized.includes("123456"));
  assert.ok(!sanitized.includes("1234567890123456"));
  assert.ok(!sanitized.includes("token=secret"));
  assert.ok(sanitized.includes("bit.ly"));
});

test("send persists Gemini provenance before response and reloads it consistently", async () => {
  const fake = fakeDatabase();
  const order: string[] = [];
  const handlers = createConversationMessageHandlers(fake.db, async () => {
    order.push("moderate");
    assert.equal(fake.transactionCalls, 0, "Gemini work must finish before the database transaction begins");
    return { result: { flagged: true, reasons: ["PHISHING_ATTEMPT"], severity: "HIGH" }, source: "GEMINI", status: "AI_COMPLETED" };
  });
  const sent = response();
  await handlers.sendConversationMessage({ params: { conversation_id: "conversation-1" }, body: { body: "Verify your account", sender_id: "forged-user" } } as never, sent.res as never);
  order.push("stored");
  assert.deepEqual(order, ["moderate", "stored"]);
  assert.equal(fake.transactionCalls, 1);
  assert.equal(fake.storedMessages[0].moderationSource, "GEMINI");
  assert.equal(fake.storedMessages[0].senderId, "customer-1", "sender identity comes from authenticated server context");
  assert.equal(sent.body.data.moderation.status, "AI_COMPLETED");
  const read = response();
  await handlers.listConversationMessages({ params: { conversation_id: "conversation-1" }, query: {} } as never, read.res as never);
  assert.equal(read.body.data[0].moderation.source, "gemini");
  assert.equal(read.body.data[0].moderation.status, "AI_COMPLETED");
  assert.equal(fake.notifications.length, 1);
});

test("Gemini timeout falls back, stores the valid message, and creates one notification", async () => {
  const fake = fakeDatabase();
  const fallback = await moderateMessageWithGemini("Please transfer the deposit to my personal bank account outside the platform.", {
    availability: () => "AVAILABLE",
    async generateJson() { return { ok: false, code: "TIMEOUT" }; },
  } as never);
  const handlers = createConversationMessageHandlers(fake.db, async () => fallback);
  const sent = response();
  await handlers.sendConversationMessage({
    params: { conversation_id: "conversation-1" },
    body: { body: "Please transfer the deposit to my personal bank account outside the platform." },
  } as never, sent.res as never);
  assert.equal(sent.statusCode, 201);
  assert.equal(fake.storedMessages.length, 1);
  assert.equal(fake.storedMessages[0].isFlagged, true);
  assert.equal(fake.storedMessages[0].moderationSource, "RULE_BASED");
  assert.equal(sent.body.data.moderation.status, "RULE_BASED_FALLBACK");
  assert.equal(fake.notifications.length, 1);
});

test("retries and concurrent duplicate content reuse a recent successful Gemini classification", async () => {
  let calls = 0;
  let resolveClassification!: (outcome: any) => void;
  const moderate = async () => {
    calls += 1;
    return new Promise<any>((resolve) => { resolveClassification = resolve; });
  };
  const first = moderateMessageOnce(["conversation-1", "customer-1"], "Same message", moderate);
  const retry = moderateMessageOnce(["conversation-1", "customer-1"], "Same message", moderate);
  await Promise.resolve();
  assert.equal(calls, 1);
  resolveClassification({ result: { flagged: false, reasons: [], severity: null }, source: "GEMINI", status: "AI_COMPLETED" });
  assert.deepEqual(await first, await retry);
  const subsequentRetry = await moderateMessageOnce(["conversation-1", "customer-1"], "Same message", moderate);
  assert.equal(subsequentRetry.source, "GEMINI");
  assert.equal(calls, 1);
});

test("successful moderation cache does not mix identical message text across accounts or conversations", async () => {
  let calls = 0;
  const moderate = async () => {
    calls += 1;
    return { result: { flagged: false, reasons: [], severity: null }, source: "GEMINI" as const, status: "AI_COMPLETED" as const };
  };
  await moderateMessageOnce(["conversation-a", "account-a"], "Same content", moderate);
  await moderateMessageOnce(["conversation-b", "account-a"], "Same content", moderate);
  await moderateMessageOnce(["conversation-a", "account-b"], "Same content", moderate);
  assert.equal(calls, 3);
});

test("conversation message routes retain authentication middleware", () => {
  for (const [method, path] of [
    ["get", "/conversations/:conversation_id/messages"],
    ["post", "/conversations/:conversation_id/messages"],
  ]) {
    assert.equal(route(method!, path!).stack[0]?.handle, authenticate);
  }
  assert.equal(route("post", "/conversations/:conversation_id/messages").stack.length, 3, "message-send route includes the Gemini-specific cost limiter");
});

test("unauthenticated message requests receive the existing 401 response", async () => {
  const unauthorized = response();
  await authenticate(
    { headers: {} } as never,
    unauthorized.res as never,
    () => assert.fail("unauthenticated request must not reach the handler"),
  );
  assert.equal(unauthorized.statusCode, 401);
  assert.equal(unauthorized.body.error.code, "UNAUTHORIZED");
});
