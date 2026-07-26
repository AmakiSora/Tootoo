import { beforeEach, describe, expect, it } from "vitest";
import { buildApp } from "../src/server/app.js";
import { memoryStore } from "../src/server/store/memory.js";

function jsonRequest(body: unknown, token?: string): RequestInit {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (token) headers.authorization = `Bearer ${token}`;
  return { method: "POST", headers, body: JSON.stringify(body) };
}

function postEmpty(token?: string): RequestInit {
  const headers: Record<string, string> = {};
  if (token) headers.authorization = `Bearer ${token}`;
  return { method: "POST", headers };
}

interface Player {
  contestant: number;
  token: string;
  name?: string;
}

interface Lobby {
  id: string;
  phase: string;
  contestantCount: number;
  joinedCount: number;
  seats: { contestant: number; taken: boolean; name?: string }[];
}

async function createRoom(
  app: ReturnType<typeof buildApp>,
  body: Record<string, unknown> = {},
) {
  const response = await app.request("/matches", jsonRequest(body));
  const data = (await response.json()) as {
    id: string;
    hostToken: string;
    player: Player | null;
    lobby: Lobby;
  };
  return { response, ...data };
}

async function joinRoom(
  app: ReturnType<typeof buildApp>,
  id: string,
): Promise<Player> {
  const response = await app.request(`/matches/${id}/join`, postEmpty());
  expect(response.status).toBe(201);
  const data = (await response.json()) as { player: Player };
  return data.player;
}

/** Creates a room with the host participating, fills remaining seats, starts it. */
async function startDuel(
  app: ReturnType<typeof buildApp>,
  body: Record<string, unknown> = {},
): Promise<{ id: string; players: Player[] }> {
  const room = await createRoom(app, { participate: true, ...body });
  expect(room.response.status).toBe(201);
  expect(room.player).not.toBeNull();
  const players: Player[] = [room.player!];
  const count = (body.contestantCount as number | undefined) ?? 2;
  while (players.length < count) {
    players.push(await joinRoom(app, room.id));
  }
  const started = await app.request(
    `/matches/${room.id}/start`,
    postEmpty(room.hostToken),
  );
  expect(started.status).toBe(200);
  return { id: room.id, players };
}

function tokenOf(players: Player[], contestant: number): string {
  const p = players.find((pl) => pl.contestant === contestant);
  if (!p) throw new Error(`no player at seat ${contestant}`);
  return p.token;
}

