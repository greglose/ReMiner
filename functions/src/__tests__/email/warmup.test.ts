import { describe, it, expect } from "vitest";
import { getDailyLimit, getWarmupSchedule } from "../../email/warmup";

describe("getDailyLimit", () => {
  it("should return 50 for day 1", () => {
    expect(getDailyLimit(1)).toBe(50);
  });

  it("should return 75 for day 2", () => {
    expect(getDailyLimit(2)).toBe(75);
  });

  it("should return 100 for day 3", () => {
    expect(getDailyLimit(3)).toBe(100);
  });

  it("should return 400 for day 7", () => {
    expect(getDailyLimit(7)).toBe(400);
  });

  it("should return 2000 for day 14", () => {
    expect(getDailyLimit(14)).toBe(2000);
  });

  it("should return 2000 (max) for day 15 and beyond", () => {
    expect(getDailyLimit(15)).toBe(2000);
    expect(getDailyLimit(100)).toBe(2000);
    expect(getDailyLimit(365)).toBe(2000);
  });

  it("should return first day limit for day 0", () => {
    expect(getDailyLimit(0)).toBe(50);
  });

  it("should return first day limit for negative days", () => {
    expect(getDailyLimit(-1)).toBe(50);
    expect(getDailyLimit(-100)).toBe(50);
  });
});

describe("getWarmupSchedule", () => {
  it("should return array of 14 daily limits", () => {
    const schedule = getWarmupSchedule();

    expect(Array.isArray(schedule)).toBe(true);
    expect(schedule).toHaveLength(14);
  });

  it("should start at 50 emails/day", () => {
    const schedule = getWarmupSchedule();

    expect(schedule[0]).toBe(50);
  });

  it("should end at 2000 emails/day", () => {
    const schedule = getWarmupSchedule();

    expect(schedule[schedule.length - 1]).toBe(2000);
  });

  it("should have monotonically increasing limits", () => {
    const schedule = getWarmupSchedule();

    for (let i = 1; i < schedule.length; i++) {
      expect(schedule[i]).toBeGreaterThan(schedule[i - 1]);
    }
  });

  it("should return a copy of the schedule (not original array)", () => {
    const schedule1 = getWarmupSchedule();
    const schedule2 = getWarmupSchedule();

    schedule1[0] = 999;

    expect(schedule2[0]).toBe(50);
  });
});
