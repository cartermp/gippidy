import {SpanStatusCode, trace, Span} from '@opentelemetry/api';

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

export interface AISpanAttributes {
  'ai.model.name': string;
  'ai.tools.active': string[];
  'ai.tools.called'?: string[];
  'ai.response.streaming'?: boolean;
  'ai.response.tokens'?: number;
  'ai.response.finish_reason'?: string;
}

export interface BusinessSpanAttributes {
  'business.event': string;
  'business.artifact_type'?: string;
  'business.new_user'?: boolean;
  'business.error_type'?: string;
  'business.rate_limited'?: boolean;
}

export function createChatSpan(name: string, attributes?: Partial<ChatSpanAttributes>): Span {
  return tracer.startActiveSpan(name, sp => {
    if (attributes) {
      sp.setAttributes(attributes);
    }
    return sp;
  });
}

export function createAISpan(name: string, attributes?: Partial<AISpanAttributes>): Span {
  return tracer.startActiveSpan(name, sp => {
    if (attributes) {
      sp.setAttributes(attributes);
    }
    return sp;
  });
}

export function createBusinessSpan(name: string, attributes?: Partial<BusinessSpanAttributes>): Span {
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
