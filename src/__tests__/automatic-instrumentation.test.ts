import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { SuperlogClient } from "../application/client.js";
import { installAutomaticInstrumentation } from "../interfaces/automatic-instrumentation.js";
import { FakeTransport } from "../testing/fake-transport.js";

type ErrorUtilsTestGlobal = typeof globalThis & {
  ErrorUtils?: {
    handler?: (error: unknown, isFatal?: boolean) => void;
    getGlobalHandler: () => ((error: unknown, isFatal?: boolean) => void) | undefined;
    setGlobalHandler: (handler: (error: unknown, isFatal?: boolean) => void) => void;
  };
};

const originalFetch = globalThis.fetch;
const originalErrorUtils = (globalThis as ErrorUtilsTestGlobal).ErrorUtils;

afterEach(() => {
  globalThis.fetch = originalFetch;
  (globalThis as ErrorUtilsTestGlobal).ErrorUtils = originalErrorUtils;
});

function makeClient() {
  const transport = new FakeTransport();
  const client = new SuperlogClient({
    config: {
      token: "sl_public_test",
      serviceName: "expo-test",
    },
    transport,
    sessionIdFactory: () => "ses_auto",
  });
  return { client, transport };
}

test("automatic console instrumentation records errors with session context", () => {
  const { client, transport } = makeClient();
  const originalConsoleError = console.error;
  console.error = () => {};
  const instrumentation = installAutomaticInstrumentation(client, {
    errors: false,
    fetch: false,
  });
  const error = new Error("console failed");

  try {
    console.error("prefix", error);
  } finally {
    instrumentation.uninstall();
    console.error = originalConsoleError;
  }

  assert.equal(transport.exceptions.length, 1);
  assert.equal(transport.exceptions[0]?.error, error);
  assert.equal(transport.exceptions[0]?.attributes["log.source"], "console");
  assert.equal(transport.exceptions[0]?.attributes["console.method"], "error");
  assert.equal(transport.exceptions[0]?.attributes["session.id"], "ses_auto");
});

test("automatic error instrumentation records React Native global errors", () => {
  const { client, transport } = makeClient();
  const previousErrors: unknown[] = [];
  const testGlobal = globalThis as ErrorUtilsTestGlobal;
  testGlobal.ErrorUtils = {
    handler: (error: unknown) => previousErrors.push(error),
    getGlobalHandler() {
      return this.handler;
    },
    setGlobalHandler(handler) {
      this.handler = handler;
    },
  };
  const instrumentation = installAutomaticInstrumentation(client, {
    console: false,
    fetch: false,
  });
  const error = new Error("root failed");

  try {
    testGlobal.ErrorUtils.handler?.(error, true);
  } finally {
    instrumentation.uninstall();
  }

  assert.equal(transport.exceptions.length, 1);
  assert.equal(transport.exceptions[0]?.error, error);
  assert.equal(transport.exceptions[0]?.attributes["event.name"], "react_native_error");
  assert.equal(transport.exceptions[0]?.attributes["exception.fatal"], true);
  assert.equal(transport.exceptions[0]?.attributes["exception.handled"], false);
  assert.equal(transport.exceptions[0]?.attributes["session.id"], "ses_auto");
  assert.deepEqual(previousErrors, [error]);
});

test("automatic fetch instrumentation creates client spans and logs responses", async () => {
  const { client, transport } = makeClient();
  globalThis.fetch = (async () => new Response("ok", { status: 201 })) as typeof fetch;
  const instrumentation = installAutomaticInstrumentation(client, {
    console: false,
    errors: false,
  });

  try {
    const response = await fetch("https://api.example.com/messages", {
      method: "post",
    });
    assert.equal(response.status, 201);
  } finally {
    instrumentation.uninstall();
  }

  assert.equal(transport.spans.length, 1);
  assert.equal(transport.spans[0]?.name, "http.client");
  assert.equal(transport.spans[0]?.attributes["url.full"], "https://api.example.com/messages");
  assert.equal(transport.spans[0]?.attributes["http.request.method"], "POST");
  assert.equal(transport.spans[0]?.attributes["session.id"], "ses_auto");
  assert.equal(transport.logs.length, 1);
  assert.equal(transport.logs[0]?.message, "fetch");
  assert.equal(transport.logs[0]?.attributes["http.response.status_code"], 201);
  assert.equal(transport.logs[0]?.activeSpan?.id, "span-1");
});

test("automatic fetch instrumentation injects W3C trace context into the request", async () => {
  const { client, transport } = makeClient();
  let capturedInit: RequestInit | undefined;
  globalThis.fetch = (async (_input: RequestInfo | URL, init?: RequestInit) => {
    capturedInit = init;
    return new Response("ok", { status: 200 });
  }) as typeof fetch;
  const instrumentation = installAutomaticInstrumentation(client, {
    console: false,
    errors: false,
  });

  try {
    await fetch("https://api.example.com/messages");
  } finally {
    instrumentation.uninstall();
  }

  const headers = new Headers(capturedInit?.headers);
  assert.ok(headers.get("traceparent"), "expected a traceparent header on the outgoing request");
  assert.equal(transport.spans[0]?.injectedCarriers.length, 1);
});
