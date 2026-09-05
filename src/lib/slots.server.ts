/**
 * Cobra Slots 25 — server authoritative spin.
 *
 * The reels are spun on the server, the bet is debited and the win credited
 * to the real user balance in one call. The client only animates the result.
 */
import {
  BET_MAX,
  BET_MIN,
  BET_STEPS,
  REELS,
  SYMBOLS,
  evaluate,
  spinReels,
  round2,
  type SpinResult,
  type SymbolId,
} from "./slots-engine";

/** Reel strips shown while the reels are spinning — decided on the server.
 *  Every symbol appears at least once on every reel, in random order, so no
 *  symbol can stay invisible during the spin animation. */
const STRIP_LEN = 14;
function buildStrips(): SymbolId[][] {
  return Array.from({ length: REELS }, () => {
    const pool = [...SYMBOLS];
    for (let i = pool.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [pool[i], pool[j]] = [pool[j]!, pool[i]!];
    }
    const strip = [...pool];
    while (strip.length < STRIP_LEN) {
      strip.push(SYMBOLS[Math.floor(Math.random() * SYMBOLS.length)]!);
    }
    return strip.slice(0, STRIP_LEN);
  });
}

export type SpinResponse =
  | { ok: true; result: SpinResult; strips: SymbolId[][]; bet: number; balance: number }
  | { ok: false; error: string };

export async function spin(userId: string, requestedBet: number): Promise<SpinResponse> {
  const { getStore } = await import("./db.server");
  const store = await getStore();
  const user = await store.findById(userId);
  if (!user) return { ok: false, error: "User not found." };

  const bet = round2(requestedBet);
  if (!(bet >= BET_MIN && bet <= BET_MAX)) {
    return { ok: false, error: `Bet must be between ${BET_MIN} and ${BET_MAX} GEL.` };
  }
  if (!BET_STEPS.some((s) => Math.abs(s - bet) < 0.001)) {
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
  return { ok: true, result, strips: buildStrips(), bet, balance: round2(balance) };
}
