import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

export type PublicUser = {
  id: string;
  username: string;
  email: string;
  createdAt: string;
  chipBalance: number;
  totalGames: number;
  wins: number;
  highestWin: number;
};

const registerSchema = z.object({
  username: z.string().min(3).max(20),
  email: z.string().email(),
  password: z.string().min(6),
});

const loginSchema = z.object({
  login: z.string().min(1),
  password: z.string().min(1),
});

export const registerUser = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => registerSchema.parse(d))
  .handler(async ({ data }): Promise<{ ok: boolean; error?: string; user?: PublicUser }> => {
    const { getStore } = await import("./db.server");
    const bcrypt = (await import("bcryptjs")).default;
    const store = await getStore();

    if (await store.findByLogin(data.email)) {
      return { ok: false, error: "This email is already registered." };
    }
    if (await store.findByLogin(data.username)) {
      return { ok: false, error: "This username is already taken." };
    }

    const user = {
      id: crypto.randomUUID().replace(/-/g, "").slice(0, 8).toUpperCase(),
      username: data.username,
      email: data.email,
      passwordHash: await bcrypt.hash(data.password, 10),
      createdAt: new Date().toISOString(),
      chipBalance: 0,
      totalGames: 0,
      wins: 0,
      highestWin: 0,
    };
    await store.insert(user);
    const { passwordHash: _ph, ...pub } = user;
    return { ok: true, user: pub };
  });

export const loginUser = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => loginSchema.parse(d))
  .handler(async ({ data }): Promise<{ ok: boolean; error?: string; user?: PublicUser }> => {
    const { getStore } = await import("./db.server");
    const bcrypt = (await import("bcryptjs")).default;
    const store = await getStore();

    const found = await store.findByLogin(data.login);
    if (!found || !(await bcrypt.compare(data.password, found.passwordHash))) {
      return { ok: false, error: "Invalid credentials." };
    }
    const { passwordHash: _ph, ...pub } = found;
    return { ok: true, user: pub as PublicUser };
  });
