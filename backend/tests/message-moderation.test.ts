import assert from "node:assert/strict";
import test from "node:test";
import { classifyMessage } from "../src/modules/conversations/message-moderation.js";
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

function fakeDatabase({ participant = true } = {}) {
  const storedMessages: any[] = [];
  const notifications: any[] = [];
  let messageLookups = 0;
  const conversationRecord = {
    id: "conversation-1",
    customerId: "customer-1",
    seller: { userId: "seller-owner-1" },
  };
  const tx = {
    conversation: {
      findFirst: async () => participant ? conversationRecord : null,
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
    $transaction: async (operation: (client: typeof tx) => Promise<unknown>) => operation(tx),
  } as never;
  return { db, storedMessages, notifications, get messageLookups() { return messageLookups; } };
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
  assert.equal(sent.body.data.moderation.flagged, true);
  assert.equal(fake.storedMessages[0].flagSeverity, "MEDIUM");
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
  assert.deepEqual(sent.body.data.moderation, { flagged: false, reasons: [], severity: null });
  assert.equal(fake.storedMessages[0].isFlagged, false);
  assert.deepEqual(fake.storedMessages[0].flagReasons, []);
  assert.equal(fake.storedMessages[0].flagSeverity, null);
  assert.equal(fake.notifications.length, 1);
});

test("nonparticipant cannot read or send another user's conversation", async () => {
  const fake = fakeDatabase({ participant: false });
  const handlers = createConversationMessageHandlers(fake.db);
  const read = response();
  await assert.rejects(
    handlers.listConversationMessages({ params: { conversation_id: "conversation-1" }, query: {} } as never, read.res as never),
    { code: "CONVERSATION_NOT_FOUND" },
  );
  const sent = response();
  await assert.rejects(
    handlers.sendConversationMessage({ params: { conversation_id: "conversation-1" }, body: { body: "Hello" } } as never, sent.res as never),
    { code: "CONVERSATION_NOT_FOUND" },
  );
  assert.equal(fake.messageLookups, 0);
  assert.equal(fake.storedMessages.length, 0);
  assert.equal(fake.notifications.length, 0);
});

test("conversation message routes retain authentication middleware", () => {
  for (const [method, path] of [
    ["get", "/conversations/:conversation_id/messages"],
    ["post", "/conversations/:conversation_id/messages"],
  ]) {
    assert.equal(route(method!, path!).stack[0]?.handle, authenticate);
  }
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
