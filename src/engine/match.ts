import { tickCooldownsForCurrent } from "./rules.js";
import {
  MATCH_LIMITS,
  SKILLS,
  type MatchConfig,
  type MatchState,
  type SkillId,
} from "./types.js";

const DEFAULTS = {
  width: 8,
  height: 8,
  contestantCount: 2,
  turnsPerContestant: 20,
  firstContestant: 0,
} as const;

function requireIntegerInRange(
  name: string,
  value: number,
  min: number,
  max: number,
): void {
  if (!Number.isInteger(value) || value < min || value > max) {
    throw new Error(`${name} must be an integer between ${min} and ${max}`);
  }
}

export function createMatch(partial: Partial<MatchConfig> = {}): MatchState {
  const width = partial.width ?? DEFAULTS.width;
  const height = partial.height ?? DEFAULTS.height;
  const contestantCount = partial.contestantCount ?? DEFAULTS.contestantCount;
  const turnsPerContestant =
    partial.turnsPerContestant ?? DEFAULTS.turnsPerContestant;
  const firstContestant = partial.firstContestant ?? DEFAULTS.firstContestant;

  requireIntegerInRange(
    "width",
    width,
    MATCH_LIMITS.width.min,
    MATCH_LIMITS.width.max,
  );
  requireIntegerInRange(
    "height",
    height,
    MATCH_LIMITS.height.min,
    MATCH_LIMITS.height.max,
  );
  requireIntegerInRange(
    "contestantCount",
    contestantCount,
    MATCH_LIMITS.contestantCount.min,
    MATCH_LIMITS.contestantCount.max,
  );
  requireIntegerInRange(
    "turnsPerContestant",
    turnsPerContestant,
    MATCH_LIMITS.turnsPerContestant.min,
    MATCH_LIMITS.turnsPerContestant.max,
  );
  if (
    !Number.isInteger(firstContestant) ||
    firstContestant < 0 ||
    firstContestant >= contestantCount
  ) {
    throw new Error(
      `firstContestant must be an integer between 0 and ${contestantCount - 1}`,
    );
  }

  const cells = Array.from({ length: width * height }, () => null);
  const emptyCd = (): Record<SkillId, number> => {
    const row = {} as Record<SkillId, number>;
    for (const s of SKILLS) row[s] = 0;
    return row;
  };
  const cooldowns = Array.from({ length: contestantCount }, () => emptyCd());
  const movesCompleted = Array.from({ length: contestantCount }, () => 0);

  let state: MatchState = {
    config: {
      width,
      height,
      contestantCount,
      turnsPerContestant,
      firstContestant,
    },
    cells,
    cooldowns,
    currentContestant: firstContestant,
    movesCompleted,
    ply: 0,
    finished: false,
    log: [],
  };

  // First player's turn begins: tick cooldowns (all zero — no-op, keeps symmetry)
  state = tickCooldownsForCurrent(state);
  return state;
}

export function matchPublicView(state: MatchState) {
  return {
    config: state.config,
    cells: state.cells,
    cooldowns: state.cooldowns,
    currentContestant: state.currentContestant,
    movesCompleted: state.movesCompleted,
    ply: state.ply,
    finished: state.finished,
  };
}
