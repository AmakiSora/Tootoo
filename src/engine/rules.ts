import { applySkill, cellAt, inBounds } from "./skills.js";
import { getScores } from "./score.js";
import {
  EMPTY,
  SKILL_COOLDOWN,
  SKILLS,
  type ApplyResult,
  type IllegalReason,
  type MatchState,
  type Move,
  type SkillId,
} from "./types.js";

export function isLegalMove(
  state: MatchState,
  move: Move,
): IllegalReason | null {
  if (state.finished) return "match_finished";

  if (!SKILLS.includes(move.skill)) return "unknown_skill";

  const { width, height } = state.config;
  if (!inBounds(width, height, move.x, move.y)) return "out_of_bounds";

  const cd = state.cooldowns[state.currentContestant]?.[move.skill] ?? 0;
  if (cd > 0) return "skill_on_cooldown";

  if (move.skill === "line") {
    if (move.axis === undefined) return "line_axis_required";
    if (move.axis !== "row" && move.axis !== "col") return "line_axis_invalid";
  }

  if (move.skill === "cross") {
    if (cellAt(state, move.x, move.y) === EMPTY) return "cross_center_empty";
  }

  return null;
}

/** Decrease current contestant's cooldowns by 1 at start of their turn */
export function tickCooldownsForCurrent(state: MatchState): MatchState {
  const c = state.currentContestant;
  const cooldowns = state.cooldowns.map((row, i) => {
    if (i !== c) return { ...row };
    const next = { ...row };
    for (const skill of SKILLS) {
      const v = next[skill] ?? 0;
      next[skill] = Math.max(0, v - 1);
    }
    return next;
  });
  return { ...state, cooldowns };
}

export function applyMove(state: MatchState, move: Move): ApplyResult {
  const reason = isLegalMove(state, move);
  if (reason) return { ok: false, reason };

  const self = state.currentContestant;
  const { width, height, turnsPerContestant, contestantCount } = state.config;

  const cells = applySkill(state.cells, width, height, move, self);

  const cooldowns = state.cooldowns.map((row, i) => {
    if (i !== self) return { ...row };
    const next = { ...row };
    next[move.skill] = SKILL_COOLDOWN[move.skill as SkillId];
    return next;
  });

  const movesCompleted = state.movesCompleted.slice();
  movesCompleted[self] = (movesCompleted[self] ?? 0) + 1;

  const scores = getScores({ cells }, contestantCount);

  const logEntry = {
    ply: state.ply,
    contestant: self,
    move: { ...move },
    cells: cells.slice(),
    cooldowns: cooldowns.map((r) => ({ ...r })),
    scores,
  };

  const log = state.log.concat(logEntry);
  const ply = state.ply + 1;

  const finished = movesCompleted.every((m) => (m ?? 0) >= turnsPerContestant);

  let nextState: MatchState = {
    ...state,
    cells,
    cooldowns,
    movesCompleted,
    ply,
    finished,
    log,
    currentContestant: self,
  };

  if (!finished) {
    nextState = {
      ...nextState,
      currentContestant: (self + 1) % contestantCount,
    };
    nextState = tickCooldownsForCurrent(nextState);
  }

  return { ok: true, state: nextState };
}

export function listLegalMoveHints(state: MatchState): Move[] {
  if (state.finished) return [];
  const { width, height } = state.config;
  const moves: Move[] = [];
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      for (const skill of SKILLS) {
        if (skill === "line") {
          for (const axis of ["row", "col"] as const) {
            const m: Move = { skill, x, y, axis };
            if (isLegalMove(state, m) === null) moves.push(m);
          }
        } else {
          const m: Move = { skill, x, y };
          if (isLegalMove(state, m) === null) moves.push(m);
        }
      }
    }
  }
  return moves;
}
