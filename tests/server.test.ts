import { beforeEach, describe, expect, it } from "vitest";
import { buildApp } from "../src/server/app.js";
import { memoryStore } from "../src/server/store/memory.js";

function jsonRequest(body: unknown): RequestInit {
  return {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  };
}

async function createMatch(
  app: ReturnType<typeof buildApp>,
  body: Record<string, unknown> = {},
) {
  const response = await app.request("/matches", jsonRequest(body));
  return { response, body: await response.json() };
}

describe("HTTP API", () => {
  beforeEach(() => memoryStore.clear());

  it("reports health", async () => {
    const response = await buildApp().request("/health");
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ok: true });
  });

  it("creates and retrieves a match with a valid first contestant", async () => {
    const app = buildApp();
    const created = await createMatch(app, {
      width: 3,
      height: 2,
      contestantCount: 3,
      turnsPerContestant: 2,
      firstContestant: 2,
    });
    expect(created.response.status).toBe(201);
    expect(created.body).toMatchObject({
      currentContestant: 2,
      cells: Array(6).fill(null),
      scores: [0, 0, 0],
      finished: false,
    });

    const id = (created.body as { id: string }).id;
    const fetched = await app.request(`/matches/${id}`);
    expect(fetched.status).toBe(200);
    expect(await fetched.json()).toMatchObject({ id, currentContestant: 2 });
  });

  it.each([
    { contestantCount: 2, firstContestant: 2 },
    { contestantCount: 3, firstContestant: 3 },
    { firstContestant: 2 },
  ])("rejects firstContestant outside contestantCount: %j", async (body) => {
    const { response } = await createMatch(buildApp(), body);
    expect(response.status).toBe(400);
  });

  it.each([
    { width: 0 },
    { width: 1.5 },
    { width: 33 },
    { contestantCount: 5 },
    { turnsPerContestant: 201 },
  ])("rejects invalid numeric configuration: %j", async (body) => {
    const { response } = await createMatch(buildApp(), body);
    expect(response.status).toBe(400);
  });

  it("applies moves, exposes logs, and rejects moves after completion", async () => {
    const app = buildApp();
    const created = await createMatch(app, {
      width: 2,
      height: 2,
      turnsPerContestant: 1,
    });
    const id = (created.body as { id: string }).id;

    const first = await app.request(
      `/matches/${id}/moves`,
      jsonRequest({ skill: "dot", x: 0, y: 0 }),
    );
    expect(first.status).toBe(200);
    expect(await first.json()).toMatchObject({ ply: 1, finished: false });

    const second = await app.request(
      `/matches/${id}/moves`,
      jsonRequest({ skill: "dot", x: 1, y: 1 }),
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
      jsonRequest({ skill: "dot", x: 0, y: 1 }),
    );
    expect(afterFinish.status).toBe(400);
    await expect(afterFinish.json()).resolves.toEqual({
      error: "match_finished",
    });
  });

  it("rejects illegal moves without advancing the match", async () => {
    const app = buildApp();
    const created = await createMatch(app, { width: 2, height: 2 });
    const id = (created.body as { id: string }).id;
    const response = await app.request(
      `/matches/${id}/moves`,
      jsonRequest({ skill: "cross", x: 0, y: 0 }),
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
    ["GET", "/matches/missing/log"],
    ["POST", "/matches/missing/moves"],
  ])("returns 404 for %s %s", async (method, path) => {
    const response = await buildApp().request(path, {
      method,
      ...(path.endsWith("/moves")
        ? jsonRequest({ skill: "dot", x: 0, y: 0 })
        : {}),
    });
    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({ error: "not_found" });
  });
});
