export type LogLevel = 'error' | 'warn' | 'info' | 'debug' | 'verbose' | 'silly' | 'none';

type LogContext = Record<string, unknown>;
type NullableObject = LogContext | undefined | null;
type LogContextData = [] | [Error | NullableObject] | [Error | NullableObject, ...NullableObject[]];

const LEVEL = {
  ERROR: 'error',
  WARN: 'warn',
  INFO: 'info',
  DEBUG: 'debug',
  VERBOSE: 'verbose',
  SILLY: 'silly',
  NONE: 'none',
} satisfies Record<string, LogLevel>;

const LEVEL_MAP: Record<LogLevel, number> = {
  error: 10,
  warn: 8,
  info: 6,
  debug: 4,
  verbose: 2,
  silly: 0,
  none: -1,
};

const isDevelopment = () => typeof __DEV__ !== 'undefined' && __DEV__;
const DEFAULT_LEVEL: LogLevel = isDevelopment() ? LEVEL.SILLY : LEVEL.INFO;

class LoggerService {
  private level: LogLevel = DEFAULT_LEVEL;
  private module = '';
  private context: LogContext = {};

  public withContext(module: string, context?: LogContext): LoggerService {
    const logger = Object.create(this) as LoggerService;

    logger.level = this.level;
    logger.module = module;
    logger.context = { ...this.context, ...context };

    return logger;
  }

  public error(message: string, ...data: LogContextData): void {
    this.processLog(LEVEL.ERROR, message, data);
  }

  public warn(message: string, ...data: LogContextData): void {
    this.processLog(LEVEL.WARN, message, data);
  }

  public info(message: string, ...data: LogContextData): void {
    this.processLog(LEVEL.INFO, message, data);
  }

  public debug(message: string, ...data: LogContextData): void {
    this.processLog(LEVEL.DEBUG, message, data);
  }

  public verbose(message: string, ...data: LogContextData): void {
    this.processLog(LEVEL.VERBOSE, message, data);
  }

  public silly(message: string, ...data: LogContextData): void {
    this.processLog(LEVEL.SILLY, message, data);
  }

  public setLevel(level: LogLevel): void {
    this.level = level;
  }

  public getLevel(): LogLevel {
    return this.level;
  }

  public resetLevel(): void {
    this.setLevel(DEFAULT_LEVEL);
  }

  private processLog(level: LogLevel, message: string, data: LogContextData): void {
    if (!isDevelopment() || LEVEL_MAP[level] < LEVEL_MAP[this.level]) {
      return;
    }

    const logMessage = this.module ? `[${this.module}] ${message}` : message;
    const contextData = Object.keys(this.context).length > 0 ? [this.context] : [];
    const logData = [...contextData, ...data];

    switch (level) {
      case LEVEL.ERROR:
        console.error('%c<error>', 'color: red; font-weight: bold', logMessage, ...logData);
        break;
      case LEVEL.WARN:
        console.warn('%c<warn>', 'color: #FFA500; font-weight: bold', logMessage, ...logData);
        break;
      case LEVEL.INFO:
        console.info('%c<info>', 'color: #32CD32; font-weight: bold', logMessage, ...logData);
        break;
      case LEVEL.DEBUG:
        console.debug('%c<debug>', 'color: #7B68EE', logMessage, ...logData);
        break;
      case LEVEL.VERBOSE:
        console.debug('%c<verbose>', 'color: #808080', logMessage, ...logData);
        break;
      case LEVEL.SILLY:
        console.debug('%c<silly>', 'color: #808080', logMessage, ...logData);
        break;
    }
  }
}

export const loggerService = new LoggerService();
