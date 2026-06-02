import type { Attributes } from "../domain/attributes.js";

export type Severity = "fatal" | "error" | "warning" | "info" | "debug";

export type SpanHandle = {
  id: string;
  recordException(error: unknown, attributes?: Attributes): void;
  setAttributes(attributes: Attributes): void;
  end(attributes?: Attributes): void;
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
  emitLog(input: LogInput): void;
  emitException(input: ExceptionInput): void;
  flush?(): Promise<void>;
  shutdown?(): Promise<void>;
};
