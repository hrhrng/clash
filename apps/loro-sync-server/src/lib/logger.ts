/**
 * Structured Logger for Cloudflare Workers
 * Outputs JSON format for Logpush integration
 */

export type LogLevel = 'DEBUG' | 'INFO' | 'WARN' | 'ERROR';

export interface LogContext {
  requestId?: string;
  action?: string;
  nodeId?: string;
  taskId?: string;
  projectId?: string;
  duration?: string;
  [key: string]: unknown;
}

export class Logger {
  private readonly module: string;
  private readonly requestId?: string;

  constructor(module: string, requestId?: string) {
    this.module = module;
    this.requestId = requestId;
  }

  private format(level: LogLevel, message: string, context?: LogContext): string {
    return JSON.stringify({
      timestamp: new Date().toISOString(),
      level,
      module: this.module,
      requestId: this.requestId || context?.requestId,
      message,
      ...context,
    });
  }

  debug(message: string, context?: LogContext): void {
    console.debug(this.format('DEBUG', message, context));
  }

  info(message: string, context?: LogContext): void {
    console.info(this.format('INFO', message, context));
  }

  warn(message: string, context?: LogContext): void {
    console.warn(this.format('WARN', message, context));
  }

  error(message: string, error?: Error, context?: LogContext): void {
    const errorContext = error ? {
      errorName: error.name,
      errorMessage: error.message,
      stack: error.stack?.split('\n').slice(0, 5).join('\n'),
      ...context,
    } : context;
    console.error(this.format('ERROR', message, errorContext));
  }

  /**
   * Create a child logger with a sub-module name
   */
  child(subModule: string): Logger {
    return new Logger(`${this.module}:${subModule}`, this.requestId);
  }

  /**
   * Create a child logger with a specific requestId
   */
  withRequestId(requestId: string): Logger {
    return new Logger(this.module, requestId);
  }
}

/**
 * Factory function to create loggers
 */
export function createLogger(module: string, requestId?: string): Logger {
  return new Logger(module, requestId);
}
