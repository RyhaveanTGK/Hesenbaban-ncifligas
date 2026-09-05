/**
 * Cobra Slots — server authoritative spin.
 *
 * The reels are spun on the server, the bet is debited and the win credited
 * to the real user balance in one call. The client only animates the result.
 */
import { BET_MAX, BET_MIN, BET_STEPS, evaluate, spinReels, round2, type SpinResult } from "./slots-engine";

export type SpinResponse =
  | { ok: true; result: SpinResult; bet: number; balance: number }
  | { ok: false; error: string };

export async function spin(userId: string, requestedBet: number): Promise<SpinResponse> {
  const { getStore } = await import("./db.server");
  const store = await getStore();
  const user = await store.findById(userId);
  if (!user) return { ok: false, error: "User not found." };

  let bet = round2(requestedBet);
  const isMax = bet >= BET_MAX; // "MAX BET": wager the whole balance (capped at 100)
  if (isMax) bet = round2(Math.min(BET_MAX, user.chipBalance));
  if (!(bet >= BET_MIN && bet <= BET_MAX)) {
    return { ok: false, error: `Bet must be between ${BET_MIN} and ${BET_MAX} GEL.` };
  }
  if (!isMax && !BET_STEPS.some((s) => Math.abs(s - bet) < 0.001)) {
    return { ok: false, error: "Invalid bet amount." };
  }
  if (user.chipBalance + 1e-9 < bet) return { ok: false, error: "Insufficient balance." };

  const debited = await store.addBalance(userId, -bet);
  const result = evaluate(spinReels(), bet);
  let balance = debited?.chipBalance ?? user.chipBalance - bet;
  if (result.totalWin > 0) {
    const credited = await store.addBalance(userId, result.totalWin);
    balance = credited?.chipBalance ?? balance + result.totalWin;
  }
  return { ok: true, result, bet, balance: round2(balance) };
}
