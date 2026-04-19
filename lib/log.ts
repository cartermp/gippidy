import pino from 'pino';

const logger = pino({
  level: process.env.LOG_LEVEL ?? 'info',
  timestamp: pino.stdTimeFunctions.isoTime,
  redact: {
    paths: [
      'authorization',
      'cookie',
      'headers.authorization',
      'headers.cookie',
      'apiKey',
      'messages',
      '*.messages',
      'systemPrompt',
      '*.systemPrompt',
      'keyJwk',
      '*.keyJwk',
      'iv',
      '*.iv',
      'ciphertext',
      '*.ciphertext',
    ],
    remove: true,
  },
});

export type LogFields = Record<string, string | number | boolean | null | undefined>;

export function logByStatus(event: string, fields: LogFields) {
  const status = typeof fields.status === 'number' ? fields.status : 500;
  if (status >= 500) logger.error(fields, event);
  else if (status >= 400) logger.warn(fields, event);
  else logger.info(fields, event);
}

export function logRouteOutcome(event: string, startedAt: number, fields: LogFields) {
  logByStatus(event, { ...fields, durationMs: Date.now() - startedAt });
}

export default logger;
