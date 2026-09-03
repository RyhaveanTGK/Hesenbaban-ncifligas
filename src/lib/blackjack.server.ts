/**
 * Cobra Blackjack — server authoritative multiplayer engine.
 *
 * EVERY card is dealt on the server from a shuffled 6-deck shoe. The client
 * only renders the state returned by readState(); it never generates cards and
 * never decides an outcome.
 *
 * Round cycle (single live table, max 6 seats, min 2 real players):
 *   waiting  -> not enough players seated
 *   betting  -> 5s, each seated player places 0.5 .. 10 GEL
 *   dealing  -> 2s deal animation (cards already decided by the server)
 *   turns    -> seat order, 5s per player (hit / stand / double / split)
 *   payout   -> 3s, pot goes to the highest total, then a brand new round
 *
 * Pot rules: all bets go to the middle, the highest non-bust total wins the
 * whole pot (split between ties). If every player busts the house wins the pot
 * and each player gets 30% of their own bet back.
 */

export const BET_MIN = 0.5;
export const BET_MAX = 10;
export const MAX_SEATS = 6;
export const MIN_PLAYERS = 2;
export const BETTING_MS = 5000;
export const DEALING_MS = 2000;
export const TURN_MS = 5000;
export const PAYOUT_MS = 3000;
export const HOUSE_REFUND = 0.3;
export const CHAT_TTL_MS = 15000;
export const TABLE_ID = "BJ-784512";
const SEAT_TIMEOUT_MS = 8000;

export type Phase = "waiting" | "betting" | "dealing" | "turns" | "payout";
export type Card = { rank: string; suit: "S" | "H" | "D" | "C" };

export type HandState = {
  cards: Card[] | null; // null => hidden (another player's hand)
  cardCount: number;
  total: number | null;
  bust: boolean;
  blackjack: boolean;
  done: boolean;
  bet: number;
  doubled: boolean;
};

export type PlayerState = {
  userId: string;
  username: string;
  seat: number;
  balance: number;
  bet: number;
  isSelf: boolean;
  inRound: boolean;
  hands: HandState[];
  activeHand: number;
  isTurn: boolean;
  result: "win" | "lose" | "push" | "refund" | null;
  payout: number;
};

export type ChatMessage = { id: string; username: string; text: string; at: number };

export type BlackjackState = {
  now: number;
  tableId: string;
  roundId: number;
  phase: Phase;
  phaseMs: number; // ms left in the current phase / turn
  seatsTaken: number;
  maxSeats: number;
  minPlayers: number;
  pot: number;
  dealer: { cards: Card[]; total: number; bust: boolean; revealed: boolean };
  players: PlayerState[];
  you: {
    seated: boolean;
    seat: number | null;
    balance: number;
    bet: number;
    isTurn: boolean;
    canBet: boolean;
    canHit: boolean;
    canStand: boolean;
    canDouble: boolean;
    canSplit: boolean;
    result: "win" | "lose" | "push" | "refund" | null;
    payout: number;
    message: string;
  } | null;
  chat: ChatMessage[];
  lastWinners: { username: string; payout: number; total: number }[];
  dealtAt: number; // timestamp the deal started (client animation anchor)
};

type Hand = {
  cards: Card[];
  done: boolean;
  doubled: boolean;
  bet: number;
};

type Seat = {
  userId: string;
  username: string;
  seat: number;
  lastSeen: number;
  bet: number;
  inRound: boolean;
  hands: Hand[];
  activeHand: number;
  result: "win" | "lose" | "push" | "refund" | null;
  payout: number;
};

type Table = {
  roundId: number;
  phase: Phase;
  phaseEndsAt: number;
  dealtAt: number;
  seats: Map<string, Seat>;
  order: string[];
  turnIndex: number;
  dealer: Card[];
  dealerRevealed: boolean;
  shoe: Card[];
  chat: ChatMessage[];
  lastWinners: { username: string; payout: number; total: number }[];
  settled: boolean;
};

const RANKS = ["A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"];
const SUITS: Card["suit"][] = ["S", "H", "D", "C"];