describe("HTTP API", () => {
  beforeEach(() => memoryStore.clear());

  it("reports health", async () => {
    const response = await buildApp().request("/health");
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ok: true });
  });

  it("creates an empty room with a host token and lobby view", async () => {
    const app = buildApp();
    const room = await createRoom(app, {
      width: 3,
      height: 2,
      contestantCount: 3,
      turnsPerContestant: 2,
    });
    expect(room.response.status).toBe(201);
    expect(room.hostToken).toBeTruthy();
    expect(room.player).toBeNull();
    expect(room.lobby).toMatchObject({
      phase: "lobby",
      contestantCount: 3,
      joinedCount: 0,
      seats: [],
    });

    const lobby = await app.request(`/matches/${room.id}/lobby`);
    expect(lobby.status).toBe(200);
    expect(await lobby.json()).toMatchObject({
      id: room.id,
      phase: "lobby",
      joinedCount: 0,
    });
  });

  it("lets the host participate and claim the first seat", async () => {
    const app = buildApp();
    const room = await createRoom(app, { participate: true });
    expect(room.response.status).toBe(201);
    expect(room.player).toMatchObject({ contestant: 0 });
    expect(typeof room.player!.token).toBe("string");
    expect(room.lobby.joinedCount).toBe(1);
  });

  it("stores player names and echoes them in lobby and match views", async () => {
    const app = buildApp();
    const room = await createRoom(app, { participate: true, name: "小明" });
    expect(room.response.status).toBe(201);
    expect(room.player).toMatchObject({ contestant: 0, name: "小明" });
    expect(room.lobby.seats[0]).toMatchObject({ name: "小明" });

    const join = await app.request(
      `/matches/${room.id}/join`,
      jsonRequest({ name: "小红" }),
    );
    expect(join.status).toBe(201);
    const joinData = (await join.json()) as {
      player: { contestant: number; name: string };
    };
    expect(joinData.player).toMatchObject({ contestant: 1, name: "小红" });

    const lobby = await app.request(`/matches/${room.id}/lobby`);
    expect(((await lobby.json()) as Lobby).seats.map((s) => s.name)).toEqual([
      "小明",
      "小红",
    ]);

    const started = await app.request(
      `/matches/${room.id}/start`,
      postEmpty(room.hostToken),
    );
    expect(((await started.json()) as { names: string[] }).names).toEqual([
      "小明",
      "小红",
    ]);

    const fetched = await app.request(`/matches/${room.id}`);
    expect(((await fetched.json()) as { names: string[] }).names).toEqual([
      "小明",
      "小红",
    ]);
  });

  it("falls back to default seat names when no name is given", async () => {
    const app = buildApp();
    const { id } = await startDuel(app, { width: 2, height: 2 });
    const fetched = await app.request(`/matches/${id}`);
    expect(((await fetched.json()) as { names: string[] }).names).toEqual([
      "选手 1",
      "选手 2",
    ]);
  });

  it.each([{ name: "" }, { name: "   " }, { name: "x".repeat(25) }])(
    "rejects an invalid join name: %j",
    async (body) => {
      const app = buildApp();
      const room = await createRoom(app, { contestantCount: 2 });
      const response = await app.request(
        `/matches/${room.id}/join`,
        jsonRequest(body),
      );
      expect(response.status).toBe(400);
    },
  );

  it.each([{ name: "" }, { name: "x".repeat(25) }])(
    "rejects an invalid host name at creation: %j",
    async (body) => {
      const { response } = await createRoom(buildApp(), {
        participate: true,
        ...body,
      });
      expect(response.status).toBe(400);
    },
  );

  it.each([
    { contestantCount: 2, firstContestant: 2 },
    { contestantCount: 3, firstContestant: 3 },
    { firstContestant: 2 },
  ])("rejects firstContestant outside contestantCount: %j", async (body) => {
    const { response } = await createRoom(buildApp(), body);
    expect(response.status).toBe(400);
  });

  it.each([
    { width: 0 },
    { width: 1.5 },
    { width: 33 },
    { contestantCount: 5 },
    { turnsPerContestant: 201 },
  ])("rejects invalid numeric configuration: %j", async (body) => {
    const { response } = await createRoom(buildApp(), body);
    expect(response.status).toBe(400);
  });

  it("joins players into seats and rejects join when full or started", async () => {
    const app = buildApp();
    const room = await createRoom(app, { contestantCount: 2 });

    const p1 = await joinRoom(app, room.id);
    const p2 = await joinRoom(app, room.id);
    expect(p1.contestant).toBe(0);
    expect(p2.contestant).toBe(1);
    expect(p1.token).not.toBe(p2.token);

    const full = await app.request(`/matches/${room.id}/join`, postEmpty());
    expect(full.status).toBe(409);
    await expect(full.json()).resolves.toEqual({ error: "match_full" });

    // Start the room, then join must also be rejected.
    const started = await app.request(
      `/matches/${room.id}/start`,
      postEmpty(room.hostToken),
    );
    expect(started.status).toBe(200);
    const late = await app.request(`/matches/${room.id}/join`, postEmpty());
    expect(late.status).toBe(409);
    await expect(late.json()).resolves.toEqual({
      error: "match_already_started",
    });
  });

  it("requires the host token to start and refuses to start twice or underfilled", async () => {
    const app = buildApp();
    const room = await createRoom(app, { contestantCount: 2 });

    const noToken = await app.request(`/matches/${room.id}/start`, postEmpty());
    expect(noToken.status).toBe(401);
    await expect(noToken.json()).resolves.toEqual({
      error: "host_token_required",
    });

    const badToken = await app.request(
      `/matches/${room.id}/start`,
      postEmpty("not-the-host-token"),
    );
    expect(badToken.status).toBe(401);
    await expect(badToken.json()).resolves.toEqual({
      error: "host_token_invalid",
    });

    const underfilled = await app.request(
      `/matches/${room.id}/start`,
      postEmpty(room.hostToken),
    );
    expect(underfilled.status).toBe(409);
    await expect(underfilled.json()).resolves.toMatchObject({
      error: "not_enough_players",
      joined: 0,
      required: 2,
    });

    await joinRoom(app, room.id);
    await joinRoom(app, room.id);
    const started = await app.request(
      `/matches/${room.id}/start`,
      postEmpty(room.hostToken),
    );
    expect(started.status).toBe(200);
    expect(await started.json()).toMatchObject({
      id: room.id,
      currentContestant: 0,
      finished: false,
    });

    const again = await app.request(
      `/matches/${room.id}/start`,
      postEmpty(room.hostToken),
    );
    expect(again.status).toBe(409);
    await expect(again.json()).resolves.toEqual({
      error: "match_already_started",
    });
  });

  it("honours firstContestant when starting", async () => {
    const app = buildApp();
    const room = await createRoom(app, {
      contestantCount: 3,
      firstContestant: 2,
    });
    await joinRoom(app, room.id);
    await joinRoom(app, room.id);
    await joinRoom(app, room.id);
    const started = await app.request(
      `/matches/${room.id}/start`,
      postEmpty(room.hostToken),
    );
    expect(await started.json()).toMatchObject({ currentContestant: 2 });
  });

  it("plays a full duel with per-seat tokens, exposes logs, and rejects moves after completion", async () => {
    const app = buildApp();
    const { id, players } = await startDuel(app, {
      width: 2,
      height: 2,
      turnsPerContestant: 1,
    });

    const first = await app.request(
      `/matches/${id}/moves`,
      jsonRequest({ skill: "dot", x: 0, y: 0 }, tokenOf(players, 0)),
    );
    expect(first.status).toBe(200);
    expect(await first.json()).toMatchObject({ ply: 1, finished: false });

    const second = await app.request(
      `/matches/${id}/moves`,
      jsonRequest({ skill: "dot", x: 1, y: 1 }, tokenOf(players, 1)),
    );
    expect(second.status).toBe(200);
    expect(await second.json()).toMatchObject({
      ply: 2,
      finished: true,
      scores: [1, 1],
      ranking: [
        { contestant: 0, score: 1, rank: 1 },
        { contestant: 1, score: 1, rank: 1 },
      ],
    });

    const log = await app.request(`/matches/${id}/log`);
    expect(log.status).toBe(200);
    expect(((await log.json()) as { log: unknown[] }).log).toHaveLength(2);

    const afterFinish = await app.request(
      `/matches/${id}/moves`,
      jsonRequest({ skill: "dot", x: 0, y: 1 }, tokenOf(players, 0)),
    );
    expect(afterFinish.status).toBe(400);
    await expect(afterFinish.json()).resolves.toEqual({
      error: "match_finished",
    });
  });

  it("rejects moves without a token, with an unknown token, and out of turn", async () => {
    const app = buildApp();
    const { id, players } = await startDuel(app, { width: 2, height: 2 });

    const noToken = await app.request(
      `/matches/${id}/moves`,
      jsonRequest({ skill: "dot", x: 0, y: 0 }),
    );
    expect(noToken.status).toBe(401);
    await expect(noToken.json()).resolves.toEqual({ error: "token_required" });

    const malformed = await app.request(`/matches/${id}/moves`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: "NotBearer abc",
      },
      body: JSON.stringify({ skill: "dot", x: 0, y: 0 }),
    });
    expect(malformed.status).toBe(401);
    await expect(malformed.json()).resolves.toEqual({
      error: "token_required",
    });

    const unknown = await app.request(
      `/matches/${id}/moves`,
      jsonRequest({ skill: "dot", x: 0, y: 0 }, "00000000-0000-0000-0000-000000000000"),
    );
    expect(unknown.status).toBe(401);
    await expect(unknown.json()).resolves.toEqual({ error: "token_invalid" });

    const outOfTurn = await app.request(
      `/matches/${id}/moves`,
      jsonRequest({ skill: "dot", x: 0, y: 0 }, tokenOf(players, 1)),
    );
    expect(outOfTurn.status).toBe(403);
    await expect(outOfTurn.json()).resolves.toEqual({
      error: "not_your_turn",
    });

    const fetched = await app.request(`/matches/${id}`);
    expect(await fetched.json()).toMatchObject({
      ply: 0,
      currentContestant: 0,
    });
  });

  it("rejects a token from another room", async () => {
    const app = buildApp();
    const a = await startDuel(app, { width: 2, height: 2 });
    const b = await startDuel(app, { width: 2, height: 2 });
    const response = await app.request(
      `/matches/${b.id}/moves`,
      jsonRequest({ skill: "dot", x: 0, y: 0 }, tokenOf(a.players, 0)),
    );
    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ error: "token_invalid" });
  });

  it("rejects moves while the room is still in the lobby", async () => {
    const app = buildApp();
    const room = await createRoom(app, { participate: true });
    const response = await app.request(
      `/matches/${room.id}/moves`,
      jsonRequest({ skill: "dot", x: 0, y: 0 }, room.player!.token),
    );
    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({
      error: "match_not_started",
    });
  });

  it("keeps spectator endpoints open and never leaks tokens", async () => {
    const app = buildApp();
    const { id } = await startDuel(app, { width: 2, height: 2 });

    const fetched = await app.request(`/matches/${id}`);
    expect(fetched.status).toBe(200);
    const state = (await fetched.json()) as Record<string, unknown>;
    expect(state).toMatchObject({ id, ply: 0 });
    expect(state).not.toHaveProperty("contestantTokens");
    expect(state).not.toHaveProperty("hostToken");
    expect(state).not.toHaveProperty("tokens");

    const log = await app.request(`/matches/${id}/log`);
    expect(log.status).toBe(200);
    const logBody = (await log.json()) as Record<string, unknown>;
    expect(logBody).not.toHaveProperty("contestantTokens");
  });

  it("returns lobby view on GET /matches/:id before start", async () => {
    const app = buildApp();
    const room = await createRoom(app, { participate: true });
    const fetched = await app.request(`/matches/${room.id}`);
    expect(fetched.status).toBe(200);
    expect(await fetched.json()).toMatchObject({
      id: room.id,
      phase: "lobby",
      lobby: { joinedCount: 1, contestantCount: 2 },
    });
  });

  it("rejects illegal moves without advancing the match", async () => {
    const app = buildApp();
    const { id, players } = await startDuel(app, { width: 2, height: 2 });
    const response = await app.request(
      `/matches/${id}/moves`,
      jsonRequest({ skill: "cross", x: 0, y: 0 }, tokenOf(players, 0)),
    );
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "cross_center_empty",
    });

    const fetched = await app.request(`/matches/${id}`);
    expect(await fetched.json()).toMatchObject({
      ply: 0,
      currentContestant: 0,
    });
  });

  it.each([
    ["GET", "/matches/missing"],
    ["GET", "/matches/missing/lobby"],
    ["GET", "/matches/missing/log"],
    ["POST", "/matches/missing/moves"],
    ["POST", "/matches/missing/join"],
    ["POST", "/matches/missing/start"],
  ])("returns 404 for %s %s", async (method, path) => {
    const response = await buildApp().request(path, {
      method,
      ...(path.endsWith("/moves")
        ? jsonRequest({ skill: "dot", x: 0, y: 0 })
        : method === "POST"
          ? postEmpty()
          : {}),
    });
    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({ error: "not_found" });
  });
});
