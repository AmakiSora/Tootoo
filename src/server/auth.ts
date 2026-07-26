import { timingSafeEqual } from "node:crypto";
import type { Context } from "hono";
import type { MatchRecord } from "./store/memory.js";

export type AuthResult =
  | { ok: true; contestant: number }
  | { ok: false; error: "token_required" | "token_invalid"; status: 401 };

function safeEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  return ba.length === bb.length && timingSafeEqual(ba, bb);
}

function bearerToken(c: Context): string | null {
  const header = c.req.header("Authorization");
  if (!header || !header.startsWith("Bearer ")) return null;
  const token = header.slice("Bearer ".length).trim();
  return token || null;
}

/**
 * Verifies the request carries `Authorization: Bearer <token>` and that the
 * token belongs to a contestant seat of this room. Turn-order checks are the
 * caller's responsibility (403 not_your_turn).
 */
export function authenticateContestant(
  c: Context,
  record: MatchRecord,
): AuthResult {
  const token = bearerToken(c);
  if (!token) {
    return { ok: false, error: "token_required", status: 401 };
  }
  const seat = [...record.tokens.entries()].find(([t]) => safeEqual(t, token))?.[1];
  if (seat === undefined) {
    return { ok: false, error: "token_invalid", status: 401 };
  }
  return { ok: true, contestant: seat };
}

/** Verifies the host token for room-management endpoints (e.g. start). */
export function authenticateHost(
  c: Context,
  record: MatchRecord,
): { ok: true } | { ok: false; error: "host_token_required" | "host_token_invalid"; status: 401 } {
  const token = bearerToken(c);
  if (!token) {
    return { ok: false, error: "host_token_required", status: 401 };
  }
  if (!safeEqual(token, record.hostToken)) {
    return { ok: false, error: "host_token_invalid", status: 401 };
  }
  return { ok: true };
}
