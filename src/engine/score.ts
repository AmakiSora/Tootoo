import { EMPTY, type CellOwner, type MatchState, type RankingEntry } from "./types.js";

export function getScores(
  state: Pick<MatchState, "cells">,
  contestantCount: number,
): number[] {
  const scores = Array.from({ length: contestantCount }, () => 0);
  for (const cell of state.cells) {
    if (cell !== EMPTY && cell !== null && cell >= 0 && cell < contestantCount) {
      scores[cell] = (scores[cell] ?? 0) + 1;
    }
  }
  return scores;
}

/** Dense ranks: equal scores share rank; next rank skips (1,2,2,4) style — use competition ranking */
export function getRanking(state: MatchState): RankingEntry[] {
  const n = state.config.contestantCount;
  const scores = getScores(state, n);
  const order = scores
    .map((score, contestant) => ({ contestant, score }))
    .sort((a, b) => b.score - a.score || a.contestant - b.contestant);

  const ranking: RankingEntry[] = [];
  let i = 0;
  while (i < order.length) {
    const score = order[i]!.score;
    let j = i;
    while (j < order.length && order[j]!.score === score) j++;
    const rank = i + 1;
    for (let k = i; k < j; k++) {
      ranking.push({
        contestant: order[k]!.contestant,
        score: order[k]!.score,
        rank,
      });
    }
    i = j;
  }
  return ranking;
}

export function countNonEmpty(cells: CellOwner[]): number {
  let n = 0;
  for (const c of cells) {
    if (c !== EMPTY && c !== null) n++;
  }
  return n;
}
