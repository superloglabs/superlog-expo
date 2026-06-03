import type {
  ExceptionInput,
  LogInput,
  SpanHandle,
  StartSpanInput,
  TelemetryTransport,
} from "../application/transport.js";
import type { Attributes } from "../domain/attributes.js";

export type FakeSpanRecord = {
  id: string;
  name: string;
  attributes: Attributes;
  ended: boolean;
  endAttributes?: Attributes;
  exceptions: Array<{ error: unknown; attributes?: Attributes }>;
  injectedCarriers: Array<Record<string, string>>;
};

export class FakeTransport implements TelemetryTransport {
  spans: FakeSpanRecord[] = [];
  logs: LogInput[] = [];
  exceptions: ExceptionInput[] = [];
  private nextSpanId = 1;
  private current: SpanHandle | undefined;

  withSpan<T>(span: SpanHandle, fn: () => T): T {
    const previous = this.current;
    this.current = span;
    try {
      return fn();
    } finally {
      this.current = previous;
    }
  }

  activeSpan(): SpanHandle | undefined {
    return this.current;
  }

  startSpan(input: StartSpanInput): SpanHandle {
    const record: FakeSpanRecord = {
      id: `span-${this.nextSpanId}`,
      name: input.name,
      attributes: input.attributes,
      ended: false,
      exceptions: [],
      injectedCarriers: [],
    };
    this.nextSpanId += 1;
    this.spans.push(record);
    return {
      id: record.id,
      recordException: (error, attributes) => {
        record.exceptions.push({ error, attributes });
      },
      setAttributes: (attributes) => {
        record.attributes = { ...record.attributes, ...attributes };
      },
      end: (attributes) => {
        record.ended = true;
        record.endAttributes = attributes;
      },
      injectTraceContext: (carrier) => {
        // Deterministic fake W3C traceparent so tests can assert propagation.
        carrier.traceparent = `00-${record.id.padStart(32, "0").slice(0, 32)}-${record.id
          .padStart(16, "0")
          .slice(0, 16)}-01`;
        record.injectedCarriers.push(carrier);
      },
    };
  }

  emitLog(input: LogInput): void {
    this.logs.push(input);
  }

  emitException(input: ExceptionInput): void {
    this.exceptions.push(input);
  }
}
