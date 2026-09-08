export type LogLevel = 'error' | 'warn' | 'info' | 'debug' | 'verbose' | 'silly' | 'none';

type LogContext = Record<string, unknown>;
type NullableObject = LogContext | undefined | null;
type LogContextData = [] | [Error | NullableObject] | [Error | NullableObject, ...NullableObject[]];

export type LogRecord = Record<string, unknown> & {
  timestamp: string;
  level: LogLevel;
  message: string;
  module: string;
  process: 'main';
};

let logWriter: ((record: LogRecord) => void) | undefined;

/** Bootstrap supplies the platform writer; shared logging has no native dependencies. */
export function installLogWriter(writer: (record: LogRecord) => void): () => void {
  logWriter = writer;
  return () => {
    if (logWriter === writer) logWriter = undefined;
  };
}

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

export class LoggerService {
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
    if (this.level === LEVEL.NONE || LEVEL_MAP[level] < LEVEL_MAP[this.level]) {
      return;
    }

    try {
      logWriter?.(createLogRecord(level, message, this.module, this.context, data));
    } catch {
      // A failed log transport must not change the operation being recorded.
    }
    if (!isDevelopment()) return;

    const logMessage = this.module ? `[${this.module}] ${message}` : message;
    const contextData = Object.keys(this.context).length > 0 ? [this.context] : [];
    const logData = [...contextData, ...data];

    switch (level) {
      case LEVEL.ERROR:
        console.error(logMessage, ...logData);
        break;
      case LEVEL.WARN:
        console.warn(logMessage, ...logData);
        break;
      case LEVEL.INFO:
        console.info(logMessage, ...logData);
        break;
      case LEVEL.DEBUG:
        console.debug(logMessage, ...logData);
        break;
      case LEVEL.VERBOSE:
        console.debug(logMessage, ...logData);
        break;
      case LEVEL.SILLY:
        console.debug(logMessage, ...logData);
        break;
    }
  }
}

/** Same caller-data merge and reserved source fields as the desktop file logger. */
export function createLogRecord(
  level: LogLevel,
  message: string,
  module: string,
  context: LogContext,
  data: readonly unknown[],
): LogRecord {
  const entry: Record<string, unknown> = {};
  const [first, ...others] = data;
  const rest: unknown[] = [];
  let fileMessage = message;
  if (first instanceof Error) {
    Object.assign(entry, first);
    entry.stack = first.stack;
    fileMessage = `${message} ${first.message}`;
  } else if (first !== null && typeof first === 'object') {
    Object.assign(entry, first);
  } else if (first !== undefined) {
    rest.push(first);
  }
  rest.push(
    ...others.map((value) =>
      value instanceof Error
        ? { ...value, name: value.name, message: value.message, stack: value.stack }
        : value,
    ),
  );
  if (rest.length > 0) entry.data = rest;
  if (Object.keys(context).length > 0) entry.context = context;
  return {
    ...entry,
    timestamp: new Date().toISOString(),
    level,
    message: fileMessage,
    module,
    process: 'main',
  };
}

export const loggerService = new LoggerService();
