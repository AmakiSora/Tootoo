import type { MatchState } from "../../engine/index.js";
import { randomUUID } from "node:crypto";

const matches = new Map<string, MatchState>();

export const memoryStore = {
  create(state: MatchState): string {
    const id = randomUUID();
    matches.set(id, state);
    return id;
  },
  get(id: string): MatchState | undefined {
    return matches.get(id);
  },
  set(id: string, state: MatchState): void {
    matches.set(id, state);
  },
  clear(): void {
    matches.clear();
  },
};
