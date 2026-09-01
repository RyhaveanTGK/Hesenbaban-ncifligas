import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import type { PublicUser } from "./auth.functions";

const usernameSchema = z.object({
  userId: z.string().min(1),
  username: z.string().min(3).max(20),
});

const emailSchema = z.object({
  userId: z.string().min(1),
  email: z.string().email(),
});

const passwordSchema = z.object({
  userId: z.string().min(1),
  currentPassword: z.string().min(1),
  newPassword: z.string().min(6),
});

type Result = { ok: boolean; error?: string; user?: PublicUser };

export const updateUsername = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => usernameSchema.parse(d))
  .handler(async ({ data }): Promise<Result> => {
    const { getStore } = await import("./db.server");
    const store = await getStore();

    const me = await store.findById(data.userId);
    if (!me) return { ok: false, error: "User not found." };
    if (me.username.toLowerCase() !== data.username.toLowerCase()) {
      const taken = await store.findByLogin(data.username);
      if (taken) return { ok: false, error: "This username is already taken." };
    }
    const updated = await store.updateFields(data.userId, { username: data.username });
    if (!updated) return { ok: false, error: "Could not update username." };
    const { passwordHash: _ph, ...pub } = updated;
    return { ok: true, user: pub as PublicUser };
  });

export const updateEmail = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => emailSchema.parse(d))
  .handler(async ({ data }): Promise<Result> => {
    const { getStore } = await import("./db.server");
    const store = await getStore();

    const me = await store.findById(data.userId);
    if (!me) return { ok: false, error: "User not found." };
    if (me.email.toLowerCase() !== data.email.toLowerCase()) {
      const taken = await store.findByLogin(data.email);
      if (taken) return { ok: false, error: "This email is already registered." };
    }
    const updated = await store.updateFields(data.userId, { email: data.email });
    if (!updated) return { ok: false, error: "Could not update email." };
    const { passwordHash: _ph, ...pub } = updated;
    return { ok: true, user: pub as PublicUser };
  });

export const updatePassword = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => passwordSchema.parse(d))
  .handler(async ({ data }): Promise<{ ok: boolean; error?: string }> => {
    const { getStore } = await import("./db.server");
    const bcrypt = (await import("bcryptjs")).default;
    const store = await getStore();

    const me = await store.findById(data.userId);
    if (!me) return { ok: false, error: "User not found." };
    if (!(await bcrypt.compare(data.currentPassword, me.passwordHash))) {
      return { ok: false, error: "Current password is incorrect." };
    }
    const passwordHash = await bcrypt.hash(data.newPassword, 10);
    const updated = await store.updateFields(data.userId, { passwordHash });
    if (!updated) return { ok: false, error: "Could not update password." };
    return { ok: true };
  });
