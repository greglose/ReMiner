/**
 * States with stricter RVM laws or outright bans
 * This list should be verified with legal counsel
 */
const RESTRICTED_STATES: Record<string, { blocked: boolean; notes: string }> = {
  FL: {
    blocked: true,
    notes: "Florida requires prior express consent for RVM",
  },
  PA: {
    blocked: true,
    notes: "Pennsylvania Telemarketer Registration Act restrictions",
  },
  WA: {
    blocked: false,
    notes: "Washington requires registration; verify compliance",
  },
  WY: {
    blocked: false,
    notes: "Wyoming has specific telemarketing rules",
  },
  // Add more states as needed based on legal review
};

export interface StateCheckResult {
  allowed: boolean;
  reason?: string;
}

export interface FilteredLeads<T> {
  allowed: T[];
  blocked: Array<T & { blockReason: string }>;
}

/**
 * Check if RVM is allowed for a specific state
 */
export function isRvmAllowedForState(state: string): StateCheckResult {
  const stateUpper = state.toUpperCase();
  const restriction = RESTRICTED_STATES[stateUpper];

  if (restriction?.blocked) {
    return {
      allowed: false,
      reason: restriction.notes,
    };
  }

  return { allowed: true };
}

/**
 * Filter leads by state laws and config-blocked states
 */
export function filterLeadsByState<T extends { id: string; state: string }>(
  leads: T[],
  configBlockedStates: string[]
): FilteredLeads<T> {
  const allowed: T[] = [];
  const blocked: Array<T & { blockReason: string }> = [];

  const blockedStatesUpper = configBlockedStates.map((s) => s.toUpperCase());

  for (const lead of leads) {
    const stateUpper = lead.state.toUpperCase();

    // Check config blocked states first
    if (blockedStatesUpper.includes(stateUpper)) {
      blocked.push({
        ...lead,
        blockReason: "State blocked in config",
      });
      continue;
    }

    // Check legal restrictions
    const stateCheck = isRvmAllowedForState(lead.state);
    if (!stateCheck.allowed) {
      blocked.push({
        ...lead,
        blockReason: stateCheck.reason || "State restricted by law",
      });
      continue;
    }

    allowed.push(lead);
  }

  return { allowed, blocked };
}

/**
 * Get list of all restricted states
 */
export function getRestrictedStates(): Array<{
  state: string;
  blocked: boolean;
  notes: string;
}> {
  return Object.entries(RESTRICTED_STATES).map(([state, info]) => ({
    state,
    ...info,
  }));
}

/**
 * Check if a state requires special registration
 */
export function requiresRegistration(state: string): boolean {
  const stateUpper = state.toUpperCase();
  const restriction = RESTRICTED_STATES[stateUpper];

  // States that mention registration requirements
  return restriction?.notes?.toLowerCase().includes("registration") || false;
}
