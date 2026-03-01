export interface RetryOptions {
  maxAttempts?: number;
  initialDelayMs?: number;
  maxDelayMs?: number;
  backoffMultiplier?: number;
  retryableErrors?: string[];
}

const DEFAULT_OPTIONS: Required<RetryOptions> = {
  maxAttempts: 3,
  initialDelayMs: 1000,
  maxDelayMs: 30000,
  backoffMultiplier: 2,
  retryableErrors: [
    "ECONNRESET",
    "ETIMEDOUT",
    "ENOTFOUND",
    "EAI_AGAIN",
    "ECONNREFUSED",
    "EPIPE",
    "EHOSTUNREACH",
  ],
};

export async function withRetry<T>(
  fn: () => Promise<T>,
  options: RetryOptions = {}
): Promise<T> {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  let lastError: Error | null = null;
  let delay = opts.initialDelayMs;

  for (let attempt = 1; attempt <= opts.maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error as Error;

      const isRetryable = isRetryableError(error, opts.retryableErrors);

      if (!isRetryable || attempt === opts.maxAttempts) {
        throw error;
      }

      console.warn(
        `Attempt ${attempt}/${opts.maxAttempts} failed, retrying in ${delay}ms:`,
        error instanceof Error ? error.message : error
      );

      await sleep(delay);
      delay = Math.min(delay * opts.backoffMultiplier, opts.maxDelayMs);
    }
  }

  throw lastError;
}

function isRetryableError(error: unknown, retryableErrors: string[]): boolean {
  if (!(error instanceof Error)) {
    return false;
  }

  // Check error message for retryable patterns
  if (retryableErrors.some((e) => error.message.includes(e))) {
    return true;
  }

  // Check HTTP status codes
  const status = (error as { status?: number }).status;
  if (status !== undefined) {
    // Retry on 5xx errors and 429 (rate limit)
    if (status >= 500 || status === 429) {
      return true;
    }
  }

  // Check response status
  const response = (error as { response?: { status?: number } }).response;
  if (response?.status !== undefined) {
    if (response.status >= 500 || response.status === 429) {
      return true;
    }
  }

  return false;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export { sleep };
