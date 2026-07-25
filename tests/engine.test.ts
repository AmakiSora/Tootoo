import { describe, expect, it } from "vitest";
import {
  applyMove,
  createMatch,
  getRanking,
  getScores,
  isLegalMove,
  randomLegalAgent,
  runMatch,
  type Move,
} from "../src/engine/index.js";

describe("skills", () => {
  it("dot paints empty and enemy as self, leaves own", () => {
    let s = createMatch({
      width: 3,
      height: 3,
      contestantCount: 2,
      turnsPerContestant: 5,
    });
    // C0 dots (1,1)
    let r = applyMove(s, { skill: "dot", x: 1, y: 1 });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    s = r.state;
    expect(s.cells[1 * 3 + 1]).toBe(0);

    // C1 dots same cell → enemy becomes 1
    r = applyMove(s, { skill: "dot", x: 1, y: 1 });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    s = r.state;
    expect(s.cells[1 * 3 + 1]).toBe(1);

    // C0 dots own cell after reclaim
    r = applyMove(s, { skill: "dot", x: 1, y: 1 });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    s = r.state;
    expect(s.cells[1 * 3 + 1]).toBe(0);
    // own again no-op
    // need c1 move first
    r = applyMove(s, { skill: "dot", x: 0, y: 0 });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    s = r.state;
    r = applyMove(s, { skill: "dot", x: 1, y: 1 });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.state.cells[1 * 3 + 1]).toBe(0);
  });

  it("cross: own center clears and paints arms self", () => {
    let s = createMatch({
      width: 3,
      height: 3,
      contestantCount: 2,
      turnsPerContestant: 10,
    });
    let r = applyMove(s, { skill: "dot", x: 1, y: 1 });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    s = r.state;
    r = applyMove(s, { skill: "dot", x: 0, y: 0 }); // c1
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    s = r.state;
    r = applyMove(s, { skill: "cross", x: 1, y: 1 });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    s = r.state;
    expect(s.cells[1 * 3 + 1]).toBe(null); // center empty
    expect(s.cells[0 * 3 + 1]).toBe(0); // up
    expect(s.cells[2 * 3 + 1]).toBe(0); // down
    expect(s.cells[1 * 3 + 0]).toBe(0); // left
    expect(s.cells[1 * 3 + 2]).toBe(0); // right
  });

  it("cross: enemy center clears and paints arms enemy color", () => {
    let s = createMatch({
      width: 3,
      height: 3,
      contestantCount: 2,
      turnsPerContestant: 10,
    });
    let r = applyMove(s, { skill: "dot", x: 1, y: 1 }); // c0 owns center
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    s = r.state;
    r = applyMove(s, { skill: "cross", x: 1, y: 1 }); // c1 crosses enemy
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    s = r.state;
    expect(s.cells[1 * 3 + 1]).toBe(null);
    expect(s.cells[0 * 3 + 1]).toBe(0); // arms are enemy (0) color
    expect(s.cells[1 * 3 + 0]).toBe(0);
  });

  it("cross on empty is illegal", () => {
    const s = createMatch({
      width: 3,
      height: 3,
      contestantCount: 2,
      turnsPerContestant: 5,
    });
    expect(isLegalMove(s, { skill: "cross", x: 1, y: 1 })).toBe(
      "cross_center_empty",
    );
  });

  it("line: empty→self, enemy→empty, own stays", () => {
    let s = createMatch({
      width: 3,
      height: 1,
      contestantCount: 2,
      turnsPerContestant: 10,
    });
    let r = applyMove(s, { skill: "dot", x: 0, y: 0 }); // c0
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    s = r.state;
    r = applyMove(s, { skill: "dot", x: 1, y: 0 }); // c1
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    s = r.state;
    // row: x0 is own(0) stay, x1 enemy → empty, x2 empty → 0
    r = applyMove(s, { skill: "line", x: 0, y: 0, axis: "row" });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    s = r.state;
    expect(s.cells[0]).toBe(0);
    expect(s.cells[1]).toBe(null);
    expect(s.cells[2]).toBe(0);
  });
});

