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
};

export class FakeTransport implements TelemetryTransport {
  spans: FakeSpanRecord[] = [];
  logs: LogInput[] = [];
  exceptions: ExceptionInput[] = [];
  private nextSpanId = 1;

  startSpan(input: StartSpanInput): SpanHandle {
    const record: FakeSpanRecord = {
      id: `span-${this.nextSpanId}`,
      name: input.name,
      attributes: input.attributes,
      ended: false,
      exceptions: [],
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
    };
  }

  emitLog(input: LogInput): void {
    this.logs.push(input);
  }

  emitException(input: ExceptionInput): void {
    this.exceptions.push(input);
  }
}
