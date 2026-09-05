/**
 * Cobra Slots 5 — 20 Burning Hot (EGT / Amusnet) original math engine.
 *
 * Recreated from the official game rules PDF:
 *   20 fixed lines / 5 reels / 3 rows, RTP 95.88%.
 *   All pays are for combinations of a kind, left to right on adjacent reels
 *   beginning with the leftmost reel, except for Scatter symbols.
 *   Line wins are multiplied by the bet on the winning line (total bet / 20).
 *   Scatter wins are multiplied by the Total Bet and added to payline wins.
 *   Highest payline and/or Scatter win only is paid per line / per scatter.
 *   Winnings are paid AFTER the expanding of the Wild symbol.
 *
 * Pure, dependency-free module. The server calls `spinReels()` + `evaluate()`
 * to decide every outcome; the client only re-uses the tables/types to render.
 *
 * No jackpot / gamble / free spins — only the original core mechanics.
 */

export const REELS = 5;
export const ROWS = 3;
export const LINES = 20;

export type SymbolId =
  | "seven"
  | "star"
  | "dollar"
  | "bell"
  | "grapes"
  | "plum"
  | "orange"
  | "lemon"
  | "cherry"
  | "clover";

export const SYMBOLS: SymbolId[] = [
  "seven",
  "star",
  "dollar",
  "bell",
  "grapes",
  "plum",
  "orange",
  "lemon",
  "cherry",
  "clover",
];

/** Clover = expanding Wild (2nd, 3rd and 4th reels only). */
export const WILD: SymbolId = "clover";
/** Star Scatter — 1st, 3rd and 5th reels only, only 3 of a kind pays. */
export const STAR_SCATTER: SymbolId = "star";
/** Dollar Scatter — all reels, 3/4/5 anywhere pays. */
export const DOLLAR_SCATTER: SymbolId = "dollar";
export const SCATTERS: SymbolId[] = [STAR_SCATTER, DOLLAR_SCATTER];

/** Symbols the Wild can substitute (everything except the two Scatters). */
export const WILD_SUBSTITUTES: SymbolId[] = [
  "seven",
  "bell",
  "grapes",
  "plum",
  "orange",
  "lemon",
  "cherry",
];

/** Reels (0-based) each special symbol may appear on. */
export const WILD_REELS = [1, 2, 3];
export const STAR_REELS = [0, 2, 4];
export const DOLLAR_REELS = [0, 1, 2, 3, 4];

export type LineSymbolId = "seven" | "bell" | "grapes" | "plum" | "orange" | "lemon" | "cherry";

/**
 * Original paytable — multipliers of the LINE bet for 2/3/4/5 of a kind.
 * (Only the Seven pays for 2 of a kind.)
 */
export const PAYTABLE: Record<LineSymbolId, [number, number, number, number]> = {
  seven: [10, 50, 200, 3000],
  bell: [0, 40, 100, 500],
  grapes: [0, 20, 50, 200],
  plum: [0, 10, 30, 100],
  orange: [0, 10, 30, 100],
  lemon: [0, 10, 30, 100],
  cherry: [0, 10, 30, 100],
};

/** Star Scatter: only 3 Stars win — 20x the TOTAL bet. */
export const STAR_PAY: Record<number, number> = { 3: 20 };
/** Dollar Scatter: 3/4/5 anywhere — 3x / 20x / 100x the TOTAL bet. */
export const DOLLAR_PAY: Record<number, number> = { 3: 3, 4: 20, 5: 100 };

/** Kept for backwards compatible imports (Dollar scatter table). */
export const SCATTER_PAY = DOLLAR_PAY;

