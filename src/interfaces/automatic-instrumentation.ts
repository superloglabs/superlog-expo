import type { SuperlogClient } from "../application/client.js";
import type { Severity, SpanHandle } from "../application/transport.js";
import type { Attributes } from "../domain/attributes.js";

export type AutomaticInstrumentationOptions = {
  console?: boolean;
  errors?: boolean;
  fetch?: boolean;
  ignoredFetchUrls?: Array<string | RegExp>;
};

export type InstalledInstrumentation = {
  uninstall: () => void;
};

type GlobalWithErrorUtils = typeof globalThis & {
  ErrorUtils?: {
    getGlobalHandler?: () => (error: unknown, isFatal?: boolean) => void;
    setGlobalHandler?: (handler: (error: unknown, isFatal?: boolean) => void) => void;
  };
};

type ErrorEventLike = Event & {
  error?: unknown;
  message?: string;
  filename?: string;
  lineno?: number;
  colno?: number;
};

type PromiseRejectionEventLike = Event & {
  reason?: unknown;
};

const consoleMethods = ["debug", "error", "info", "log", "warn"] as const;

export function installAutomaticInstrumentation(
  client: SuperlogClient,
  options: AutomaticInstrumentationOptions = {},
): InstalledInstrumentation {
  const uninstallers: Array<() => void> = [];
  let installed = true;
  const enabled = {
    console: options.console ?? true,
    errors: options.errors ?? true,
    fetch: options.fetch ?? true,
  };

  if (enabled.errors) uninstallers.push(installErrorInstrumentation(client));
  if (enabled.console) uninstallers.push(installConsoleInstrumentation(client));
  if (enabled.fetch) {
    uninstallers.push(installFetchInstrumentation(client, options.ignoredFetchUrls ?? []));
  }

  return {
    uninstall: () => {
      if (!installed) return;
      installed = false;
      for (const uninstall of [...uninstallers].reverse()) uninstall();
    },
  };
}

function installErrorInstrumentation(client: SuperlogClient): () => void {
  const uninstallers: Array<() => void> = [];

  if (typeof globalThis.addEventListener === "function") {
    const handleError = (event: Event) => {
      const errorEvent = event as ErrorEventLike;
      client.captureException(errorEvent.error ?? new Error(errorEvent.message ?? "Unhandled error"), {
        "event.name": "error",
        "exception.handled": false,
        "code.filepath": errorEvent.filename,
        "code.lineno": errorEvent.lineno,
        "code.column": errorEvent.colno,
      });
    };
    const handleUnhandledRejection = (event: Event) => {
      const rejectionEvent = event as PromiseRejectionEventLike;
      client.captureException(rejectionEvent.reason ?? new Error("Unhandled promise rejection"), {
        "event.name": "unhandledrejection",
        "exception.handled": false,
      });
    };
    globalThis.addEventListener("error", handleError);
    globalThis.addEventListener("unhandledrejection", handleUnhandledRejection);
    uninstallers.push(() => {
      globalThis.removeEventListener?.("error", handleError);
      globalThis.removeEventListener?.("unhandledrejection", handleUnhandledRejection);
    });
  }

  const errorUtils = (globalThis as GlobalWithErrorUtils).ErrorUtils;
  if (errorUtils?.setGlobalHandler) {
    const previousHandler = errorUtils.getGlobalHandler?.();
    errorUtils.setGlobalHandler((error: unknown, isFatal?: boolean) => {
      client.captureException(error, {
        "event.name": "react_native_error",
        "exception.handled": false,
        "exception.fatal": isFatal,
      });
      previousHandler?.(error, isFatal);
    });
    uninstallers.push(() => {
      if (previousHandler) errorUtils.setGlobalHandler?.(previousHandler);
    });
  }

  return () => {
    for (const uninstall of [...uninstallers].reverse()) uninstall();
  };
}