function buildShoe(): Card[] {
  const cards: Card[] = [];
  for (let d = 0; d < 6; d++) {
    for (const suit of SUITS) for (const rank of RANKS) cards.push({ rank, suit });
  }
  // Fisher-Yates, server side only.
  for (let i = cards.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const a = cards[i]!;
    cards[i] = cards[j]!;
    cards[j] = a;
  }
  return cards;
}

export function handTotal(cards: Card[]): number {
  let total = 0;
  let aces = 0;
  for (const c of cards) {
    if (c.rank === "A") {
      aces++;
      total += 11;
    } else if (c.rank === "K" || c.rank === "Q" || c.rank === "J" || c.rank === "10") {
      total += 10;
    } else {
      total += Number(c.rank);
    }
  }
  while (total > 21 && aces > 0) {
    total -= 10;
    aces--;
  }
  return total;
}

function isBlackjack(hand: Hand): boolean {
  return hand.cards.length === 2 && handTotal(hand.cards) === 21;
}

const table: Table = {
  roundId: 1,
  phase: "waiting",
  phaseEndsAt: 0,
  dealtAt: 0,
  seats: new Map(),
  order: [],
  turnIndex: 0,
  dealer: [],
  dealerRevealed: false,
  shoe: buildShoe(),
  chat: [],
  lastWinners: [],
  settled: true,
};

/** Pending balance writes, flushed by the next state read. */
const pending: (() => Promise<void>)[] = [];

function draw(): Card {
  if (table.shoe.length < 30) table.shoe = buildShoe();
  return table.shoe.pop()!;
}

function activeSeats(now: number): Seat[] {
  return [...table.seats.values()]
    .filter((s) => now - s.lastSeen < SEAT_TIMEOUT_MS)
    .sort((a, b) => a.seat - b.seat);
}

function pruneSeats(now: number) {
  for (const [id, seat] of table.seats) {
    if (now - seat.lastSeen >= SEAT_TIMEOUT_MS && !seat.inRound) table.seats.delete(id);
  }
  table.chat = table.chat.filter((m) => now - m.at < CHAT_TTL_MS);
}

function resetSeatsForRound() {
  for (const seat of table.seats.values()) {
    seat.bet = 0;
    seat.inRound = false;
    seat.hands = [];
    seat.activeHand = 0;
    seat.result = null;
    seat.payout = 0;
  }
  table.dealer = [];
  table.dealerRevealed = false;
  table.order = [];
  table.turnIndex = 0;
}

function startBetting(now: number) {
  table.roundId += 1;
  resetSeatsForRound();
  table.settled = false;
  table.phase = "betting";
  table.phaseEndsAt = now + BETTING_MS;
}

function toWaiting(now: number) {
  resetSeatsForRound();
  table.settled = true;
  table.phase = "waiting";
  table.phaseEndsAt = now + 1000;
}

function dealRound(now: number) {
  const players = activeSeats(now).filter((s) => s.bet > 0);
  table.order = players.map((p) => p.userId);
  for (const p of players) {
    p.inRound = true;
    p.hands = [{ cards: [draw(), draw()], done: false, doubled: false, bet: p.bet }];
    p.activeHand = 0;
  }
  table.dealer = [draw(), draw()];
  table.dealerRevealed = false;
  table.phase = "dealing";
  table.dealtAt = now;
  table.phaseEndsAt = now + DEALING_MS;
}

function currentTurnSeat(): Seat | null {
  const id = table.order[table.turnIndex];
  if (!id) return null;
  return table.seats.get(id) ?? null;
}

function seatHasOpenHand(seat: Seat): boolean {
  return seat.hands.some((h) => !h.done);
}

function autoCompleteHands(seat: Seat) {
  for (const h of seat.hands) {
    if (handTotal(h.cards) >= 21) h.done = true;
  }
}

function advanceTurn(now: number) {
  while (table.turnIndex < table.order.length) {
    const seat = currentTurnSeat();
    if (!seat || !seat.inRound) {
      table.turnIndex++;
      continue;
    }
    autoCompleteHands(seat);
    if (seatHasOpenHand(seat)) {
      seat.activeHand = seat.hands.findIndex((h) => !h.done);
      table.phase = "turns";
      table.phaseEndsAt = now + TURN_MS;
      return;
    }
    table.turnIndex++;
  }
  finishRound(now);
}

