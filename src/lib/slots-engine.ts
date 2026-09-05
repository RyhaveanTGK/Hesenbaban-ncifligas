/**
 * Cobra Slots — 5x3 / 25 fixed paylines math engine.
 *
 * Pure, dependency-free module. The server calls `spinReels()` + `evaluate()`
 * to decide every outcome; the client only re-uses the tables/types to render.
 *
 * Wins pay left-to-right on adjacent reels starting from reel 1.
 * CLOVER is a scatter: 3+ anywhere on the grid pays TOTAL bet x multiplier and
 * triggers the "clover burst" animation. Only the highest win per line pays.
 */

export const REELS = 5;
export const ROWS = 3;
export const LINES = 25;

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

export const SCATTER: SymbolId = "clover";

/** Line paytable: multiplier of the LINE bet (total bet / 25) for 2..5 of a kind. */
export const PAYTABLE: Record<Exclude<SymbolId, "clover">, [number, number, number, number]> = {
  seven: [0, 100, 500, 2500],
  star: [0, 50, 250, 1000],
  dollar: [0, 40, 200, 750],
  bell: [0, 30, 120, 500],
  grapes: [0, 25, 100, 300],
  plum: [0, 20, 75, 250],
  orange: [0, 18, 60, 175],
  lemon: [0, 18, 60, 175],
  cherry: [6, 18, 45, 125],
};

/** Scatter paytable: multiplier of the TOTAL bet for 3, 4, 5 clovers anywhere. */
export const SCATTER_PAY: Record<number, number> = { 3: 8, 4: 30, 5: 150 };

/** 25 paylines expressed as the row index (0 top, 1 middle, 2 bottom) per reel. */
export const PAYLINES: number[][] = [
  [1, 1, 1, 1, 1],
  [0, 0, 0, 0, 0],
  [2, 2, 2, 2, 2],
  [0, 1, 2, 1, 0],
  [2, 1, 0, 1, 2],
  [0, 0, 1, 0, 0],
  [2, 2, 1, 2, 2],
  [1, 0, 0, 0, 1],
  [1, 2, 2, 2, 1],
  [1, 0, 1, 0, 1],
  [1, 2, 1, 2, 1],
  [0, 1, 0, 1, 0],
  [2, 1, 2, 1, 2],
  [0, 1, 1, 1, 0],
  [2, 1, 1, 1, 2],
  [1, 0, 1, 2, 1],
  [1, 2, 1, 0, 1],
  [0, 0, 2, 0, 0],
  [2, 2, 0, 2, 2],
  [0, 2, 2, 2, 0],
  [2, 0, 0, 0, 2],
  [1, 1, 0, 1, 1],
  [1, 1, 2, 1, 1],
  [0, 2, 0, 2, 0],
  [2, 0, 2, 0, 2],
];

/**
 * Weighted reel strips (symbol frequency per reel). Tuned by simulation to a
 * theoretical RTP of ~95%. Higher reels carry fewer premium symbols so long
 * combinations stay rare.
 */
const WEIGHTS: Record<SymbolId, number>[] = [
  { seven: 3, star: 4, dollar: 4, bell: 5, grapes: 6, plum: 7, orange: 9, lemon: 9, cherry: 10, clover: 3 },
  { seven: 3, star: 4, dollar: 4, bell: 5, grapes: 6, plum: 7, orange: 9, lemon: 9, cherry: 9, clover: 3 },
  { seven: 2, star: 3, dollar: 4, bell: 5, grapes: 6, plum: 7, orange: 9, lemon: 9, cherry: 9, clover: 3 },
  { seven: 2, star: 3, dollar: 3, bell: 4, grapes: 6, plum: 7, orange: 9, lemon: 9, cherry: 9, clover: 2 },
  { seven: 2, star: 3, dollar: 3, bell: 4, grapes: 5, plum: 6, orange: 9, lemon: 9, cherry: 9, clover: 2 },
];

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
  count: number;
  amount: number;
  cells: [number, number][];
};

export type SpinResult = {
  grid: Grid;
  lineWins: LineWin[];
  scatter: ScatterWin | null;
  totalWin: number;
};

export function evaluate(grid: Grid, totalBet: number): SpinResult {
  const lineBet = totalBet / LINES;
  const lineWins: LineWin[] = [];

  PAYLINES.forEach((line, idx) => {
    const first = grid[0]![line[0]!]!;
    if (first === SCATTER) return;
    let count = 1;
    for (let reel = 1; reel < REELS; reel++) {
      if (grid[reel]![line[reel]!] === first) count++;
      else break;
    }
    const mult = PAYTABLE[first as Exclude<SymbolId, "clover">][count - 2];
    if (count >= 2 && mult && mult > 0) {
      const cells: [number, number][] = [];
      for (let r = 0; r < count; r++) cells.push([r, line[r]!]);
      lineWins.push({
        line: idx + 1,
        symbol: first,
        count,
        amount: round2(lineBet * mult),
        cells,
      });
    }
  });

  const scatterCells: [number, number][] = [];
  grid.forEach((col, reel) =>
    col.forEach((s, row) => {
      if (s === SCATTER) scatterCells.push([reel, row]);
    }),
  );
  const scatter: ScatterWin | null =
    scatterCells.length >= 3
      ? {
          count: scatterCells.length,
          amount: round2(totalBet * (SCATTER_PAY[Math.min(5, scatterCells.length)] ?? 0)),
          cells: scatterCells,
        }
      : null;

  const totalWin = round2(
    lineWins.reduce((s, w) => s + w.amount, 0) + (scatter?.amount ?? 0),
  );
  return { grid, lineWins, scatter, totalWin };
}

export function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Bet ladder requested by the operator (GEL). */
export const BET_STEPS = [
  0.15, 0.2, 0.3, 0.5, 0.6, 0.8, 1, 1.3, 1.5, 1.8, 2, 2.5, 3, 3.5, 4, 4.5, 5, 100,
] as const;
export const BET_MIN = BET_STEPS[0];
export const BET_MAX = 100;
