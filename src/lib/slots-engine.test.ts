/**
 * Cobra Slots 25 — math engine tests.
 *
 * Run with:  bunx vitest run
 */
import { describe, expect, it } from "vitest";
import {
  BET_MAX,
  BET_MIN,
  BET_STEPS,
  DOLLAR_PAY,
  LINES,
  PAYLINES,
  PAYTABLE,
  REELS,
  ROWS,
  STAR_PAY,
  SYMBOLS,
  TOTAL_BET_PAYTABLE,
  WILD,
  WILD_REELS,
  canAppear,
  evaluate,
  spinReels,
  type Grid,
  type SymbolId,
} from "./slots-engine";

const TOTAL_BET = 20; // line bet = 1.00 -> line multiplier === win amount
const LINE_BET = TOTAL_BET / LINES;

/** Build a grid where every cell is `filler`, then paint the given cells. */
function grid(filler: SymbolId, cells: Array<[number, number, SymbolId]> = []): Grid {
  const g: Grid = Array.from({ length: REELS }, () =>
    Array.from({ length: ROWS }, () => filler),
  );
  for (const [reel, row, s] of cells) g[reel]![row] = s;
  return g;
}

/** Paint `symbol` on the first `count` reels of payline 1 (middle row). */
function onLine1(symbol: SymbolId, count: number, filler: SymbolId = "cherry"): Grid {
  const g = grid(filler);
  // make sure the filler never accidentally continues the combination
  for (let reel = 0; reel < REELS; reel++) g[reel]![1] = reel < count ? symbol : "bell";
  if (symbol === "bell") for (let reel = count; reel < REELS; reel++) g[reel]![1] = "cherry";
  return g;
}

describe("board configuration", () => {
  it("is a 5x3 board with 20 fixed paylines", () => {
    expect(REELS).toBe(5);
    expect(ROWS).toBe(3);
    expect(LINES).toBe(20);
    expect(PAYLINES).toHaveLength(20);
  });

  it("every payline covers all 5 reels with valid rows", () => {
    for (const line of PAYLINES) {
      expect(line).toHaveLength(REELS);
      for (const row of line) expect(row).toBeGreaterThanOrEqual(0);
      for (const row of line) expect(row).toBeLessThan(ROWS);
    }
  });

  it("paylines match the reference layout (image 2)", () => {
    expect(PAYLINES[0]).toEqual([1, 1, 1, 1, 1]);
    expect(PAYLINES[1]).toEqual([0, 0, 0, 0, 0]);
    expect(PAYLINES[2]).toEqual([2, 2, 2, 2, 2]);
    expect(PAYLINES[3]).toEqual([0, 1, 2, 1, 0]);
    expect(PAYLINES[4]).toEqual([2, 1, 0, 1, 2]);
    expect(PAYLINES[19]).toEqual([1, 0, 1, 2, 1]);
  });

  it("includes the watermelon symbol on the reels", () => {
    expect(SYMBOLS).toContain("watermelon");
    for (let reel = 0; reel < REELS; reel++) {
      expect(canAppear("watermelon", reel)).toBe(true);
    }
  });

  it("keeps the special-symbol reel restrictions", () => {
    expect(canAppear("clover", 0)).toBe(false);
    expect(canAppear("clover", 4)).toBe(false);
    expect(canAppear("star", 1)).toBe(false);
    expect(canAppear("star", 3)).toBe(false);
    for (const reel of WILD_REELS) expect(canAppear("clover", reel)).toBe(true);
  });
});

describe("paytable (multipliers of the total bet)", () => {
  const expected: Record<string, [number, number, number, number]> = {
    seven: [0.5, 2.5, 10, 150],
    watermelon: [0, 2, 5, 25],
    grapes: [0, 2, 5, 25],
    bell: [0, 1, 2.5, 10],
    orange: [0, 0.5, 1.5, 5],
    lemon: [0, 0.5, 1.5, 5],
    cherry: [0, 0.5, 1.5, 5],
    plum: [0, 0.5, 1.5, 5],
  };

  for (const [symbol, pays] of Object.entries(expected)) {
    it(`${symbol} pays ${pays.join(" / ")} x total bet`, () => {
      expect(TOTAL_BET_PAYTABLE[symbol as keyof typeof TOTAL_BET_PAYTABLE]).toEqual(pays);
    });
  }

  it("line multipliers are the total-bet multipliers times 20", () => {
    for (const symbol of Object.keys(PAYTABLE) as Array<keyof typeof PAYTABLE>) {
      PAYTABLE[symbol].forEach((m, i) => {
        expect(m).toBeCloseTo(TOTAL_BET_PAYTABLE[symbol][i]! * LINES, 6);
      });
    }
  });

  it("only the Red Seven pays for 2 of a kind", () => {
    for (const symbol of Object.keys(PAYTABLE) as Array<keyof typeof PAYTABLE>) {
      if (symbol === "seven") expect(PAYTABLE[symbol][0]).toBeGreaterThan(0);
      else expect(PAYTABLE[symbol][0]).toBe(0);
    }
  });
});