function finishRound(now: number) {
  // Dealer plays out (shown in the middle for reference).
  while (handTotal(table.dealer) < 17) table.dealer.push(draw());
  table.dealerRevealed = true;
  table.phase = "payout";
  table.phaseEndsAt = now + PAYOUT_MS;
  settle(now);
}

function settle(now: number) {
  if (table.settled) return;
  table.settled = true;

  const players = table.order
    .map((id) => table.seats.get(id))
    .filter((s): s is Seat => Boolean(s && s.inRound));

  const pot = Number(
    players.reduce((sum, p) => sum + p.hands.reduce((s, h) => s + h.bet, 0), 0).toFixed(2),
  );

  const best = new Map<string, number>();
  for (const p of players) {
    let top = 0;
    for (const h of p.hands) {
      const t = handTotal(h.cards);
      if (t <= 21 && t > top) top = t;
    }
    best.set(p.userId, top);
  }

  const highest = Math.max(0, ...[...best.values()]);
  const winners = highest > 0 ? players.filter((p) => best.get(p.userId) === highest) : [];

  const bets: import("./game-log.server").BetLog[] = [];

  if (winners.length > 0) {
    const share = Number((pot / winners.length).toFixed(2));
    for (const p of players) {
      const staked = p.hands.reduce((s, h) => s + h.bet, 0);
      const isWinner = winners.includes(p);
      const payout = isWinner ? share : 0;
      p.result = isWinner ? (winners.length > 1 ? "push" : "win") : "lose";
      p.payout = payout;
      if (payout > 0) queueBalance(p.userId, payout);
      bets.push({
        userId: p.userId,
        username: p.username,
        amount: Number(staked.toFixed(2)),
        total: best.get(p.userId) ?? 0,
        outcome: p.result,
        payout,
      });
    }
    table.lastWinners = winners.map((w) => ({
      username: w.username,
      payout: share,
      total: best.get(w.userId) ?? 0,
    }));
  } else {
    // Everyone busted -> the house takes the pot, 30% of each bet is refunded.
    for (const p of players) {
      const staked = p.hands.reduce((s, h) => s + h.bet, 0);
      const refund = Number((staked * HOUSE_REFUND).toFixed(2));
      p.result = "refund";
      p.payout = refund;
      if (refund > 0) queueBalance(p.userId, refund);
      bets.push({
        userId: p.userId,
        username: p.username,
        amount: Number(staked.toFixed(2)),
        total: 0,
        outcome: "refund",
        payout: refund,
      });
    }
    table.lastWinners = [];
  }

  const log = {
    game: "blackjack" as const,
    roundId: table.roundId,
    tableId: TABLE_ID,
    createdAt: new Date(now).toISOString(),
    pot,
    dealerTotal: handTotal(table.dealer),
    winners: winners.map((w) => w.username),
    bets,
  };
  pending.push(async () => {
    const { getGameLog } = await import("./game-log.server");
    const store = await getGameLog();
    await store.insertRound(log);
  });
}

function queueBalance(userId: string, amount: number) {
  pending.push(async () => {
    const { getStore } = await import("./db.server");
    const store = await getStore();
    await store.addBalance(userId, amount);
  });
}

async function flushPending() {
  while (pending.length) {
    const job = pending.shift()!;
    try {
      await job();
    } catch (err) {
      console.error("blackjack: persistence failed", err);
    }
  }
}

