/** Empty cell */
export const EMPTY = null;
export type CellOwner = number | typeof EMPTY;

export type SkillId = "dot" | "cross" | "line";
export type Axis = "row" | "col";

export interface Move {
  skill: SkillId;
  x: number;
  y: number;
  /** Required when skill is `line` */
  axis?: Axis;
}

export const SKILL_COOLDOWN: Record<SkillId, number> = {
  dot: 0,
  cross: 1,
  line: 2,
};

export const SKILLS: SkillId[] = ["dot", "cross", "line"];

export const MATCH_LIMITS = {
  width: { min: 1, max: 32 },
  height: { min: 1, max: 32 },
  contestantCount: { min: 2, max: 4 },
  turnsPerContestant: { min: 1, max: 200 },
} as const;

export interface MatchConfig {
  width: number;
  height: number;
  /** 2–4 */
  contestantCount: number;
  /** Turns each contestant plays */
  turnsPerContestant: number;
  /** Index into 0..contestantCount-1; default 0 */
  firstContestant?: number;
}

export interface MatchState {
  config: Required<MatchConfig> & { firstContestant: number };
  /** row-major: index = y * width + x; null = empty, else contestant id */
  cells: CellOwner[];
  /** cooldowns[contestantId][skill] = remaining own-turns before usable */
  cooldowns: Record<SkillId, number>[];
  /** Whose turn (contestant id) */
  currentContestant: number;
  /** How many moves this contestant has already completed */
  movesCompleted: number[];
  /** Total plies applied */
  ply: number;
  finished: boolean;
  log: MatchLogEntry[];
}

export interface MatchLogEntry {
  ply: number;
  contestant: number;
  move: Move;
  /** Board snapshot after move */
  cells: CellOwner[];
  cooldowns: Record<SkillId, number>[];
  scores: number[];
}

export type IllegalReason =
  | "match_finished"
  | "unknown_skill"
  | "skill_on_cooldown"
  | "out_of_bounds"
  | "line_axis_required"
  | "line_axis_invalid"
  | "cross_center_empty";

export type ApplyResult =
  | { ok: true; state: MatchState }
  | { ok: false; reason: IllegalReason };

export interface RankingEntry {
  contestant: number;
  score: number;
  rank: number;
}
