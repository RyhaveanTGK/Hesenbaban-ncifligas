import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

export type AdminUserRow = {
  id: string;
  username: string;
  email: string;
  createdAt: string;
  chipBalance: number;
  totalGames: number;
  wins: number;
  highestWin: number;
};

/** Token is derived from the env credentials, so it is only valid while they match. */
async function makeToken(username: string, password: string) {
  const data = new TextEncoder().encode(`${username}:${password}:cobra-admin`);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function adminCreds() {
  const username = process.env["ADMIN_USERNAME"];
  const password = process.env["ADMIN_PASSWORD"];
  if (!username || !password) return null;
  return { username, password };
}

async function assertAdmin(token: string) {
  const creds = adminCreds();
  if (!creds) throw new Error("Admin panel is not configured.");
  const expected = await makeToken(creds.username, creds.password);
  if (token !== expected) throw new Error("Unauthorized.");
}

/** Returns a token when the submitted login/password match the admin env credentials. */
export const adminLogin = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z.object({ login: z.string().min(1), password: z.string().min(1) }).parse(d),
  )
  .handler(async ({ data }): Promise<{ ok: boolean; token?: string }> => {
    const creds = adminCreds();
    if (!creds) return { ok: false };
    if (data.login !== creds.username || data.password !== creds.password) return { ok: false };
    return { ok: true, token: await makeToken(creds.username, creds.password) };
  });

export const adminListUsers = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ token: z.string().min(1) }).parse(d))
  .handler(async ({ data }): Promise<{ ok: boolean; error?: string; users?: AdminUserRow[] }> => {
    try {
      await assertAdmin(data.token);
      const { getStore } = await import("./db.server");
      const store = await getStore();
      const users = await store.listAll();
      return {
        ok: true,
        users: users.map(({ passwordHash: _ph, ...rest }) => rest as AdminUserRow),
      };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : "Failed to load users." };
    }
  });

/** Adds (or, with a negative delta, removes) chips and returns the fresh balance. */
export const adminAdjustBalance = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z
      .object({
        token: z.string().min(1),
        userId: z.string().min(1),
        delta: z.number().min(-1_000_000).max(1_000_000).refine((n) => n !== 0, "Amount must not be zero."),
      })
      .parse(d),
  )
  .handler(async ({ data }): Promise<{ ok: boolean; error?: string; balance?: number }> => {
    try {
      await assertAdmin(data.token);
      const { getStore } = await import("./db.server");
      const store = await getStore();
      const current = await store.findById(data.userId);
      if (!current) return { ok: false, error: "User not found." };
      // Atomic increment inside the database: no read-modify-write race, never negative.
      const updated = await store.addBalance(data.userId, data.delta);
      if (!updated) return { ok: false, error: "User not found." };
      return { ok: true, balance: updated.chipBalance };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : "Update failed." };
    }
  });


export const adminSetBalance = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z
      .object({
        token: z.string().min(1),
        userId: z.string().min(1),
        balance: z.number().min(0).max(10_000_000),
      })
      .parse(d),
  )
  .handler(async ({ data }): Promise<{ ok: boolean; error?: string; balance?: number }> => {
    try {
      await assertAdmin(data.token);
      const { getStore } = await import("./db.server");
      const store = await getStore();
      const updated = await store.setBalance(data.userId, data.balance);
      if (!updated) return { ok: false, error: "User not found." };
      return { ok: true, balance: updated.chipBalance };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : "Update failed." };
    }
  });