describe("line wins", () => {
  const cases: Array<[SymbolId, number, number]> = [
    ["seven", 2, 0.5],
    ["seven", 3, 2.5],
    ["seven", 4, 10],
    ["seven", 5, 150],
    ["watermelon", 3, 2],
    ["watermelon", 4, 5],
    ["watermelon", 5, 25],
    ["grapes", 3, 2],
    ["grapes", 5, 25],
    ["bell", 3, 1],
    ["bell", 4, 2.5],
    ["bell", 5, 10],
    ["orange", 3, 0.5],
    ["lemon", 4, 1.5],
    ["cherry", 5, 5],
    ["plum", 3, 0.5],
  ];

  for (const [symbol, count, mult] of cases) {
    it(`${count} x ${symbol} pays ${mult}x the total bet`, () => {
      const g = onLine1(symbol, count);
      const r = evaluate(g, TOTAL_BET);
      const win = r.lineWins.find((w) => w.line === 1);
      expect(win).toBeTruthy();
      expect(win!.symbol).toBe(symbol);
      expect(win!.count).toBe(count);
      expect(win!.amount).toBeCloseTo(mult * TOTAL_BET, 6);
    });
  }

  it("pays nothing for 2 of a kind of a low symbol", () => {
    const r = evaluate(onLine1("watermelon", 2), TOTAL_BET);
    expect(r.lineWins.find((w) => w.line === 1)).toBeUndefined();
  });

  it("only counts adjacent reels from the leftmost reel", () => {
    const g = grid("bell");
    // watermelon on reels 2..5 but not reel 1 -> no line-1 win
    for (let reel = 1; reel < REELS; reel++) g[reel]![1] = "watermelon";
    const r = evaluate(g, TOTAL_BET);
    expect(r.lineWins.find((w) => w.line === 1 && w.symbol === "watermelon")).toBeUndefined();
  });

  it("uses the line bet, not the total bet", () => {
    const r = evaluate(onLine1("seven", 5), 40);
    expect(r.lineWins[0]!.amount).toBeCloseTo(PAYTABLE.seven[3]! * (40 / LINES), 6);
  });
});

describe("Clover wild", () => {
  it("substitutes for a regular symbol", () => {
    const g = onLine1("watermelon", 5);
    g[2]![1] = WILD;
    const r = evaluate(g, TOTAL_BET);
    const win = r.lineWins.find((w) => w.symbol === "watermelon" && w.count === 5);
    expect(win).toBeTruthy();
  });

  it("expands over its whole reel when it wins", () => {
    const g = onLine1("watermelon", 5);
    g[2]![1] = WILD;
    const r = evaluate(g, TOTAL_BET);
    expect(r.expandedReels).toContain(2);
    expect(r.grid[2]).toEqual([WILD, WILD, WILD]);
    // the base grid is preserved for the animation
    expect(r.baseGrid[2]![0]).not.toBe(WILD);
  });

  it("pays after the expansion (extra lines can win)", () => {
    const g = onLine1("watermelon", 5);
    g[2]![1] = WILD;
    const expanded = evaluate(g, TOTAL_BET);

    const noWild = onLine1("watermelon", 5);
    const plain = evaluate(noWild, TOTAL_BET);
    expect(expanded.totalWin).toBeGreaterThanOrEqual(plain.totalWin);
  });

  it("never substitutes a scatter", () => {
    const g = grid("bell", [
      [0, 1, "dollar"],
      [1, 1, WILD],
      [2, 1, "dollar"],
    ]);
    const r = evaluate(g, TOTAL_BET);
    expect(r.scatters.find((s) => s.symbol === "dollar")).toBeUndefined();
  });
});