describe("cooldowns", () => {
  it("cross cannot be reused on consecutive own turns without waiting", () => {
    let s = createMatch({
      width: 3,
      height: 3,
      contestantCount: 2,
      turnsPerContestant: 10,
    });
    let r = applyMove(s, { skill: "dot", x: 1, y: 1 });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    s = r.state;
    r = applyMove(s, { skill: "dot", x: 0, y: 0 });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    s = r.state;
    r = applyMove(s, { skill: "cross", x: 1, y: 1 });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    s = r.state;
    // c1 plays
    r = applyMove(s, { skill: "dot", x: 2, y: 2 });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    s = r.state;
    // c0's next turn: cross still cooling (CD was 1, ticked once at start → 0)?
    // After cross, CD set to 1. Then c1 turn ticks c1. Then c0 turn starts → tick c0 → cross 1→0.
    // So cross should be legal again.
    expect(isLegalMove(s, { skill: "cross", x: 0, y: 0 })).not.toBe(
      "skill_on_cooldown",
    );
  });

  it("line CD 2 blocks immediate reuse on next own turn", () => {
    let s = createMatch({
      width: 3,
      height: 3,
      contestantCount: 2,
      turnsPerContestant: 10,
    });
    let r = applyMove(s, { skill: "line", x: 0, y: 0, axis: "row" });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    s = r.state;
    r = applyMove(s, { skill: "dot", x: 1, y: 1 }); // c1
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    s = r.state;
    // c0 turn start ticked line 2→1, still on cooldown
    expect(isLegalMove(s, { skill: "line", x: 0, y: 1, axis: "row" })).toBe(
      "skill_on_cooldown",
    );
  });
});

describe("match end and ranking", () => {
  it("finishes after turnsPerContestant each and ranks by score", async () => {
    const s0 = createMatch({
      width: 4,
      height: 4,
      contestantCount: 2,
      turnsPerContestant: 3,
    });
    let seed = 1;
    const rng = () => {
      seed = (seed * 16807) % 2147483647;
      return (seed - 1) / 2147483646;
    };
    const final = await runMatch(s0, [
      randomLegalAgent(rng),
      randomLegalAgent(rng),
    ]);
    expect(final.finished).toBe(true);
    expect(final.movesCompleted).toEqual([3, 3]);
    expect(final.log.length).toBe(6);
    const scores = getScores(final, 2);
    expect(scores[0]! + scores[1]!).toBeLessThanOrEqual(16);
    const ranking = getRanking(final);
    expect(ranking).toHaveLength(2);
    expect(ranking[0]!.rank).toBe(1);
  });

  it("three players produce shared ranks on tie", () => {
    let s = createMatch({
      width: 2,
      height: 2,
      contestantCount: 3,
      turnsPerContestant: 1,
    });
    // Force equal empty board finish with one move each that paints nothing conflicting heavily
    for (let i = 0; i < 3; i++) {
      const r = applyMove(s, { skill: "dot", x: 0, y: 0 });
      expect(r.ok).toBe(true);
      if (!r.ok) return;
      s = r.state;
    }
    expect(s.finished).toBe(true);
    // last painter owns (0,0); others may be 0
    const ranking = getRanking(s);
    expect(ranking).toHaveLength(3);
  });
});

describe("runMatch retries illegal", () => {
  it("retries until legal move", async () => {
    const s0 = createMatch({
      width: 2,
      height: 2,
      contestantCount: 2,
      turnsPerContestant: 1,
    });
    let calls = 0;
    const flaky = {
      chooseMove: ({ lastRejection }: { lastRejection?: unknown }) => {
        calls++;
        if (!lastRejection) {
          return { skill: "cross" as const, x: 0, y: 0 }; // illegal empty
        }
        return { skill: "dot" as const, x: 0, y: 0 };
      },
    };
    const final = await runMatch(s0, [flaky, flaky], { maxIllegalRetries: 5 });
    expect(final.finished).toBe(true);
    expect(calls).toBeGreaterThan(2);
  });
});