/** Lazily advances the table clock — no background timers needed. */
function tick(now: number) {
  pruneSeats(now);
  let guard = 0;
  while (guard++ < 20) {
    const players = activeSeats(now);
    if (table.phase === "waiting") {
      if (players.length >= MIN_PLAYERS) {
        startBetting(now);
        continue;
      }
      return;
    }
    if (now < table.phaseEndsAt) return;

    if (table.phase === "betting") {
      const bettors = players.filter((s) => s.bet > 0);
      if (bettors.length >= MIN_PLAYERS) dealRound(now);
      else if (players.length >= MIN_PLAYERS) {
        // give the table another betting window
        table.phaseEndsAt = now + BETTING_MS;
        for (const p of players) if (p.bet > 0) refundBet(p);
        return;
      } else toWaiting(now);
      continue;
    }
    if (table.phase === "dealing") {
      table.turnIndex = 0;
      advanceTurn(now);
      continue;
    }
    if (table.phase === "turns") {
      // turn timed out -> auto stand on the active hand
      const seat = currentTurnSeat();
      if (seat) {
        const hand = seat.hands[seat.activeHand];
        if (hand) hand.done = true;
      }
      if (seat && seatHasOpenHand(seat)) {
        seat.activeHand = seat.hands.findIndex((h) => !h.done);
        table.phaseEndsAt = now + TURN_MS;
        return;
      }
      table.turnIndex++;
      advanceTurn(now);
      continue;
    }
    if (table.phase === "payout") {
      if (activeSeats(now).length >= MIN_PLAYERS) startBetting(now);
      else toWaiting(now);
      continue;
    }
    return;
  }
}

function refundBet(seat: Seat) {
  if (seat.bet > 0) {
    queueBalance(seat.userId, seat.bet);
    seat.bet = 0;
  }
}

function freeSeatIndex(): number | null {
  const used = new Set([...table.seats.values()].map((s) => s.seat));
  for (let i = 0; i < MAX_SEATS; i++) if (!used.has(i)) return i;
  return null;
}

function handView(hand: Hand, reveal: boolean): HandState {
  const total = handTotal(hand.cards);
  return {
    cards: reveal ? hand.cards : null,
    cardCount: hand.cards.length,
    total: reveal ? total : null,
    bust: reveal ? total > 21 : false,
    blackjack: reveal ? isBlackjack(hand) : false,
    done: hand.done,
    bet: hand.bet,
    doubled: hand.doubled,
  };
}

async function balanceOf(userId: string): Promise<number> {
  const { getStore } = await import("./db.server");
  const store = await getStore();
  const user = await store.findById(userId);
  return user?.chipBalance ?? 0;
}

export async function readState(
  userId?: string,
  username?: string,
  heartbeat = true,
): Promise<BlackjackState> {
  const now = Date.now();
  if (userId && heartbeat) {
    const seat = table.seats.get(userId);
    if (seat) {
      seat.lastSeen = now;
      if (username) seat.username = username;
    }
  }
  tick(now);
  await flushPending();

  const seats = activeSeats(now);
  const self = userId ? (table.seats.get(userId) ?? null) : null;
  const turnSeat = table.phase === "turns" ? currentTurnSeat() : null;
  const revealAll = table.phase === "payout";

  const players: PlayerState[] = await Promise.all(
    seats.map(async (s) => {
      const mine = s.userId === userId;
      const reveal = mine || revealAll;
      return {
        userId: s.userId,
        username: s.username,
        seat: s.seat,
        balance: await balanceOf(s.userId),
        bet: s.bet,
        isSelf: mine,
        inRound: s.inRound,
        hands: s.hands.map((h) => handView(h, reveal)),
        activeHand: s.activeHand,
        isTurn: turnSeat?.userId === s.userId,
        result: revealAll || mine ? s.result : null,
        payout: revealAll || mine ? s.payout : 0,
      };
    }),
  );

  const pot = Number(
    seats.reduce((sum, s) => sum + (s.inRound ? s.hands.reduce((a, h) => a + h.bet, 0) : s.bet), 0).toFixed(2),
  );

  let you: BlackjackState["you"] = null;
  if (userId) {
    const balance = await balanceOf(userId);
    const isTurn = turnSeat?.userId === userId;
    const hand = self && isTurn ? self.hands[self.activeHand] : null;
    const total = hand ? handTotal(hand.cards) : 0;
    const canSplit =
      Boolean(hand) &&
      hand!.cards.length === 2 &&
      self!.hands.length === 1 &&
      cardValue(hand!.cards[0]!) === cardValue(hand!.cards[1]!) &&
      balance >= hand!.bet;
    you = {
      seated: Boolean(self),
      seat: self?.seat ?? null,
      balance,
      bet: self?.bet ?? 0,
      isTurn,
      canBet: Boolean(self) && table.phase === "betting" && (self?.bet ?? 0) === 0,
      canHit: Boolean(hand) && total < 21,
      canStand: Boolean(hand),
      canDouble: Boolean(hand) && hand!.cards.length === 2 && !hand!.doubled && balance >= hand!.bet,
      canSplit,
      result: self?.result ?? null,
      payout: self?.payout ?? 0,
      message: statusMessage(now, Boolean(self), seats.length),
    };
  }

  return {
    now,
    tableId: TABLE_ID,
    roundId: table.roundId,
    phase: table.phase,
    phaseMs: Math.max(0, table.phaseEndsAt - now),
    seatsTaken: seats.length,
    maxSeats: MAX_SEATS,
    minPlayers: MIN_PLAYERS,
    pot,
    dealer: {
      cards: table.dealerRevealed ? table.dealer : table.dealer.slice(0, 1),
      total: table.dealerRevealed ? handTotal(table.dealer) : handTotal(table.dealer.slice(0, 1)),
      bust: table.dealerRevealed && handTotal(table.dealer) > 21,
      revealed: table.dealerRevealed,
    },
    players,
    you,
    chat: table.chat.filter((m) => now - m.at < CHAT_TTL_MS),
    lastWinners: table.lastWinners,
    dealtAt: table.dealtAt,
  };
}

