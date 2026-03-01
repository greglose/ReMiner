import { describe, it, expect } from "vitest";
import {
  isRvmAllowedForState,
  filterLeadsByState,
  getRestrictedStates,
  requiresRegistration,
} from "../../rvm/stateFiltering";

describe("isRvmAllowedForState", () => {
  it("should block Florida (FL)", () => {
    const result = isRvmAllowedForState("FL");
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain("Florida");
  });

  it("should block Pennsylvania (PA)", () => {
    const result = isRvmAllowedForState("PA");
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain("Pennsylvania");
  });

  it("should allow Texas (TX)", () => {
    const result = isRvmAllowedForState("TX");
    expect(result.allowed).toBe(true);
    expect(result.reason).toBeUndefined();
  });

  it("should allow California (CA)", () => {
    const result = isRvmAllowedForState("CA");
    expect(result.allowed).toBe(true);
    expect(result.reason).toBeUndefined();
  });

  it("should handle lowercase state codes", () => {
    const result = isRvmAllowedForState("fl");
    expect(result.allowed).toBe(false);
  });

  it("should allow Washington (WA) with notes", () => {
    const result = isRvmAllowedForState("WA");
    expect(result.allowed).toBe(true);
  });
});

describe("filterLeadsByState", () => {
  interface TestLead {
    id: string;
    state: string;
  }

  it("should separate leads into allowed and blocked", () => {
    const leads: TestLead[] = [
      { id: "1", state: "TX" },
      { id: "2", state: "FL" },
      { id: "3", state: "CA" },
      { id: "4", state: "PA" },
    ];

    const { allowed, blocked } = filterLeadsByState(leads, []);

    expect(allowed).toHaveLength(2);
    expect(blocked).toHaveLength(2);
    expect(allowed.map((l) => l.id)).toEqual(["1", "3"]);
    expect(blocked.map((l) => l.id)).toEqual(["2", "4"]);
  });

  it("should block states from config blocked list", () => {
    const leads: TestLead[] = [
      { id: "1", state: "TX" },
      { id: "2", state: "NY" },
    ];

    const { allowed, blocked } = filterLeadsByState(leads, ["TX", "NY"]);

    expect(allowed).toHaveLength(0);
    expect(blocked).toHaveLength(2);
    expect(blocked[0].blockReason).toBe("State blocked in config");
    expect(blocked[1].blockReason).toBe("State blocked in config");
  });

  it("should include block reason from state restrictions", () => {
    const leads: TestLead[] = [{ id: "1", state: "FL" }];

    const { blocked } = filterLeadsByState(leads, []);

    expect(blocked).toHaveLength(1);
    expect(blocked[0].blockReason).toContain("consent");
  });

  it("should handle empty leads array", () => {
    const { allowed, blocked } = filterLeadsByState([], []);

    expect(allowed).toHaveLength(0);
    expect(blocked).toHaveLength(0);
  });

  it("should handle case-insensitive config blocked states", () => {
    const leads: TestLead[] = [{ id: "1", state: "TX" }];

    const { allowed, blocked } = filterLeadsByState(leads, ["tx"]);

    expect(allowed).toHaveLength(0);
    expect(blocked).toHaveLength(1);
  });
});

describe("getRestrictedStates", () => {
  it("should return array of restricted states", () => {
    const states = getRestrictedStates();

    expect(Array.isArray(states)).toBe(true);
    expect(states.length).toBeGreaterThan(0);
  });

  it("should include FL as blocked", () => {
    const states = getRestrictedStates();
    const florida = states.find((s) => s.state === "FL");

    expect(florida).toBeDefined();
    expect(florida?.blocked).toBe(true);
    expect(florida?.notes).toBeDefined();
  });

  it("should include WA as not blocked", () => {
    const states = getRestrictedStates();
    const washington = states.find((s) => s.state === "WA");

    expect(washington).toBeDefined();
    expect(washington?.blocked).toBe(false);
  });
});

describe("requiresRegistration", () => {
  it("should return true for states requiring registration", () => {
    // WA requires registration
    expect(requiresRegistration("WA")).toBe(true);
  });

  it("should return false for states not requiring registration", () => {
    // TX has no special requirements
    expect(requiresRegistration("TX")).toBe(false);
  });

  it("should handle lowercase state codes", () => {
    expect(requiresRegistration("wa")).toBe(true);
  });

  it("should return true for PA (Telemarketer Registration Act)", () => {
    expect(requiresRegistration("PA")).toBe(true);
  });
});