function installConsoleInstrumentation(client: SuperlogClient): () => void {
  const originals = new Map<typeof consoleMethods[number], (...args: unknown[]) => void>();

  for (const method of consoleMethods) {
    const original = console[method].bind(console) as (...args: unknown[]) => void;
    originals.set(method, original);
    console[method] = ((...args: unknown[]) => {
      original(...args);
      recordConsoleCall(client, method, args);
    }) as typeof console[typeof method];
  }

  return () => {
    for (const [method, original] of originals) {
      console[method] = original as typeof console[typeof method];
    }
  };
}

function recordConsoleCall(
  client: SuperlogClient,
  method: typeof consoleMethods[number],
  args: unknown[],
): void {
  const attributes: Attributes = {
    "log.source": "console",
    "console.method": method,
    "console.argument_count": args.length,
  };
  const error = args.find((arg): arg is Error => arg instanceof Error);
  if (method === "error" && error) {
    client.captureException(error, attributes);
    return;
  }
  client.log(formatConsoleArgs(args), consoleSeverity(method), attributes);
}

function installFetchInstrumentation(
  client: SuperlogClient,
  ignoredUrls: Array<string | RegExp>,
): () => void {
  const originalFetch = globalThis.fetch;
  if (typeof originalFetch !== "function") return () => {};

  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const request = describeFetchRequest(input, init);
    if (ignoredUrls.some((ignoredUrl) => matchesUrl(request.url, ignoredUrl))) {
      return originalFetch(input, init);
    }

    const startedAt = Date.now();
    const attributes: Attributes = {
      "url.full": request.url,
      "http.request.method": request.method,
    };

    return client.trace("http.client", async (span) => {
      const nextInit = injectTraceContext(input, init, span);
      try {
        const response = await originalFetch(input, nextInit);
        client.log("fetch", "info", {
          ...attributes,
          "http.response.status_code": response.status,
          "http.response.duration_ms": Date.now() - startedAt,
        });
        return response;
      } catch (error) {
        client.captureException(error, {
          ...attributes,
          "http.response.duration_ms": Date.now() - startedAt,
        });
        throw error;
      }
    }, { attributes });
  }) as typeof fetch;

  return () => {
    globalThis.fetch = originalFetch;
  };
}

function injectTraceContext(
  input: RequestInfo | URL,
  init: RequestInit | undefined,
  span: SpanHandle,
): RequestInit | undefined {
  try {
    const carrier: Record<string, string> = {};
    span.injectTraceContext(carrier);
    if (Object.keys(carrier).length === 0) return init;
    const headers = new Headers(
      init?.headers ??
        (typeof Request !== "undefined" && input instanceof Request ? input.headers : undefined),
    );
    for (const [key, value] of Object.entries(carrier)) headers.set(key, value);
    return { ...init, headers };
  } catch {
    // Telemetry must never break the request.
    return init;
  }
}

function describeFetchRequest(input: RequestInfo | URL, init?: RequestInit): { method: string; url: string } {
  const inputWithMethod = input as { method?: string; url?: string };
  return {
    method: (init?.method ?? inputWithMethod.method ?? "GET").toUpperCase(),
    url: input instanceof URL ? input.toString() : inputWithMethod.url ?? String(input),
  };
}

function matchesUrl(url: string, matcher: string | RegExp): boolean {
  if (typeof matcher === "string") return url.startsWith(matcher);
  return matcher.test(url);
}

function consoleSeverity(method: typeof consoleMethods[number]): Severity {
  switch (method) {
    case "debug":
      return "debug";
    case "error":
      return "error";
    case "warn":
      return "warning";
    case "info":
    case "log":
    default:
      return "info";
  }
}

function formatConsoleArgs(args: unknown[]): string {
  return args.map((arg) => {
    if (typeof arg === "string") return arg;
    if (arg instanceof Error) return `${arg.name}: ${arg.message}`;
    try {
      return JSON.stringify(arg);
    } catch {
      return String(arg);
    }
  }).join(" ");
}
