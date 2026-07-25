import { applyMove, isLegalMove, listLegalMoveHints } from "./rules.js";
import type { MatchState, Move } from "./types.js";

export interface AgentContext {
  state: MatchState;
  contestant: number;
  /** Present when the previous proposal was illegal */
  lastRejection?: { move: Move; reason: string };
}

export interface PlayerAgent {
  chooseMove(ctx: AgentContext): Promise<Move> | Move;
}

export interface RunMatchOptions {
  onStep?: (state: MatchState, move: Move) => void;
  /** Safety cap for illegal retries per turn (default unlimited conceptually; use large number) */
  maxIllegalRetries?: number;
}

/**
 * Run until finished. On illegal moves, re-query the same agent with rejection info
 * until legal (ADR 0003). Optional maxIllegalRetries throws if exceeded.
 */
export async function runMatch(
  initial: MatchState,
  agents: PlayerAgent[],
  options: RunMatchOptions = {},
): Promise<MatchState> {
  const maxRetries = options.maxIllegalRetries ?? Number.MAX_SAFE_INTEGER;
  if (!Number.isSafeInteger(maxRetries) || maxRetries < 0) {
    throw new Error("maxIllegalRetries must be a non-negative safe integer");
  }
  let state = initial;

  while (!state.finished) {
    const contestant = state.currentContestant;
    const agent = agents[contestant];
    if (!agent) {
      throw new Error(`No agent for contestant ${contestant}`);
    }

    let lastRejection: AgentContext["lastRejection"];
    let illegalRetries = 0;
    for (;;) {
      const move = await agent.chooseMove({
        state,
        contestant,
        lastRejection,
      });
      const result = applyMove(state, move);
      if (result.ok) {
        state = result.state;
        options.onStep?.(state, move);
        break;
      }
      if (illegalRetries >= maxRetries) {
        throw new Error(
          `Contestant ${contestant} exceeded illegal move retries (${maxRetries})`,
        );
      }
      illegalRetries++;
      lastRejection = { move, reason: result.reason };
    }
  }

  return state;
}

/** Picks a random legal move; if none (should not happen mid-game), throws */
export function randomLegalAgent(rng: () => number = Math.random): PlayerAgent {
  return {
    chooseMove({ state }) {
      const legal = listLegalMoveHints(state);
      if (legal.length === 0) {
        // Fallback: try dot at 0,0 even if illegal — runner will retry poorly;
        // prefer throwing for tests
        throw new Error("No legal moves");
      }
      const i = Math.floor(rng() * legal.length);
      return legal[i]!;
    },
  };
}

export function fixedMoveAgent(moves: Move[]): PlayerAgent {
  let i = 0;
  return {
    chooseMove({ lastRejection }) {
      if (lastRejection) {
        // skip to next scripted move on rejection
      }
      const m = moves[i];
      i++;
      if (!m) throw new Error("fixedMoveAgent exhausted scripted moves");
      return m;
    },
  };
}

export { isLegalMove };
