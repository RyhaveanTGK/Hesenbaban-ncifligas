import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import type { BlackjackState } from "./blackjack.server";

export const BJ_BET_MIN = 0.5;
export const BJ_BET_MAX = 10;
export const BJ_MAX_SEATS = 6;
export const BJ_MIN_PLAYERS = 2;
export type { BlackjackState };

const user = z.object({ userId: z.string().min(1), username: z.string().min(1) });

export const getBlackjackState = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z.object({ userId: z.string().optional(), username: z.string().optional() }).parse(d ?? {}),
  )
  .handler(async ({ data }): Promise<BlackjackState> => {
    const { readState } = await import("./blackjack.server");
    return readState(data.userId, data.username);
  });

export const joinBlackjack = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => user.parse(d))
  .handler(async ({ data }) => {
    const { joinTable } = await import("./blackjack.server");
    return joinTable(data.userId, data.username);
  });

export const leaveBlackjack = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ userId: z.string().min(1) }).parse(d))
  .handler(async ({ data }) => {
    const { leaveTable } = await import("./blackjack.server");
    return leaveTable(data.userId);
  });

export const placeBlackjackBet = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z
      .object({
        userId: z.string().min(1),
        amount: z.number().min(BJ_BET_MIN).max(BJ_BET_MAX),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    const { placeBet } = await import("./blackjack.server");
    return placeBet(data.userId, data.amount);
  });

export const blackjackAction = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z
      .object({
        userId: z.string().min(1),
        action: z.enum(["hit", "stand", "double", "split"]),
      })
      .parse(d),
  )
  .handler(async ({ data }): Promise<{ ok: boolean; error?: string }> => {
    const bj = await import("./blackjack.server");
    if (data.action === "hit") return bj.hit(data.userId);
    if (data.action === "stand") return bj.stand(data.userId);
    if (data.action === "double") return bj.double(data.userId);
    return bj.split(data.userId);
  });

export const sendBlackjackChat = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => user.extend({ text: z.string().min(1).max(120) }).parse(d))
  .handler(async ({ data }) => {
    const { sendChat } = await import("./blackjack.server");
    return sendChat(data.userId, data.username, data.text);
  });
