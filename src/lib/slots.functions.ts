import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import type { SpinResponse } from "./slots.server";

export type { SpinResponse };

export const spinSlots = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z.object({ userId: z.string().min(1), bet: z.number().positive().max(100) }).parse(d),
  )
  .handler(async ({ data }): Promise<SpinResponse> => {
    const { spin } = await import("./slots.server");
    return spin(data.userId, data.bet);
  });

export const getSlotsBalance = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ userId: z.string().min(1) }).parse(d))
  .handler(async ({ data }): Promise<{ balance: number }> => {
    const { getStore } = await import("./db.server");
    const store = await getStore();
    const user = await store.findById(data.userId);
    return { balance: user?.chipBalance ?? 0 };
  });
