import {SpanStatusCode, trace, type Span} from '@opentelemetry/api';

const tracer = trace.getTracer('gippidy');

export interface ChatSpanAttributes {
  'chat.id': string;
  'chat.model': string;
  'chat.message_count'?: number;
  'chat.is_new_chat'?: boolean;
  'user.id': string;
  'user.message_count_24h'?: number;
  'user.entitlement_limit'?: number;
  'user.is_rate_limited'?: boolean;
}

export function createChatSpan(name: string, attributes?: Partial<ChatSpanAttributes>): Span {
  return tracer.startActiveSpan(name, sp => {
    if (attributes) {
      sp.setAttributes(attributes);
    }
    return sp;
  });
}

export function recordError(span: any, error: Error, context?: Record<string, any>): void {
  span.recordException(error);
  span.setStatus({
    code: SpanStatusCode.ERROR,
    message: error.message,
  });

  if (context) {
    span.setAttributes(context);
  }
}

export function getCurrentSpan(): Span | undefined {
  return trace.getActiveSpan();
}

export function recordErrorOnCurrentSpan(error: Error, context?: Record<string, any>): void {
  const span = getCurrentSpan();
  if (span) {
    recordError(span, error, context);
  }
}
