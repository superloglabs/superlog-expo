import type { Attributes } from "../domain/attributes.js";

export type Severity = "fatal" | "error" | "warning" | "info" | "debug";

export type SpanHandle = {
  id: string;
  recordException(error: unknown, attributes?: Attributes): void;
  setAttributes(attributes: Attributes): void;
  end(attributes?: Attributes): void;
  /** Inject W3C `traceparent`/`tracestate` for this span into a header carrier
   *  so downstream services join the same distributed trace. */
  injectTraceContext(carrier: Record<string, string>): void;
  otelContext?: unknown;
};

export type StartSpanInput = {
  name: string;
  attributes: Attributes;
};

export type LogInput = {
  message: string;
  severity: Severity;
  attributes: Attributes;
  activeSpan?: SpanHandle;
};

export type ExceptionInput = {
  error: unknown;
  attributes: Attributes;
  activeSpan?: SpanHandle;
};

export type TelemetryTransport = {
  startSpan(input: StartSpanInput): SpanHandle;
  /** Run `fn` with `span` as the active context, so logs/exceptions emitted
   *  synchronously inside it resolve to `span` via `activeSpan()`. */
  withSpan<T>(span: SpanHandle, fn: () => T): T;
  /** The span active in the current context, if any. */
  activeSpan(): SpanHandle | undefined;
  emitLog(input: LogInput): void;
  emitException(input: ExceptionInput): void;
  flush?(): Promise<void>;
  shutdown?(): Promise<void>;
};
