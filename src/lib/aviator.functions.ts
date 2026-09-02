import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import type { AviatorState } from "./aviator.server";

export const AVIATOR_BET_MIN = 0.15;
export const AVIATOR_BET_MAX = 100;
export type { AviatorState };

export const getAviatorState = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ userId: z.string().optional() }).parse(d ?? {}))
  .handler(async ({ data }): Promise<AviatorState> => {
    const { readState } = await import("./aviator.server");
    return readState(data.userId);
  });

export const placeAviatorBet = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z
      .object({
        userId: z.string().min(1),
        amount: z.number().min(AVIATOR_BET_MIN).max(AVIATOR_BET_MAX),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    const { placeBet } = await import("./aviator.server");
    return placeBet(data.userId, Number(data.amount.toFixed(2)));
  });

export const cashOutAviator = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ userId: z.string().min(1) }).parse(d))
  .handler(async ({ data }) => {
    const { cashOut } = await import("./aviator.server");
    return cashOut(data.userId);
  });

export const getAviatorBalance = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ userId: z.string().min(1) }).parse(d))
  .handler(async ({ data }): Promise<{ balance: number }> => {
    const { getStore } = await import("./db.server");
    const store = await getStore();
    const user = await store.findById(data.userId);
    return { balance: user?.chipBalance ?? 0 };
  });
