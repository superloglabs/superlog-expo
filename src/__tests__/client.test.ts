import assert from "node:assert/strict";
import { test } from "node:test";
import { SuperlogClient } from "../application/client.js";
import { FakeTransport } from "../testing/fake-transport.js";

function makeClient() {
  const transport = new FakeTransport();
  const client = new SuperlogClient({
    config: {
      token: "sl_public_test",
      serviceName: "expo-test",
      environment: "test",
      release: "1.0.0",
      dist: "ios-sim",
      gitSha: "abc123",
      runtimeVersion: "1.0.0",
      expoUpdateId: "update-1",
      platform: "ios",
    },
    transport,
    sessionIdFactory: () => "ses_test",
  });
  return { client, transport };
}

test("logs include stable session and release attributes", () => {
  const { client, transport } = makeClient();

  client.log("hello", "info", { component: "home" });

  assert.equal(transport.logs.length, 1);
  assert.equal(transport.logs[0]?.attributes["session.id"], "ses_test");
  assert.equal(transport.logs[0]?.attributes["service.name"], "expo-test");
  assert.equal(transport.logs[0]?.attributes["service.version"], "1.0.0");
  assert.equal(transport.logs[0]?.attributes.release, "1.0.0");
  assert.equal(transport.logs[0]?.attributes.dist, "ios-sim");
  assert.equal(transport.logs[0]?.attributes["superlog.release"], "1.0.0");
  assert.equal(transport.logs[0]?.attributes["superlog.dist"], "ios-sim");
  assert.equal(transport.logs[0]?.attributes["vcs.ref.head.revision"], "abc123");
  assert.equal(transport.logs[0]?.attributes.component, "home");
});

test("configured source map identity wins over Expo metadata resource attrs", () => {
  const transport = new FakeTransport();
  const client = new SuperlogClient({
    config: {
      token: "sl_public_test",
      serviceName: "expo-test",
      release: "expo-test-2@local",
      dist: "web-local",
      extraResourceAttributes: {
        "service.version": "1.0.0",
        "superlog.release": "wrong-release",
        "superlog.dist": "wrong-dist",
      },
    },
    transport,
    sessionIdFactory: () => "ses_test",
  });

  client.captureException(new Error("Expo SDK demo error"));

  assert.equal(transport.exceptions[0]?.attributes["service.version"], "expo-test-2@local");
  assert.equal(transport.exceptions[0]?.attributes["superlog.release"], "expo-test-2@local");
  assert.equal(transport.exceptions[0]?.attributes["superlog.dist"], "web-local");
});

test("trace correlates nested logs to the active span", async () => {
  const { client, transport } = makeClient();

  await client.trace("chat.send", async () => {
    client.log("chat_send_started");
  });

  assert.equal(transport.spans.length, 1);
  assert.equal(transport.spans[0]?.name, "chat.send");
  assert.equal(transport.spans[0]?.attributes["session.id"], "ses_test");
  assert.equal(transport.logs.length, 1);
  assert.equal(transport.logs[0]?.activeSpan?.id, "span-1");
  assert.equal(transport.spans[0]?.ended, true);
  assert.equal(transport.spans[0]?.endAttributes?.["span.status"], "ok");
});

test("an explicitly passed span correlates a log emitted after an await", async () => {
  const { client, transport } = makeClient();

  await client.trace("chat.send", async (span) => {
    await Promise.resolve();
    client.log("after_await", "info", {}, { span });
  });

  assert.equal(transport.logs.length, 1);
  assert.equal(transport.logs[0]?.message, "after_await");
  assert.equal(transport.logs[0]?.activeSpan?.id, "span-1");
});

test("an ambient log emitted with no active span carries session + route", async () => {
  const { client, transport } = makeClient();
  client.setRoute("/chat");

  client.log("ambient");

  assert.equal(transport.logs[0]?.activeSpan, undefined);
  assert.equal(transport.logs[0]?.attributes["session.id"], "ses_test");
  assert.equal(transport.logs[0]?.attributes["route.name"], "/chat");
});

test("recordNavigation tracks route changes by session", async () => {
  const { client, transport } = makeClient();

  await client.recordNavigation("/");
  await client.recordNavigation("/chat/123");

  assert.equal(transport.spans.length, 2);
  assert.equal(transport.logs.length, 2);
  assert.equal(transport.logs[1]?.attributes["navigation.from"], "/");
  assert.equal(transport.logs[1]?.attributes["navigation.to"], "/chat/123");
  assert.equal(transport.logs[1]?.attributes["route.name"], "/chat/123");
  assert.equal(transport.logs[1]?.attributes["session.id"], "ses_test");
  assert.equal(transport.logs[1]?.activeSpan?.id, "span-2");
});

test("captureException creates an error span when no span is active", () => {
  const { client, transport } = makeClient();
  const error = new Error("Cannot read property 'useMemoCache' of null");

  client.captureException(error, { component: "root_error_boundary" });

  assert.equal(transport.spans.length, 1);
  assert.equal(transport.spans[0]?.name, "exception");
  assert.equal(transport.spans[0]?.attributes["exception.type"], "Error");
  assert.equal(transport.spans[0]?.attributes["exception.message"], error.message);
  assert.equal(transport.spans[0]?.attributes["session.id"], "ses_test");
  assert.equal(transport.spans[0]?.exceptions.length, 1);
  assert.equal(transport.exceptions.length, 1);
  assert.equal(transport.exceptions[0]?.activeSpan?.id, "span-1");
});

test("captureException marks exceptions handled by default", () => {
  const { client, transport } = makeClient();

  client.captureException(new Error("boom"));

  assert.equal(transport.exceptions[0]?.attributes["exception.handled"], true);
});

test("captureException records on the active trace span", async () => {
  const { client, transport } = makeClient();
  const error = new TypeError("Network request failed");

  await client.trace("chat.send", async () => {
    client.captureException(error, { component: "chat" });
  });

  assert.equal(transport.spans.length, 1);
  assert.equal(transport.spans[0]?.name, "chat.send");
  assert.equal(transport.spans[0]?.exceptions.length, 1);
  assert.equal(transport.exceptions[0]?.activeSpan?.id, "span-1");
  assert.equal(transport.exceptions[0]?.attributes["exception.type"], "TypeError");
  assert.equal(transport.exceptions[0]?.attributes.component, "chat");
});
