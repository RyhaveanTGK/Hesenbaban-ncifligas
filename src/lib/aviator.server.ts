/**
 * Cobra Avivator round engine.
 *
 * All multipliers ("X") are generated on the SERVER. The client never decides
 * when a round crashes — it only renders the state returned from here.
 *
 * Round cycle:
 *   waiting (5s countdown) -> flying (until the server crash point) -> crashed (3s) -> next round
 */

export const AVIATOR_RATE = 0.06; // exponential growth per second
export const WAIT_MS = 5000;
export const CRASHED_MS = 3000;
export const BET_MIN = 0.15;
export const BET_MAX = 100;

export type AviatorPhase = "waiting" | "flying" | "crashed";

export type BetRecord = {
  userId: string;
  amount: number;
  cashedOut: boolean;
  multiplier?: number;
  payout?: number;
};

type Round = {
  id: number;
  waitStart: number;
  flyStart: number;
  flyEnd: number;
  crash: number;
  endsAt: number;
  bets: Map<string, BetRecord>;
  seats: number; // simulated concurrent players baseline
};

export function multiplierAt(elapsedMs: number): number {
  return Math.exp(AVIATOR_RATE * (elapsedMs / 1000));
}

function durationForCrash(crash: number): number {
  return (Math.log(crash) / AVIATOR_RATE) * 1000;
}

/** Provably-style crash point with a 3% house edge, capped at 100x. */
function randomCrash(): number {
  const u = Math.random();
  if (u < 0.03) return 1.0;
  const raw = 0.97 / (1 - u);
  return Math.min(100, Math.max(1.01, Math.floor(raw * 100) / 100));
}

const history: number[] = [];
let current: Round | null = null;
let nextId = 1;

function createRound(startAt: number): Round {
  const crash = randomCrash();
  const flyStart = startAt + WAIT_MS;
  const flyEnd = flyStart + durationForCrash(crash);
  return {
    id: nextId++,
    waitStart: startAt,
    flyStart,
    flyEnd,
    crash,
    endsAt: flyEnd + CRASHED_MS,
    bets: new Map(),
    seats: 40 + Math.floor(Math.random() * 60),
  };
}

function settle(round: Round) {
  if (!history.length || history[0] !== round.crash) {
    history.unshift(round.crash);
    if (history.length > 12) history.pop();
  }
}

/** Advances the schedule lazily so it works without a background timer. */
export function getRound(now = Date.now()): Round {
  if (!current) current = createRound(now);
  while (now >= current.endsAt) {
    settle(current);
    current = createRound(current.endsAt);
  }
  if (now >= current.flyEnd) settle(current);
  return current;
}

export function phaseOf(round: Round, now: number): AviatorPhase {
  if (now < round.flyStart) return "waiting";
  if (now < round.flyEnd) return "flying";
  return "crashed";
}

export type AviatorState = {
  now: number;
  roundId: number;
  phase: AviatorPhase;
  /** ms left in the 5s countdown (waiting phase only) */
  countdownMs: number;
  /** ms since take-off (flying / crashed) */
  elapsedMs: number;
  multiplier: number;
  /** revealed only once the plane has flown away */
  crash: number | null;
  history: number[];
  players: number;
  bet: BetRecord | null;
};

export function readState(userId?: string): AviatorState {
  const now = Date.now();
  const round = getRound(now);
  const phase = phaseOf(round, now);
  const elapsedMs = phase === "waiting" ? 0 : Math.min(now, round.flyEnd) - round.flyStart;

  return {
    now,
    roundId: round.id,
    phase,
    countdownMs: Math.max(0, round.flyStart - now),
    elapsedMs,
    multiplier:
      phase === "waiting" ? 1 : Number(multiplierAt(elapsedMs).toFixed(2)),
    crash: phase === "crashed" ? round.crash : null,
    history: [...history],
    players: round.seats + round.bets.size,
    bet: userId ? (round.bets.get(userId) ?? null) : null,
  };
}

export async function placeBet(userId: string, amount: number) {
  const now = Date.now();
  const round = getRound(now);
  if (phaseOf(round, now) !== "waiting") {
    return { ok: false as const, error: "Betting is closed for this round." };
  }
  if (round.bets.has(userId)) {
    return { ok: false as const, error: "You already placed a bet this round." };
  }
  if (!(amount >= BET_MIN && amount <= BET_MAX)) {
    return { ok: false as const, error: `Bet must be between ${BET_MIN} and ${BET_MAX} GEL.` };
  }

  const { getStore } = await import("./db.server");
  const store = await getStore();
  const user = await store.findById(userId);
  if (!user) return { ok: false as const, error: "User not found." };
  if (user.chipBalance < amount) return { ok: false as const, error: "Insufficient balance." };

  const updated = await store.addBalance(userId, -amount);
  round.bets.set(userId, { userId, amount, cashedOut: false });

  return {
    ok: true as const,
    balance: updated?.chipBalance ?? user.chipBalance - amount,
    roundId: round.id,
  };
}

export async function cashOut(userId: string) {
  const now = Date.now();
  const round = getRound(now);
  const bet = round.bets.get(userId);
  if (!bet) return { ok: false as const, error: "No active bet." };
  if (bet.cashedOut) return { ok: false as const, error: "Already cashed out." };
  if (now < round.flyStart) return { ok: false as const, error: "Round has not started." };
  if (now >= round.flyEnd) {
    return { ok: false as const, error: "Too late — the plane flew away." };
  }

  const multiplier = Number(multiplierAt(now - round.flyStart).toFixed(2));
  const payout = Number((bet.amount * multiplier).toFixed(2));

  const { getStore } = await import("./db.server");
  const store = await getStore();
  const updated = await store.addBalance(userId, payout);

  bet.cashedOut = true;
  bet.multiplier = multiplier;
  bet.payout = payout;

  return { ok: true as const, multiplier, payout, balance: updated?.chipBalance ?? 0 };
}
