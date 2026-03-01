import { logger } from "firebase-functions/v2";

interface LogContext {
  userId?: string;
  leadId?: string;
  function?: string;
  [key: string]: unknown;
}

export function logInfo(message: string, context?: LogContext): void {
  logger.info(message, {
    ...context,
    timestamp: new Date().toISOString(),
  });
}

export function logWarn(message: string, context?: LogContext): void {
  logger.warn(message, {
    ...context,
    timestamp: new Date().toISOString(),
  });
}

export function logError(
  message: string,
  error: Error | unknown,
  context?: LogContext
): void {
  const errorDetails =
    error instanceof Error
      ? { errorMessage: error.message, stack: error.stack }
      : { errorMessage: String(error) };

  logger.error(message, {
    ...context,
    ...errorDetails,
    timestamp: new Date().toISOString(),
  });
}

export function logMetric(
  metric: string,
  value: number,
  labels?: Record<string, string>
): void {
  logger.info("METRIC", {
    metric,
    value,
    labels,
    timestamp: new Date().toISOString(),
  });
}