/** The 20 original fixed paylines, as row index (0 top, 1 middle, 2 bottom) per reel. */
export const PAYLINES: number[][] = [
  [1, 1, 1, 1, 1], // LINE 1
  [0, 0, 0, 0, 0], // LINE 2
  [2, 2, 2, 2, 2], // LINE 3
  [0, 1, 2, 1, 0], // LINE 4
  [2, 1, 0, 1, 2], // LINE 5
  [0, 0, 1, 2, 2], // LINE 6
  [2, 2, 1, 0, 0], // LINE 7
  [1, 0, 0, 0, 1], // LINE 8
  [1, 2, 2, 2, 1], // LINE 9
  [0, 1, 1, 1, 0], // LINE 10
  [2, 1, 1, 1, 2], // LINE 11
  [1, 0, 1, 0, 1], // LINE 12
  [1, 2, 1, 2, 1], // LINE 13
  [0, 0, 1, 0, 0], // LINE 14
  [2, 2, 1, 2, 2], // LINE 15
  [1, 1, 0, 1, 1], // LINE 16
  [1, 1, 2, 1, 1], // LINE 17
  [0, 1, 0, 1, 0], // LINE 18
  [2, 1, 2, 1, 2], // LINE 19
  [1, 0, 1, 2, 1], // LINE 20
];

/**
 * Weighted reel strips. Special symbols are simply absent from the reels they
 * are not allowed on, so the restrictions can never be violated.
 */
const WEIGHTS: Record<SymbolId, number>[] = [
  // reel 1 — no Clover (Wild appears on reels 2, 3, 4 only)
  { seven: 1, star: 4, dollar: 2, bell: 2, grapes: 13, plum: 9, orange: 11, lemon: 11, cherry: 12, clover: 0 },
  // reel 2 — no Star (Star appears on reels 1, 3, 5 only)
  { seven: 5, star: 0, dollar: 1, bell: 5, grapes: 6, plum: 10, orange: 12, lemon: 6, cherry: 12, clover: 1 },
  // reel 3 — every symbol allowed
  { seven: 4, star: 2, dollar: 2, bell: 4, grapes: 6, plum: 9, orange: 11, lemon: 15, cherry: 12, clover: 2 },
  // reel 4 — no Star
  { seven: 6, star: 0, dollar: 2, bell: 4, grapes: 6, plum: 10, orange: 11, lemon: 11, cherry: 13, clover: 2 },
  // reel 5 — no Clover
  { seven: 1, star: 2, dollar: 3, bell: 5, grapes: 6, plum: 10, orange: 7, lemon: 8, cherry: 11, clover: 0 },
];

export function canAppear(symbol: SymbolId, reel: number): boolean {
  return (WEIGHTS[reel]?.[symbol] ?? 0) > 0;
}

function pick(reel: number, rnd: () => number): SymbolId {
  const w = WEIGHTS[reel]!;
  let total = 0;
  for (const s of SYMBOLS) total += w[s];
  let r = rnd() * total;
  for (const s of SYMBOLS) {
    r -= w[s];
    if (r < 0) return s;
  }
  return "cherry";
}

/** grid[reel][row] */
export type Grid = SymbolId[][];

export function spinReels(rnd: () => number = Math.random): Grid {
  const grid: Grid = [];
  for (let reel = 0; reel < REELS; reel++) {
    const col: SymbolId[] = [];
    for (let row = 0; row < ROWS; row++) col.push(pick(reel, rnd));
    grid.push(col);
  }
  return grid;
}

export type LineWin = {
  line: number; // 1-based payline index
  symbol: SymbolId;
  count: number;
  amount: number;
  cells: [number, number][]; // [reel,row]
};

export type ScatterWin = {
  symbol: SymbolId; // "star" | "dollar"
  count: number;
  amount: number;
  cells: [number, number][];
};

export type SpinResult = {
  /** Final grid, after Wild expansion. */
  grid: Grid;
  /** Grid exactly as the reels stopped, before expansion. */
  baseGrid: Grid;
  /** Reels (0-based) that became fully Wild. */
  expandedReels: number[];
  lineWins: LineWin[];
  /** All scatter wins (Star and/or Dollar). */
  scatters: ScatterWin[];
  /** Best scatter win, for presentation. */
  scatter: ScatterWin | null;
  totalWin: number;
};

