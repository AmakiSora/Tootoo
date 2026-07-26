import { Hono } from "hono";
import { serveStatic } from "@hono/node-server/serve-static";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import {
  applyMove,
  createMatch,
  getRanking,
  getScores,
  MATCH_LIMITS,
  matchPublicView,
  type MatchState,
  type Move,
} from "../engine/index.js";
import { memoryStore, seatName, type MatchRecord } from "./store/memory.js";
import { authenticateContestant, authenticateHost } from "./auth.js";

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
    /** When true, the host also claims the first seat and gets a player token. */
    participate: z.boolean().optional(),
    /** Host display name when participating. */
    name: z.string().trim().min(1).max(24).optional(),
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

const joinBody = z
  .object({
    /** Player display name; falls back to 选手 N when omitted. */
    name: z.string().trim().min(1).max(24).optional(),
  })
  .optional();

function summary(state: MatchState, record: MatchRecord) {
  const n = state.config.contestantCount;
  return {
    ...matchPublicView(state),
    names: Array.from({ length: n }, (_, i) => seatName(record, i)),
    scores: getScores(state, n),
    ranking: state.finished ? getRanking(state) : undefined,
  };
}

/** Public lobby view — seats and names only, never tokens. */
function lobbyView(id: string, record: MatchRecord) {
  const joined = record.seatOrder.length;
  return {
    id,
    phase: record.phase,
    contestantCount: record.config.contestantCount,
    joinedCount: joined,
    seats: record.seatOrder.map((seat) => ({
      contestant: seat,
      taken: true,
      name: seatName(record, seat),
    })),
  };
}

/** Fills defaults so the stored config is fully resolved. */
function resolveConfig(body: z.infer<typeof createBody>): MatchRecord["config"] {
  return {
    width: body.width ?? 8,
    height: body.height ?? 8,
    contestantCount: body.contestantCount ?? 2,
    turnsPerContestant: body.turnsPerContestant ?? 20,
    ...(body.firstContestant !== undefined
      ? { firstContestant: body.firstContestant }
      : {}),
  };
}

export function buildApp() {
  const app = new Hono();

  app.get("/health", (c) => c.json({ ok: true }));

  app.post("/matches", zValidator("json", createBody), (c) => {
    const body = c.req.valid("json");
    const { id, hostToken } = memoryStore.create(resolveConfig(body));

    let player: { contestant: number; token: string; name: string } | null = null;
    if (body.participate === true) {
      const joined = memoryStore.join(id, body.name ?? "");
      if (joined) {
        const record = memoryStore.getRecord(id)!;
        player = {
          contestant: joined.seat,
          token: joined.token,
          name: seatName(record, joined.seat),
        };
      }
    }

    const record = memoryStore.getRecord(id)!;
    return c.json({ id, hostToken, player, lobby: lobbyView(id, record) }, 201);
  });

  app.get("/matches/:id/lobby", (c) => {
    const record = memoryStore.getRecord(c.req.param("id"));
    if (!record) return c.json({ error: "not_found" }, 404);
    return c.json(lobbyView(c.req.param("id"), record));
  });

  app.post("/matches/:id/join", async (c) => {
    const id = c.req.param("id");
    const record = memoryStore.getRecord(id);
    if (!record) return c.json({ error: "not_found" }, 404);
    if (record.phase !== "lobby") {
      return c.json({ error: "match_already_started" }, 409);
    }
    // Body is optional ({ name?: string }); anything unparsable counts as empty.
    const rawBody = await c.req.json().catch(() => undefined);
    let name = "";
    if (rawBody !== undefined && rawBody !== null) {
      const parsed = joinBody.safeParse(rawBody);
      if (!parsed.success) {
        return c.json(
          { error: { issues: parsed.error.issues, name: "ZodError" } },
          400,
        );
      }
      name = parsed.data?.name ?? "";
    }
    const joined = memoryStore.join(id, name);
    if (!joined) return c.json({ error: "match_full" }, 409);
    const fresh = memoryStore.getRecord(id)!;
    return c.json(
      {
        id,
        player: {
          contestant: joined.seat,
          token: joined.token,
          name: seatName(fresh, joined.seat),
        },
        lobby: lobbyView(id, fresh),
      },
      201,
    );
  });

  app.post("/matches/:id/start", (c) => {
    const id = c.req.param("id");
    const record = memoryStore.getRecord(id);
    if (!record) return c.json({ error: "not_found" }, 404);

    const host = authenticateHost(c, record);
    if (!host.ok) return c.json({ error: host.error }, host.status);

    if (record.phase !== "lobby") {
      return c.json({ error: "match_already_started" }, 409);
    }
    if (record.seatOrder.length !== record.config.contestantCount) {
      return c.json(
        {
          error: "not_enough_players",
          joined: record.seatOrder.length,
          required: record.config.contestantCount,
        },
        409,
      );
    }

    // Map engine seats to join order: engine contestant i is the i-th joiner,
    // and the requested firstContestant selects which joiner moves first.
    const state = createMatch({
      ...record.config,
      firstContestant: record.config.firstContestant ?? 0,
    });
    memoryStore.start(id, state);
    return c.json({ id, ...summary(state, record) });
  });

  app.get("/matches/:id", (c) => {
    const id = c.req.param("id");
    const record = memoryStore.getRecord(id);
    if (!record) return c.json({ error: "not_found" }, 404);
    if (record.phase === "lobby" || !record.state) {
      return c.json({ id, phase: "lobby", lobby: lobbyView(id, record) });
    }
    return c.json({ id, ...summary(record.state, record) });
  });

  app.get("/matches/:id/log", (c) => {
    const id = c.req.param("id");
    const record = memoryStore.getRecord(id);
    if (!record) return c.json({ error: "not_found" }, 404);
    if (record.phase === "lobby" || !record.state) {
      return c.json({ error: "match_not_started" }, 409);
    }
    return c.json({ id, log: record.state.log });
  });

  app.post("/matches/:id/moves", zValidator("json", moveBody), (c) => {
    const id = c.req.param("id");
    const record = memoryStore.getRecord(id);
    if (!record) return c.json({ error: "not_found" }, 404);

    const auth = authenticateContestant(c, record);
    if (!auth.ok) return c.json({ error: auth.error }, auth.status);

    if (record.phase === "lobby" || !record.state) {
      return c.json({ error: "match_not_started" }, 409);
    }
    if (record.state.finished) return c.json({ error: "match_finished" }, 400);
    if (auth.contestant !== record.state.currentContestant) {
      return c.json({ error: "not_your_turn" }, 403);
    }

    const move = c.req.valid("json") as Move;
    const result = applyMove(record.state, move);
    if (!result.ok) {
      return c.json({ error: result.reason }, 400);
    }
    memoryStore.set(id, result.state);
    return c.json({ id, ...summary(result.state, record) });
  });

  app.use(
    "/*",
    serveStatic({
      root: "./public",
      rewriteRequestPath: (path) => (path === "/" ? "/lobby.html" : path),
    }),
  );

  return app;
}
