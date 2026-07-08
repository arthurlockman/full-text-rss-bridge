import { pino, type LoggerOptions } from 'pino';
import { config } from './config.js';

const isDev = config.NODE_ENV === 'development';

export const loggerOptions: LoggerOptions = {
  level: config.LOG_LEVEL,
  transport: isDev
    ? {
        target: 'pino-pretty',
        options: { colorize: true, translateTime: 'SYS:HH:MM:ss', ignore: 'pid,hostname' },
      }
    : undefined,
};

export const logger = pino(loggerOptions);

export type Logger = typeof logger;
