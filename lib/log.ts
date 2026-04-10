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

export default logger;