describe("scatters", () => {
  it("3 Dollars anywhere pay 3x the total bet", () => {
    const g = grid("cherry", [
      [0, 0, "dollar"],
      [2, 2, "dollar"],
      [4, 1, "dollar"],
    ]);
    const r = evaluate(g, TOTAL_BET);
    const dollar = r.scatters.find((s) => s.symbol === "dollar");
    expect(dollar!.amount).toBeCloseTo(DOLLAR_PAY[3]! * TOTAL_BET, 6);
  });

  it("4 and 5 Dollars pay 20x and 100x the total bet", () => {
    const four = grid("cherry", [
      [0, 0, "dollar"],
      [1, 0, "dollar"],
      [2, 2, "dollar"],
      [4, 1, "dollar"],
    ]);
    expect(evaluate(four, TOTAL_BET).scatters[0]!.amount).toBeCloseTo(
      DOLLAR_PAY[4]! * TOTAL_BET,
      6,
    );

    const five = grid("cherry", [
      [0, 0, "dollar"],
      [1, 0, "dollar"],
      [2, 2, "dollar"],
      [3, 1, "dollar"],
      [4, 1, "dollar"],
    ]);
    expect(evaluate(five, TOTAL_BET).scatters[0]!.amount).toBeCloseTo(
      DOLLAR_PAY[5]! * TOTAL_BET,
      6,
    );
  });

  it("3 Stars pay 20x the total bet", () => {
    const g = grid("cherry", [
      [0, 0, "star"],
      [2, 1, "star"],
      [4, 2, "star"],
    ]);
    const r = evaluate(g, TOTAL_BET);
    expect(r.scatters[0]!.symbol).toBe("star");
    expect(r.scatters[0]!.amount).toBeCloseTo(STAR_PAY[3]! * TOTAL_BET, 6);
  });

  it("scatter wins are added to line wins", () => {
    const g = onLine1("bell", 3);
    g[0]![0] = "dollar";
    g[2]![0] = "dollar";
    g[4]![0] = "dollar";
    const r = evaluate(g, TOTAL_BET);
    const lines = r.lineWins.reduce((a, w) => a + w.amount, 0);
    const scat = r.scatters.reduce((a, w) => a + w.amount, 0);
    expect(scat).toBeGreaterThan(0);
    expect(r.totalWin).toBeCloseTo(lines + scat, 6);
  });
});

describe("random spins", () => {
  it("always produces a full valid grid and a non-negative win", () => {
    for (let i = 0; i < 2000; i++) {
      const base = spinReels();
      expect(base).toHaveLength(REELS);
      base.forEach((col, reel) => {
        expect(col).toHaveLength(ROWS);
        col.forEach((s) => {
          expect(SYMBOLS).toContain(s);
          expect(canAppear(s, reel)).toBe(true);
        });
      });
      const r = evaluate(base, TOTAL_BET);
      expect(r.totalWin).toBeGreaterThanOrEqual(0);
      expect(Number.isFinite(r.totalWin)).toBe(true);
    }
  });

  it("line bet is exactly one twentieth of the total bet", () => {
    expect(LINE_BET).toBeCloseTo(1, 6);
  });

  it("has a plausible RTP over a long simulation", () => {
    let staked = 0;
    let paid = 0;
    for (let i = 0; i < 60000; i++) {
      staked += TOTAL_BET;
      paid += evaluate(spinReels(), TOTAL_BET).totalWin;
    }
    const rtp = paid / staked;
    expect(rtp).toBeGreaterThan(0.4);
    expect(rtp).toBeLessThan(1.5);
  });
});

/* ------------------------------------------------------- bet ladder (image 2) */

describe("bet ladder", () => {
  const EXPECTED = [
    0.2, 0.4, 0.6, 0.8, 1, 1.6, 2, 2.6, 3, 3.6, 4, 5, 6, 7, 8, 9, 10, 12, 14, 16, 18, 20, 25, 30,
    40, 50, 60, 70, 80, 90, 100, 200, 300, 400, 500, 600, 700, 800, 900, 1000,
  ];

  it("offers every bet shown in the BET OPTIONS panel", () => {
    expect([...BET_STEPS]).toEqual(EXPECTED);
  });

  it("is strictly ascending and inside the min/max limits", () => {
    for (let i = 1; i < BET_STEPS.length; i++) {
      expect(BET_STEPS[i]!).toBeGreaterThan(BET_STEPS[i - 1]!);
    }
    expect(BET_MIN).toBe(0.2);
    expect(BET_STEPS[BET_STEPS.length - 1]).toBe(BET_MAX);
  });
});

/* ------------------------------------ pre-expansion grid used by the animation */

describe("wild expansion animation data", () => {
  it("baseGrid keeps the single Clover so the reel can expand afterwards", () => {
    const g = onLine1("cherry", 3);
    g[1]![1] = WILD;
    const r = evaluate(g, TOTAL_BET);

    expect(r.expandedReels).toContain(1);
    // pre-expansion snapshot: exactly one Clover on the winning reel
    expect(r.baseGrid[1]!.filter((s) => s === WILD)).toHaveLength(1);
    // post-expansion grid: the whole reel is Clover
    expect(r.grid[1]!.every((s) => s === WILD)).toBe(true);
    // the rest of the board is untouched
    expect(r.baseGrid[0]).toEqual(r.grid[0]);
  });

  it("leaves baseGrid identical to grid when nothing expands", () => {
    const r = evaluate(onLine1("cherry", 3), TOTAL_BET);
    expect(r.expandedReels).toHaveLength(0);
    expect(r.baseGrid).toEqual(r.grid);
  });
});