/** Evaluate the 20 paylines of a grid, left to right from reel 1. */
function evaluateLines(grid: Grid, lineBet: number): LineWin[] {
  const wins: LineWin[] = [];

  PAYLINES.forEach((line, idx) => {
    // Determine the paying symbol: first non-Wild symbol from the left.
    let symbol: SymbolId | null = null;
    for (let reel = 0; reel < REELS; reel++) {
      const s = grid[reel]![line[reel]!]!;
      if (s === WILD) continue;
      symbol = s;
      break;
    }
    // Wilds never start on reel 1 in this game, so an all-wild line cannot
    // happen; if it somehow does, nothing pays.
    if (!symbol) return;
    if (SCATTERS.includes(symbol)) return; // Scatters never pay on lines

    let count = 0;
    const cells: [number, number][] = [];
    for (let reel = 0; reel < REELS; reel++) {
      const s = grid[reel]![line[reel]!]!;
      if (s === symbol || s === WILD) {
        count++;
        cells.push([reel, line[reel]!]);
      } else break;
    }

    const mult = PAYTABLE[symbol as LineSymbolId]?.[count - 2] ?? 0;
    if (count >= 2 && mult > 0) {
      wins.push({
        line: idx + 1,
        symbol,
        count,
        amount: round2(lineBet * mult),
        cells: cells.slice(0, count),
      });
    }
  });

  return wins;
}

function scatterWins(grid: Grid, totalBet: number): ScatterWin[] {
  const out: ScatterWin[] = [];

  const collect = (sym: SymbolId) => {
    const cells: [number, number][] = [];
    grid.forEach((col, reel) =>
      col.forEach((s, row) => {
        if (s === sym) cells.push([reel, row]);
      }),
    );
    return cells;
  };

  // Star: only 3 of a kind wins, positions anywhere on reels 1, 3 and 5.
  const stars = collect(STAR_SCATTER);
  if (stars.length >= 3) {
    out.push({
      symbol: STAR_SCATTER,
      count: 3,
      amount: round2(totalBet * STAR_PAY[3]!),
      cells: stars.slice(0, 3),
    });
  }

  // Dollar: 3, 4 or 5 anywhere on the screen.
  const dollars = collect(DOLLAR_SCATTER);
  if (dollars.length >= 3) {
    const n = Math.min(5, dollars.length);
    out.push({
      symbol: DOLLAR_SCATTER,
      count: n,
      amount: round2(totalBet * (DOLLAR_PAY[n] ?? 0)),
      cells: dollars.slice(0, n),
    });
  }

  return out;
}

export function evaluate(baseGrid: Grid, totalBet: number): SpinResult {
  const lineBet = totalBet / LINES;

  // 1. First evaluation on the reels as they stopped.
  const firstPass = evaluateLines(baseGrid, lineBet);

  // 2. Wild expansion: a Clover that takes part in a winning combination
  //    expands over its whole reel (only reels 2, 3, 4 can hold Clover).
  const expandedReels: number[] = [];
  for (const win of firstPass) {
    for (const [reel, row] of win.cells) {
      if (baseGrid[reel]![row] === WILD && WILD_REELS.includes(reel) && !expandedReels.includes(reel)) {
        expandedReels.push(reel);
      }
    }
  }
  expandedReels.sort((a, b) => a - b);

  const grid: Grid = baseGrid.map((col, reel) =>
    expandedReels.includes(reel) ? (Array(ROWS).fill(WILD) as SymbolId[]) : [...col],
  );

  // 3. Winnings are paid after the expanding of the Wild symbol.
  const lineWins = expandedReels.length ? evaluateLines(grid, lineBet) : firstPass;

  // 4. Scatters are evaluated on the reels as they stopped (Wild never
  //    substitutes a Scatter) and added to the payline wins.
  const scatters = scatterWins(baseGrid, totalBet);
  const scatter =
    scatters.slice().sort((a, b) => b.amount - a.amount)[0] ?? null;

  const totalWin = round2(
    lineWins.reduce((s, w) => s + w.amount, 0) + scatters.reduce((s, w) => s + w.amount, 0),
  );

  return { grid, baseGrid, expandedReels, lineWins, scatters, scatter, totalWin };
}

export function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Bet ladder requested by the operator (GEL) — this is the TOTAL bet. */
export const BET_STEPS = [
  0.2, 0.4, 0.6, 1, 2, 3, 4, 5, 10, 20, 40, 60, 80, 100,
] as const;
export const BET_MIN = BET_STEPS[0];
export const BET_MAX = 100;
/** Line bet = total bet / 20. */
export const lineBetOf = (totalBet: number) => round2(totalBet / LINES);
