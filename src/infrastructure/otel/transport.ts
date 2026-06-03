import { context, propagation, SpanStatusCode, trace, type Context, type Span } from "@opentelemetry/api";
import { logs, SeverityNumber } from "@opentelemetry/api-logs";
import { W3CTraceContextPropagator } from "@opentelemetry/core";
import { OTLPLogExporter } from "@opentelemetry/exporter-logs-otlp-http";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http";
import { resourceFromAttributes } from "@opentelemetry/resources";
import { BatchLogRecordProcessor, LoggerProvider } from "@opentelemetry/sdk-logs";
import { BatchSpanProcessor } from "@opentelemetry/sdk-trace-base";
import { StackContextManager, WebTracerProvider } from "@opentelemetry/sdk-trace-web";
import type {
  ExceptionInput,
  LogInput,
  Severity,
  SpanHandle,
  StartSpanInput,
  TelemetryTransport,
} from "../../application/transport.js";
import type { AttributeValue } from "../../domain/attributes.js";

export type OTelTransportConfig = {
  endpoint: string;
  token: string;
  serviceName: string;
  resourceAttributes?: Record<string, AttributeValue>;
};

export class OTelTransport implements TelemetryTransport {
  private tracerProvider: WebTracerProvider;
  private loggerProvider: LoggerProvider;
  private tracer = trace.getTracer("@superlog/expo");
  private logger = logs.getLogger("@superlog/expo");

  constructor(config: OTelTransportConfig) {
    const endpoint = config.endpoint.replace(/\/+$/, "");
    const headers = { authorization: `Bearer ${config.token}` };
    const resource = resourceFromAttributes({
      "service.name": config.serviceName,
      ...config.resourceAttributes,
    });

    this.tracerProvider = new WebTracerProvider({
      resource,
      spanProcessors: [
        new BatchSpanProcessor(
          new OTLPTraceExporter({
            url: `${endpoint}/v1/traces`,
            headers,
          }),
        ),
      ],
    });
    // Register a context manager so spans nest by OTel context (not a mutable
    // stack) and a W3C propagator so traceparent/tracestate can be injected
    // into outbound requests. StackContextManager is synchronous-correct; full
    // cross-`await` propagation in React Native needs ZoneContextManager
    // (zone.js), left to the host app to opt into.
    this.tracerProvider.register({
      contextManager: new StackContextManager(),
      propagator: new W3CTraceContextPropagator(),
    });

    this.loggerProvider = new LoggerProvider({
      resource,
      processors: [
        new BatchLogRecordProcessor(
          new OTLPLogExporter({
            url: `${endpoint}/v1/logs`,
            headers,
          }),
        ),
      ],
    });
    logs.setGlobalLoggerProvider(this.loggerProvider);
    this.logger = this.loggerProvider.getLogger("@superlog/expo");
  }

  startSpan(input: StartSpanInput): SpanHandle {
    const span = this.tracer.startSpan(input.name, {
      attributes: input.attributes,
    });
    return new OTelSpanHandle(span);
  }

  withSpan<T>(span: SpanHandle, fn: () => T): T {
    return context.with(span.otelContext as Context, fn);
  }

  activeSpan(): SpanHandle | undefined {
    const span = trace.getSpan(context.active());
    return span ? new OTelSpanHandle(span) : undefined;
  }

  emitLog(input: LogInput): void {
    const otelContext = input.activeSpan?.otelContext;
    const record = {
      severityNumber: severityNumber(input.severity),
      severityText: input.severity,
      body: input.message,
      attributes: input.attributes,
    };
    if (otelContext) {
      this.logger.emit({ ...record, context: otelContext as never });
      return;
    }
    this.logger.emit(record);
  }

  emitException(input: ExceptionInput): void {
    this.emitLog({
      message: input.error instanceof Error ? input.error.message : String(input.error),
      severity: "error",
      attributes: input.attributes,
      activeSpan: input.activeSpan,
    });
  }

  async flush(): Promise<void> {
    await Promise.all([
      this.tracerProvider.forceFlush(),
      this.loggerProvider.forceFlush(),
    ]);
  }

  async shutdown(): Promise<void> {
    await Promise.all([
      this.tracerProvider.shutdown(),
      this.loggerProvider.shutdown(),
    ]);
  }
}

class OTelSpanHandle implements SpanHandle {
  readonly id: string;
  readonly otelContext: unknown;

  constructor(private readonly span: Span) {
    const spanContext = span.spanContext();
    this.id = spanContext.spanId;
    this.otelContext = trace.setSpan(context.active(), span);
  }

  recordException(error: unknown): void {
    this.span.recordException(error instanceof Error ? error : String(error));
    this.span.setStatus({
      code: SpanStatusCode.ERROR,
      message: error instanceof Error ? error.message : String(error),
    });
  }

  setAttributes(attributes: Record<string, AttributeValue | undefined>): void {
    for (const [key, value] of Object.entries(attributes)) {
      if (value !== undefined) this.span.setAttribute(key, value);
    }
  }

  injectTraceContext(carrier: Record<string, string>): void {
    propagation.inject(this.otelContext as Context, carrier);
  }

  end(attributes?: Record<string, AttributeValue | undefined>): void {
    this.setAttributes(attributes ?? {});
    this.span.end();
  }
}

function severityNumber(severity: Severity): SeverityNumber {
  switch (severity) {
    case "fatal":
      return SeverityNumber.FATAL;
    case "error":
      return SeverityNumber.ERROR;
    case "warning":
      return SeverityNumber.WARN;
    case "debug":
      return SeverityNumber.DEBUG;
    case "info":
    default:
      return SeverityNumber.INFO;
  }
}
