import { compactAttributes, errorAttributes, type Attributes } from "../domain/attributes.js";
import { createSessionId, type SessionIdFactory } from "../domain/session.js";
import type { Severity, SpanHandle, TelemetryTransport } from "./transport.js";

export type SuperlogConfig = {
  token: string;
  serviceName: string;
  environment?: string;
  release?: string;
  dist?: string;
  gitSha?: string;
  runtimeVersion?: string;
  expoUpdateId?: string;
  expoUpdateGroupId?: string;
  platform?: string;
  extraResourceAttributes?: Attributes;
};

export type SuperlogClientOptions = {
  config: SuperlogConfig;
  transport: TelemetryTransport;
  sessionIdFactory?: SessionIdFactory;
};

export type TraceOptions = {
  attributes?: Attributes;
};

export type EmitOptions = {
  /** Attach this log/exception to a specific span. Pass the span from a
   *  `trace(name, (span) => ...)` callback to correlate deterministically —
   *  including across `await`, where ambient context is not tracked in RN. */
  span?: SpanHandle;
};

export class SuperlogClient {
  readonly sessionId: string;
  private contextAttributes: Attributes = {};
  private currentRoute: string | null = null;
  private teardownCallbacks: Array<() => void> = [];

  constructor(private readonly options: SuperlogClientOptions) {
    this.sessionId = options.sessionIdFactory?.() ?? createSessionId();
  }

  setUser(userId: string | null): void {
    this.setContext({
      "enduser.id": userId ?? undefined,
    });
  }

  setRoute(route: string | null): void {
    this.setContext({
      "route.name": route ?? undefined,
    });
  }

  async recordNavigation(route: string): Promise<void> {
    const previousRoute = this.currentRoute;
    this.currentRoute = route;
    this.setContext({
      "route.name": route,
      "navigation.previous_route": previousRoute ?? undefined,
    });
    await this.trace("navigation.route", (span) => {
      this.log(
        "navigation.route",
        "info",
        {
          "route.name": route,
          "navigation.to": route,
          "navigation.from": previousRoute ?? undefined,
        },
        { span },
      );
    });
  }

  setContext(attributes: Attributes): void {
    this.contextAttributes = compactAttributes({
      ...this.contextAttributes,
      ...attributes,
    });
  }

  log(
    message: string,
    severity: Severity = "info",
    attributes: Attributes = {},
    options: EmitOptions = {},
  ): void {
    this.options.transport.emitLog({
      message,
      severity,
      attributes: this.eventAttributes(attributes),
      activeSpan: options.span ?? this.activeSpan(),
    });
  }

  captureException(error: unknown, attributes: Attributes = {}, options: EmitOptions = {}): void {
    const activeSpan = options.span ?? this.activeSpan();
    const attrs = this.eventAttributes({
      // Default to a handled exception; the automatic global/unhandled-rejection
      // handlers pass "exception.handled": false to override this.
      "exception.handled": true,
      ...errorAttributes(error),
      ...attributes,
    });

    if (activeSpan) {
      activeSpan.recordException(error, attrs);
      this.options.transport.emitException({ error, attributes: attrs, activeSpan });
      return;
    }

    const span = this.options.transport.startSpan({
      name: "exception",
      attributes: attrs,
    });
    span.recordException(error, attrs);
    this.options.transport.emitException({ error, attributes: attrs, activeSpan: span });
    span.end({ "span.status": "error" });
  }

  async trace<T>(
    name: string,
    fn: (span: SpanHandle) => T | Promise<T>,
    options: TraceOptions = {},
  ): Promise<T> {
    const span = this.options.transport.startSpan({
      name,
      attributes: this.eventAttributes(options.attributes ?? {}),
    });
    // Run the callback inside the span's context so synchronously-emitted logs
    // resolve to it via the context manager (no global mutable span stack).
    // Logs after an `await` should be threaded explicitly via the `span` arg.
    try {
      const result = await this.options.transport.withSpan(span, () => fn(span));
      span.end({ "span.status": "ok" });
      return result;
    } catch (error) {
      span.recordException(error, this.eventAttributes(errorAttributes(error)));
      span.end({ "span.status": "error" });
      throw error;
    }
  }

  flush(): Promise<void> {
    return this.options.transport.flush?.() ?? Promise.resolve();
  }

  addTeardown(callback: () => void): void {
    this.teardownCallbacks.push(callback);
  }

  async shutdown(): Promise<void> {
    for (const callback of this.teardownCallbacks.splice(0).reverse()) callback();
    await (this.options.transport.shutdown?.() ?? Promise.resolve());
  }

  private activeSpan(): SpanHandle | undefined {
    return this.options.transport.activeSpan();
  }

  private eventAttributes(attributes: Attributes): Record<string, Exclude<Attributes[string], undefined>> {
    return compactAttributes(superlogTelemetryAttributes(this.options.config, {
      "session.id": this.sessionId,
      ...this.contextAttributes,
      ...attributes,
    }));
  }
}

export function superlogTelemetryAttributes(
  config: SuperlogConfig,
  attributes: Attributes = {},
): Attributes {
  return {
    ...config.extraResourceAttributes,
    "service.name": config.serviceName,
    "deployment.environment.name": config.environment,
    release: config.release,
    dist: config.dist,
    "service.version": config.release,
    "superlog.release": config.release,
    "superlog.dist": config.dist,
    "vcs.ref.head.revision": config.gitSha,
    "expo.runtime_version": config.runtimeVersion,
    "expo.update_id": config.expoUpdateId,
    "expo.update_group_id": config.expoUpdateGroupId,
    "device.platform": config.platform,
    "superlog.sdk.name": "@superlog/expo",
    "superlog.sdk.version": "0.1.2",
    ...attributes,
  };
}
