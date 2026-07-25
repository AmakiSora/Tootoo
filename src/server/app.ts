import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import {
  applyMove,
  createMatch,
  getRanking,
  getScores,
  MATCH_LIMITS,
  matchPublicView,
  randomLegalAgent,
  runMatch,
  type MatchState,
  type Move,
} from "../engine/index.js";
import { memoryStore } from "./store/memory.js";

const createBody = z
  .object({
    width: z
      .number()
      .int()
      .min(MATCH_LIMITS.width.min)
      .max(MATCH_LIMITS.width.max)
      .optional(),
    height: z
      .number()
      .int()
      .min(MATCH_LIMITS.height.min)
      .max(MATCH_LIMITS.height.max)
      .optional(),
    contestantCount: z
      .number()
      .int()
      .min(MATCH_LIMITS.contestantCount.min)
      .max(MATCH_LIMITS.contestantCount.max)
      .optional(),
    turnsPerContestant: z
      .number()
      .int()
      .min(MATCH_LIMITS.turnsPerContestant.min)
      .max(MATCH_LIMITS.turnsPerContestant.max)
      .optional(),
    firstContestant: z.number().int().min(0).optional(),
  })
  .superRefine((body, ctx) => {
    const contestantCount = body.contestantCount ?? 2;
    if (
      body.firstContestant !== undefined &&
      body.firstContestant >= contestantCount
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["firstContestant"],
        message: `firstContestant must be less than contestantCount (${contestantCount})`,
      });
    }
  });

const moveBody = z.object({
  skill: z.enum(["dot", "cross", "line"]),
  x: z.number().int(),
  y: z.number().int(),
  axis: z.enum(["row", "col"]).optional(),
});

function summary(state: MatchState) {
  const n = state.config.contestantCount;
  return {
    ...matchPublicView(state),
    scores: getScores(state, n),
    ranking: state.finished ? getRanking(state) : undefined,
  };
}

export function buildApp() {
  const app = new Hono();

  app.get("/health", (c) => c.json({ ok: true }));

  app.post("/matches", zValidator("json", createBody), (c) => {
    const body = c.req.valid("json");
    const state = createMatch(body);
    const id = memoryStore.create(state);
    return c.json({ id, ...summary(state) }, 201);
  });

  app.get("/matches/:id", (c) => {
    const id = c.req.param("id");
    const state = memoryStore.get(id);
    if (!state) return c.json({ error: "not_found" }, 404);
    return c.json({ id, ...summary(state) });
  });

  app.get("/matches/:id/log", (c) => {
    const id = c.req.param("id");
    const state = memoryStore.get(id);
    if (!state) return c.json({ error: "not_found" }, 404);
    return c.json({ id, log: state.log });
  });

  app.post("/matches/:id/moves", zValidator("json", moveBody), (c) => {
    const id = c.req.param("id");
    const state = memoryStore.get(id);
    if (!state) return c.json({ error: "not_found" }, 404);
    if (state.finished) return c.json({ error: "match_finished" }, 400);

    const move = c.req.valid("json") as Move;
    const result = applyMove(state, move);
    if (!result.ok) {
      return c.json({ error: result.reason }, 400);
    }
    memoryStore.set(id, result.state);
    return c.json({ id, ...summary(result.state) });
  });

  app.post("/matches/:id/run", async (c) => {
    const id = c.req.param("id");
    const state = memoryStore.get(id);
    if (!state) return c.json({ error: "not_found" }, 404);
    if (state.finished) {
      return c.json({ id, ...summary(state) });
    }

    const n = state.config.contestantCount;
    const agents = Array.from({ length: n }, () => randomLegalAgent());
    const final = await runMatch(state, agents, { maxIllegalRetries: 500 });
    memoryStore.set(id, final);
    return c.json({ id, ...summary(final) });
  });

  return app;
}
