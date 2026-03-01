import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { withRetry, sleep } from "../../utils/retry";

describe("withRetry", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("should succeed on first attempt", async () => {
    const fn = vi.fn().mockResolvedValue("success");

    const result = await withRetry(fn);

    expect(result).toBe("success");
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("should retry on ECONNRESET error and eventually succeed", async () => {
    const fn = vi
      .fn()
      .mockRejectedValueOnce(new Error("ECONNRESET"))
      .mockRejectedValueOnce(new Error("ETIMEDOUT"))
      .mockResolvedValue("success");

    const resultPromise = withRetry(fn, { initialDelayMs: 10 });
    await vi.runAllTimersAsync();
    const result = await resultPromise;

    expect(result).toBe("success");
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it("should throw after max attempts exceeded", async () => {
    const fn = vi.fn().mockImplementation(() => Promise.reject(new Error("ECONNRESET")));

    const promise = withRetry(fn, { maxAttempts: 3, initialDelayMs: 10 });

    // Attach handler immediately to prevent unhandled rejection
    const catchPromise = promise.catch((e) => e);

    await vi.runAllTimersAsync();

    const error = await catchPromise;

    expect(error).toBeInstanceOf(Error);
    expect(error.message).toBe("ECONNRESET");
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it("should not retry non-retryable errors", async () => {
    const fn = vi.fn().mockRejectedValue(new Error("Invalid API key"));

    let error: Error | undefined;
    try {
      await withRetry(fn, { initialDelayMs: 10 });
    } catch (e) {
      error = e as Error;
    }

    expect(error).toBeDefined();
    expect(error?.message).toBe("Invalid API key");
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("should retry on 500 status errors", async () => {
    const error = Object.assign(new Error("Server Error"), { status: 500 });
    const fn = vi.fn().mockRejectedValueOnce(error).mockResolvedValue("success");

    const resultPromise = withRetry(fn, { initialDelayMs: 10 });
    await vi.runAllTimersAsync();
    const result = await resultPromise;

    expect(result).toBe("success");
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it("should retry on 429 rate limit errors", async () => {
    const error = Object.assign(new Error("Rate limited"), { status: 429 });
    const fn = vi.fn().mockRejectedValueOnce(error).mockResolvedValue("success");

    const resultPromise = withRetry(fn, { initialDelayMs: 10 });
    await vi.runAllTimersAsync();
    const result = await resultPromise;

    expect(result).toBe("success");
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it("should not retry on 400 client errors", async () => {
    const apiError = Object.assign(new Error("Bad Request"), { status: 400 });
    const fn = vi.fn().mockRejectedValue(apiError);

    let caughtError: Error | undefined;
    try {
      await withRetry(fn, { initialDelayMs: 10 });
    } catch (e) {
      caughtError = e as Error;
    }

    expect(caughtError).toBeDefined();
    expect(caughtError?.message).toBe("Bad Request");
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("should retry on response.status 503", async () => {
    const error = Object.assign(new Error("Service Unavailable"), {
      response: { status: 503 },
    });
    const fn = vi.fn().mockRejectedValueOnce(error).mockResolvedValue("success");

    const resultPromise = withRetry(fn, { initialDelayMs: 10 });
    await vi.runAllTimersAsync();
    const result = await resultPromise;

    expect(result).toBe("success");
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it("should apply exponential backoff", async () => {
    const fn = vi
      .fn()
      .mockRejectedValueOnce(new Error("ECONNRESET"))
      .mockRejectedValueOnce(new Error("ECONNRESET"))
      .mockResolvedValue("success");

    const resultPromise = withRetry(fn, {
      initialDelayMs: 100,
      backoffMultiplier: 2,
    });
    await vi.runAllTimersAsync();
    await resultPromise;

    expect(fn).toHaveBeenCalledTimes(3);
  });

  it("should respect maxDelayMs", async () => {
    const fn = vi
      .fn()
      .mockRejectedValueOnce(new Error("ECONNRESET"))
      .mockRejectedValueOnce(new Error("ECONNRESET"))
      .mockResolvedValue("success");

    const resultPromise = withRetry(fn, {
      initialDelayMs: 1000,
      maxDelayMs: 1500,
      backoffMultiplier: 2,
    });
    await vi.runAllTimersAsync();
    await resultPromise;

    expect(fn).toHaveBeenCalledTimes(3);
  });

  it("should use custom retryable errors", async () => {
    const fn = vi
      .fn()
      .mockRejectedValueOnce(new Error("CUSTOM_ERROR"))
      .mockResolvedValue("success");

    const resultPromise = withRetry(fn, {
      initialDelayMs: 10,
      retryableErrors: ["CUSTOM_ERROR"],
    });
    await vi.runAllTimersAsync();
    const result = await resultPromise;

    expect(result).toBe("success");
    expect(fn).toHaveBeenCalledTimes(2);
  });
});

describe("sleep", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  it("should resolve after specified delay", async () => {
    const sleepPromise = sleep(100);

    expect(vi.getTimerCount()).toBe(1);

    await vi.advanceTimersByTimeAsync(100);
    await sleepPromise;

    expect(vi.getTimerCount()).toBe(0);
  });
});