function cardValue(card: Card): number {
  if (card.rank === "A") return 11;
  if (["K", "Q", "J", "10"].includes(card.rank)) return 10;
  return Number(card.rank);
}

function statusMessage(now: number, seated: boolean, seatCount: number): string {
  if (!seated) return "Take a seat to join the next round";
  if (table.phase === "waiting")
    return `Waiting for players — ${seatCount}/${MIN_PLAYERS} needed`;
  if (table.phase === "betting") return "Place your bet";
  if (table.phase === "dealing") return "Dealing cards…";
  if (table.phase === "payout") return table.lastWinners.length ? "Round finished" : "House wins — 30% back";
  const seat = currentTurnSeat();
  return seat ? `${seat.username}'s turn` : "Playing";
}

export async function joinTable(userId: string, username: string) {
  const now = Date.now();
  tick(now);
  const existing = table.seats.get(userId);
  if (existing) {
    existing.lastSeen = now;
    return { ok: true as const, seat: existing.seat };
  }
  if (activeSeats(now).length >= MAX_SEATS) {
    return { ok: false as const, error: "Table is full (6/6). Try again after this round." };
  }
  const seat = freeSeatIndex();
  if (seat === null) return { ok: false as const, error: "Table is full." };
  table.seats.set(userId, {
    userId,
    username,
    seat,
    lastSeen: now,
    bet: 0,
    inRound: false,
    hands: [],
    activeHand: 0,
    result: null,
    payout: 0,
  });
  return { ok: true as const, seat };
}

export async function leaveTable(userId: string) {
  const seat = table.seats.get(userId);
  if (!seat) return { ok: true as const };
  if (!seat.inRound) {
    refundBet(seat);
    table.seats.delete(userId);
  } else {
    seat.lastSeen = 0;
  }
  await flushPending();
  return { ok: true as const };
}

export async function placeBet(userId: string, amount: number) {
  const now = Date.now();
  tick(now);
  const seat = table.seats.get(userId);
  if (!seat) return { ok: false as const, error: "Take a seat first." };
  seat.lastSeen = now;
  if (table.phase !== "betting") return { ok: false as const, error: "Betting is closed." };
  if (seat.bet > 0) return { ok: false as const, error: "Bet already placed." };
  const bet = Number(amount.toFixed(2));
  if (!(bet >= BET_MIN && bet <= BET_MAX)) {
    return { ok: false as const, error: `Bet must be between ${BET_MIN} and ${BET_MAX} GEL.` };
  }
  const { getStore } = await import("./db.server");
  const store = await getStore();
  const user = await store.findById(userId);
  if (!user) return { ok: false as const, error: "User not found." };
  if (user.chipBalance < bet) return { ok: false as const, error: "Insufficient balance." };
  const updated = await store.addBalance(userId, -bet);
  seat.bet = bet;
  return { ok: true as const, balance: updated?.chipBalance ?? user.chipBalance - bet };
}

type ActionResult = { ok: boolean; error?: string };