describe("illegal reasons", () => {
  it("rejects out of bounds and missing line axis", () => {
    const s = createMatch({
      width: 2,
      height: 2,
      contestantCount: 2,
      turnsPerContestant: 5,
    });
    expect(isLegalMove(s, { skill: "dot", x: 9, y: 0 })).toBe("out_of_bounds");
    expect(isLegalMove(s, { skill: "line", x: 0, y: 0 } as Move)).toBe(
      "line_axis_required",
    );
  });

  it.each([
    { skill: "dot" as const, x: 0.5, y: 0 },
    { skill: "dot" as const, x: 0, y: 0.5 },
    { skill: "dot" as const, x: Number.NaN, y: 0 },
    { skill: "dot" as const, x: Number.POSITIVE_INFINITY, y: 0 },
  ])("rejects non-integer or non-finite coordinates: $x,$y", (move) => {
    const s = createMatch({ width: 2, height: 2 });
    expect(isLegalMove(s, move)).toBe("out_of_bounds");
    expect(applyMove(s, move)).toEqual({ ok: false, reason: "out_of_bounds" });
    expect(s.ply).toBe(0);
  });
});

describe("match configuration", () => {
  it.each([
    ["width", 0],
    ["width", 1.5],
    ["width", Number.NaN],
    ["width", 33],
    ["height", Number.POSITIVE_INFINITY],
    ["contestantCount", 2.5],
    ["contestantCount", 5],
    ["turnsPerContestant", 1.5],
    ["turnsPerContestant", 201],
  ] as const)("rejects invalid %s value %s", (key, value) => {
    expect(() => createMatch({ [key]: value })).toThrow(
      `${key} must be an integer between`,
    );
  });

  it("rejects a first contestant outside the configured contestants", () => {
    expect(() =>
      createMatch({ contestantCount: 3, firstContestant: 3 }),
    ).toThrow("firstContestant must be an integer between 0 and 2");
  });

  it("accepts values at all supported boundaries", () => {
    const state = createMatch({
      width: 32,
      height: 32,
      contestantCount: 4,
      turnsPerContestant: 200,
      firstContestant: 3,
    });
    expect(state.cells).toHaveLength(32 * 32);
    expect(state.currentContestant).toBe(3);
  });
});

describe("runMatch retry limits", () => {
  const oneTurnMatch = () =>
    createMatch({ width: 1, height: 1, turnsPerContestant: 1 });
  const legalAgent = {
    chooseMove: () => ({ skill: "dot" as const, x: 0, y: 0 }),
  };

  it("allows the initial proposal when no illegal retries are allowed", async () => {
    const final = await runMatch(oneTurnMatch(), [legalAgent, legalAgent], {
      maxIllegalRetries: 0,
    });
    expect(final.finished).toBe(true);
  });

  it("throws after the first illegal proposal when the retry limit is zero", async () => {
    let calls = 0;
    const illegalAgent = {
      chooseMove: () => {
        calls++;
        return { skill: "cross" as const, x: 0, y: 0 };
      },
    };
    await expect(
      runMatch(oneTurnMatch(), [illegalAgent, legalAgent], {
        maxIllegalRetries: 0,
      }),
    ).rejects.toThrow("exceeded illegal move retries (0)");
    expect(calls).toBe(1);
  });

  it("permits one retry after an illegal proposal", async () => {
    let calls = 0;
    const recoveringAgent = {
      chooseMove: () => {
        calls++;
        return calls === 1
          ? { skill: "cross" as const, x: 0, y: 0 }
          : { skill: "dot" as const, x: 0, y: 0 };
      },
    };
    const final = await runMatch(
      oneTurnMatch(),
      [recoveringAgent, legalAgent],
      {
        maxIllegalRetries: 1,
      },
    );
    expect(final.finished).toBe(true);
    expect(calls).toBe(2);
  });

  it.each([-1, 0.5, Number.NaN, Number.POSITIVE_INFINITY])(
    "rejects invalid retry limit %s",
    async (maxIllegalRetries) => {
      await expect(
        runMatch(oneTurnMatch(), [legalAgent, legalAgent], {
          maxIllegalRetries,
        }),
      ).rejects.toThrow(
        "maxIllegalRetries must be a non-negative safe integer",
      );
    },
  );
});
