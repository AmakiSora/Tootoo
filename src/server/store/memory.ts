import type { MatchState } from "../../engine/index.js";
import { randomUUID } from "node:crypto";

/** Server-side room record: a match plus its lobby/auth metadata.
 *  Never exposed to the engine, and never serialized into responses as-is. */
export interface MatchRecord {
  /** Match configuration captured at creation; used to build state on start. */
  config: {
    width: number;
    height: number;
    contestantCount: number;
    turnsPerContestant: number;
    firstContestant?: number;
  };
  /** Null while the room is still in the lobby (not started). */
  state: MatchState | null;
  /** Bearer token of the room host — required to start the match. */
  hostToken: string;
  /** token -> contestant seat, filled as players join. */
  tokens: Map<string, number>;
  /** Seats in join order; seatOrder[0] moves first once started. */
  seatOrder: number[];
  /** Player display names in join order (seats share the same index). */
  names: string[];
  phase: "lobby" | "active";
}

const matches = new Map<string, MatchRecord>();

/** Display name a seat falls back to when its player gave none. */
export function seatName(record: MatchRecord, seat: number): string {
  return record.names[seat] || `选手 ${seat + 1}`;
}

export const memoryStore = {
  /** Creates an empty lobby room with a fresh host token. */
  create(config: MatchRecord["config"]): { id: string; hostToken: string } {
    const id = randomUUID();
    const hostToken = randomUUID();
    matches.set(id, {
      config,
      state: null,
      hostToken,
      tokens: new Map(),
      seatOrder: [],
      names: [],
      phase: "lobby",
    });
    return { id, hostToken };
  },

  getRecord(id: string): MatchRecord | undefined {
    return matches.get(id);
  },

  /** Claims the next free seat for a new token. Returns the seat, or null when full. */
  join(id: string, name = ""): { seat: number; token: string } | null {
    const record = matches.get(id);
    if (!record || record.phase !== "lobby") return null;
    if (record.seatOrder.length >= record.config.contestantCount) return null;
    const seat = record.seatOrder.length;
    const token = randomUUID();
    record.tokens.set(token, seat);
    record.seatOrder.push(seat);
    record.names.push(name);
    return { seat, token };
  },

  /** Attaches the started match state and flips the room to active. */
  start(id: string, state: MatchState): void {
    const record = matches.get(id);
    if (!record) return;
    record.state = state;
    record.phase = "active";
  },

  /** Updates state in place; tokens and lobby metadata always survive. */
  set(id: string, state: MatchState): void {
    const record = matches.get(id);
    if (record) record.state = state;
  },

  clear(): void {
    matches.clear();
  },
};