function requireTurn(userId: string, now: number): { seat: Seat; hand: Hand } | { error: string } {
  tick(now);
  if (table.phase !== "turns") return { error: "Not the action phase." };
  const seat = table.seats.get(userId);
  if (!seat) return { error: "You are not seated." };
  seat.lastSeen = now;
  const turn = currentTurnSeat();
  if (!turn || turn.userId !== userId) return { error: "It is not your turn." };
  const hand = seat.hands[seat.activeHand];
  if (!hand || hand.done) return { error: "No active hand." };
  return { seat, hand };
}

function afterAction(seat: Seat, now: number) {
  autoCompleteHands(seat);
  if (seatHasOpenHand(seat)) {
    seat.activeHand = seat.hands.findIndex((h) => !h.done);
    table.phaseEndsAt = now + TURN_MS;
  } else {
    table.turnIndex++;
    advanceTurn(now);
  }
}

export async function hit(userId: string): Promise<ActionResult> {
  const now = Date.now();
  const ctx = requireTurn(userId, now);
  if ("error" in ctx) return { ok: false, error: ctx.error };
  ctx.hand.cards.push(draw());
  if (handTotal(ctx.hand.cards) >= 21) ctx.hand.done = true;
  else table.phaseEndsAt = now + TURN_MS;
  afterAction(ctx.seat, now);
  await flushPending();
  return { ok: true };
}

export async function stand(userId: string): Promise<ActionResult> {
  const now = Date.now();
  const ctx = requireTurn(userId, now);
  if ("error" in ctx) return { ok: false, error: ctx.error };
  ctx.hand.done = true;
  afterAction(ctx.seat, now);
  await flushPending();
  return { ok: true };
}

export async function double(userId: string): Promise<ActionResult> {
  const now = Date.now();
  const ctx = requireTurn(userId, now);
  if ("error" in ctx) return { ok: false, error: ctx.error };
  const { seat, hand } = ctx;
  if (hand.cards.length !== 2 || hand.doubled) return { ok: false, error: "Cannot double now." };
  const { getStore } = await import("./db.server");
  const store = await getStore();
  const user = await store.findById(userId);
  if (!user || user.chipBalance < hand.bet) return { ok: false, error: "Insufficient balance." };
  await store.addBalance(userId, -hand.bet);
  hand.doubled = true;
  hand.bet = Number((hand.bet * 2).toFixed(2));
  seat.bet = Number(seat.hands.reduce((s, h) => s + h.bet, 0).toFixed(2));
  hand.cards.push(draw());
  hand.done = true;
  afterAction(seat, now);
  await flushPending();
  return { ok: true };
}

export async function split(userId: string): Promise<ActionResult> {
  const now = Date.now();
  const ctx = requireTurn(userId, now);
  if ("error" in ctx) return { ok: false, error: ctx.error };
  const { seat, hand } = ctx;
  if (seat.hands.length !== 1 || hand.cards.length !== 2)
    return { ok: false, error: "Cannot split now." };
  const [a, b] = hand.cards;
  if (!a || !b || cardValue(a) !== cardValue(b)) return { ok: false, error: "Cards do not match." };
  const { getStore } = await import("./db.server");
  const store = await getStore();
  const user = await store.findById(userId);
  if (!user || user.chipBalance < hand.bet) return { ok: false, error: "Insufficient balance." };
  await store.addBalance(userId, -hand.bet);
  seat.bet = Number((seat.bet * 2).toFixed(2));
  seat.hands = [
    { cards: [a, draw()], done: false, doubled: false, bet: hand.bet },
    { cards: [b, draw()], done: false, doubled: false, bet: hand.bet },
  ];
  seat.activeHand = 0;
  table.phaseEndsAt = now + TURN_MS;
  afterAction(seat, now);
  await flushPending();
  return { ok: true };
}

export function sendChat(userId: string, username: string, text: string) {
  const now = Date.now();
  const clean = text.trim().slice(0, 120);
  if (!clean) return { ok: false as const, error: "Empty message." };
  table.chat.push({
    id: `${now}-${Math.random().toString(36).slice(2, 8)}`,
    username,
    text: clean,
    at: now,
  });
  table.chat = table.chat.filter((m) => now - m.at < CHAT_TTL_MS).slice(-30);
  return { ok: true as const };
}
