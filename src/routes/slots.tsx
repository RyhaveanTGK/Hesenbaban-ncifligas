import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, Info, Minus, Plus, RefreshCw, Volume2, VolumeX, X } from "lucide-react";
import { toast } from "sonner";
import { useAuthUser } from "@/lib/session";
import { playUiSound, useGameSettings } from "@/lib/game-settings";
import { DepositDialog } from "@/components/DepositDialog";
import { getSlotsBalance, spinSlots } from "@/lib/slots.functions";
import {
  BET_MAX,
  BET_STEPS,
  LINES,
  PAYTABLE,
  TOTAL_BET_PAYTABLE,
  REELS,
  ROWS,
  DOLLAR_PAY,
  STAR_PAY,
  SYMBOLS,
  type Grid,
  type LineSymbolId,
  type SpinResult,
  type SymbolId,
} from "@/lib/slots-engine";

import frameImg from "@/assets/slots/frame.jpg";
import sevenImg from "@/assets/slots/seven.png";
import starImg from "@/assets/slots/star.png";
import dollarImg from "@/assets/slots/dollar.png";
import bellImg from "@/assets/slots/bell.png";
import grapesImg from "@/assets/slots/grapes.png";
import plumImg from "@/assets/slots/plum.png";
import orangeImg from "@/assets/slots/orange.png";
import lemonImg from "@/assets/slots/lemon.png";
import cherryImg from "@/assets/slots/cherry.png";
import watermelonImg from "@/assets/slots/watermelon.png";
import cloverImg from "@/assets/slots/clover.png";

export const Route = createFileRoute("/slots")({
  head: () => ({
    meta: [
      { title: "Cobra Slots 25 — 20 Burning Hot" },
      {
        name: "description",
        content:
          "Cobra Slots 25: 20 Burning Hot mechanics — 5 reels, 20 fixed lines, expanding Clover Wild, Star and Dollar scatters.",
      },
      { property: "og:title", content: "Cobra Slots 25 — 20 Burning Hot" },
      {
        property: "og:description",
        content:
          "Cobra Slots 25: 20 Burning Hot mechanics — 5 reels, 20 fixed lines, expanding Clover Wild, Star and Dollar scatters.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: SlotsPage,
});

const IMG: Record<SymbolId, string> = {
  seven: sevenImg,
  star: starImg,
  dollar: dollarImg,
  bell: bellImg,
  grapes: grapesImg,
  plum: plumImg,
  orange: orangeImg,
  lemon: lemonImg,
  cherry: cherryImg,
  watermelon: watermelonImg,
  clover: cloverImg,
};

const NAMES: Record<SymbolId, string> = {
  seven: "Seven",
  star: "Star (Scatter)",
  dollar: "Dollar (Scatter)",
  bell: "Bell",
  grapes: "Grapes",
  plum: "Plum",
  orange: "Orange",
  lemon: "Lemon",
  cherry: "Cherry",
  watermelon: "Watermelon",
  clover: "Clover (Wild)",
};

const INITIAL_GRID: Grid = [
  ["seven", "watermelon", "lemon"],
  ["bell", "orange", "dollar"],
  ["plum", "cherry", "cherry"],
  ["star", "seven", "clover"],
  ["star", "lemon", "grapes"],
];

const SPIN_BASE_MS = 900;
const SPIN_STAGGER_MS = 260;
const STRIP_LEN = 14;

const randomSymbol = (): SymbolId => SYMBOLS[Math.floor(Math.random() * SYMBOLS.length)]!;
const fmt = (n: number) => n.toFixed(2);

/* -------------------------------------------------------------- win counter */

function useCountUp(target: number, durationMs = 1200) {
  const [value, setValue] = useState(0);
  useEffect(() => {
    if (target <= 0) {
      setValue(0);
      return;
    }
    let raf = 0;
    const start = performance.now();
    const tick = (t: number) => {
      const p = Math.min(1, (t - start) / durationMs);
      setValue(target * (1 - Math.pow(1 - p, 3)));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, durationMs]);
  return value;
}

/* --------------------------------------------------------------------- page */

function SlotsPage() {
  const navigate = useNavigate();
  const { user, ready } = useAuthUser();
  const { settings, update } = useGameSettings();

  const [balance, setBalance] = useState(0);
  const [betIdx, setBetIdx] = useState(3); // 1.00 GEL
  const [betOpen, setBetOpen] = useState(false);
  const [grid, setGrid] = useState<Grid>(INITIAL_GRID);
  const [spinningReels, setSpinningReels] = useState<boolean[]>(Array(REELS).fill(false));
  const [result, setResult] = useState<SpinResult | null>(null);
  const [showWin, setShowWin] = useState(0);
  const [winKey, setWinKey] = useState(0);
  const [burst, setBurst] = useState(false);
  const [busy, setBusy] = useState(false);
  const [auto, setAuto] = useState(false);
  const [infoOpen, setInfoOpen] = useState(false);
  const [depositOpen, setDepositOpen] = useState(false);
  const [strips, setStrips] = useState<SymbolId[][]>([]);

  const autoRef = useRef(false);
  const busyRef = useRef(false);
  const holdTimer = useRef<number | null>(null);
  const heldRef = useRef(false);

  const bet = BET_STEPS[betIdx]!;
  const displayedWin = useCountUp(showWin);

  useEffect(() => {
    if (user) setBalance(Number(user.chipBalance) || 0);
  }, [user]);

  const refreshBalance = useCallback(async () => {
    if (!user) return;
    const r = await getSlotsBalance({ data: { userId: user.id } });
    if (r && typeof r.balance === "number") setBalance(r.balance);
  }, [user]);

  useEffect(() => {
    void refreshBalance();
  }, [refreshBalance]);

  const sound = useCallback(
    (f: number, d = 0.08) => {
      if (settings.soundEffects) playUiSound(f, d);
    },
    [settings.soundEffects],
  );

  /* ------------------------------------------------------------- one spin */
  const doSpin = useCallback(
    async (wager: number): Promise<boolean> => {
      if (!user || busyRef.current) return false;
      busyRef.current = true;
      setBusy(true);
      setResult(null);
      setBurst(false);
      setShowWin(0);
      setBetOpen(false);

      const res = await spinSlots({ data: { userId: user.id, bet: wager } });
      if (!res.ok) {
        toast.error(res.error);
        busyRef.current = false;
        setBusy(false);
        return false;
      }

      // balance after the bet is taken (win is credited when reels stop)
      setBalance(Math.max(0, res.balance - res.result.totalWin));
      setStrips(
        Array.from({ length: REELS }, () => Array.from({ length: STRIP_LEN }, randomSymbol)),
      );
      setSpinningReels(Array(REELS).fill(true));
      sound(420, 0.12);

      await new Promise<void>((resolve) => {
        for (let reel = 0; reel < REELS; reel++) {
          window.setTimeout(() => {
            setGrid((g) => {
              const next = g.map((c) => [...c]) as Grid;
              next[reel] = [...res.result.grid[reel]!];
              return next;
            });
            setSpinningReels((s) => {
              const n = [...s];
              n[reel] = false;
              return n;
            });
            sound(300 + reel * 40, 0.05);
            if (reel === REELS - 1) resolve();
          }, SPIN_BASE_MS + reel * SPIN_STAGGER_MS);
        }
      });

      setResult(res.result);
      if (res.result.totalWin > 0) {
        setWinKey((k) => k + 1);
        setShowWin(res.result.totalWin);
        setBalance(res.balance);
        if (res.result.scatter) {
          setBurst(true);
          [0, 90, 180, 300, 420].forEach((d, i) =>
            window.setTimeout(() => sound(700 + i * 120, 0.1), d),
          );
        } else {
          [0, 100, 200].forEach((d, i) => window.setTimeout(() => sound(660 + i * 110, 0.08), d));
        }
        await new Promise((r) => window.setTimeout(r, res.result.scatter ? 2200 : 1400));
      } else {
        setBalance(res.balance);
        await new Promise((r) => window.setTimeout(r, 250));
      }

      busyRef.current = false;
      setBusy(false);
      return true;
    },
    [user, sound],
  );

  /* ------------------------------------------------------------- auto play */
  useEffect(() => {
    autoRef.current = auto;
    if (!auto) return;
    let cancelled = false;
    (async () => {
      while (!cancelled && autoRef.current) {
        const ok = await doSpin(BET_STEPS[betIdx]!);
        if (!ok) {
          setAuto(false);
          break;
        }
        await new Promise((r) => window.setTimeout(r, 500));
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [auto]);

  /* -------------------------------------------------- spin button gestures */
  const onSpinDown = () => {
    heldRef.current = false;
    holdTimer.current = window.setTimeout(() => {
      heldRef.current = true;
      sound(520, 0.1);
      setAuto(true);
    }, 650);
  };
  const onSpinUp = () => {
    if (holdTimer.current) window.clearTimeout(holdTimer.current);
    holdTimer.current = null;
    if (heldRef.current) return;
    if (auto) {
      setAuto(false);
      return;
    }
    void doSpin(bet);
  };

  const changeBet = (dir: 1 | -1) => {
    sound(dir > 0 ? 720 : 560, 0.05);
    setBetIdx((i) => Math.max(0, Math.min(BET_STEPS.length - 1, i + dir)));
  };

  const maxBet = () => {
    if (busy) return;
    sound(800, 0.1);
    void doSpin(BET_MAX); // server wagers the whole balance (capped at 100)
  };

  const winningCells = useMemo(() => {
    const set = new Set<string>();
    result?.lineWins.forEach((w) => w.cells.forEach(([r, c]) => set.add(`${r}-${c}`)));
    result?.scatters.forEach((sc) => sc.cells.forEach(([r, c]) => set.add(`${r}-${c}`)));
    return set;
  }, [result]);

  const expandedReels = useMemo(
    () => new Set<number>(result?.expandedReels ?? []),
    [result],
  );

  const scatterCells = useMemo(() => {
    const set = new Set<string>();
    result?.scatters.forEach((sc) => sc.cells.forEach(([r, c]) => set.add(`${r}-${c}`)));
    return set;
  }, [result]);

  if (!ready || !user) return null;

  return (
    <main className="slot-page">
      <div className="slot-stage">
        {/* ------------------------------------------------ frame + reels */}
        <section className="slot-frame" aria-label="Cobra Slots reels">
          <img src={frameImg} alt="" className="slot-frame-img" draggable={false} />
          <div className="slot-logo-shine" aria-hidden="true" />

          {/* back */}
          <button
            type="button"
            aria-label="Exit game"
            onClick={() => {
              setAuto(false);
              void navigate({ to: "/dashboard" });
            }}
            className="slot-corner slot-corner-left"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>

          {/* balance */}
          <div className="slot-corner slot-corner-right slot-balance">
            <span className="slot-coin" aria-hidden="true" />
            <span className="slot-balance-value">
              {fmt(balance)} <small>GEL</small>
            </span>
            <button
              type="button"
              aria-label="Deposit"
              onClick={() => setDepositOpen(true)}
              className="slot-plus"
            >
              <Plus className="h-4 w-4" strokeWidth={3} />
            </button>
          </div>

          {/* reels */}
          <div className="slot-reels">
            {grid.map((col, reel) => {
              const spinning = spinningReels[reel];
              return (
                <div
                  key={reel}
                  className={`slot-reel ${spinning ? "is-spinning" : "is-stopped"} ${
                    !spinning && expandedReels.has(reel) ? "is-wild-reel" : ""
                  }`}
                >
                  {!spinning && expandedReels.has(reel) && (
                    <span className="slot-wild-flames" aria-hidden="true">
                      {Array.from({ length: 9 }, (_, i) => (
                        <i key={i} style={{ ["--i" as string]: i }} />
                      ))}
                      <b className="slot-wild-label">WILD</b>
                    </span>
                  )}
                  {spinning ? (
                    <div className="slot-strip">
                      {(strips[reel] ?? []).concat(strips[reel] ?? []).map((s, i) => (
                        <div key={i} className="slot-cell">
                          <img src={IMG[s]} alt="" draggable={false} />
                        </div>
                      ))}
                    </div>
                  ) : (
                    col.map((s, row) => {
                      const key = `${reel}-${row}`;
                      const win = winningCells.has(key);
                      const isBurst = burst && scatterCells.has(key);
                      return (
                        <div
                          key={key}
                          className={`slot-cell slot-cell-land ${win ? "is-win" : ""} ${
                            isBurst ? "is-burst" : ""
                          } ${expandedReels.has(reel) ? "is-wild-open" : ""} ${
                            result && !win && !expandedReels.has(reel) ? "is-dim" : ""
                          }`}
                          style={{ animationDelay: `${row * (expandedReels.has(reel) ? 110 : 40)}ms` }}
                        >
                          <img src={IMG[s]} alt={NAMES[s]} draggable={false} />
                          {isBurst && (
                            <span className="slot-burst-ring" aria-hidden="true">
                              {Array.from({ length: 8 }, (_, i) => (
                                <i key={i} style={{ ["--i" as string]: i }} />
                              ))}
                            </span>
                          )}
                        </div>
                      );
                    })
                  )}
                </div>
              );
            })}
          </div>

          {burst && (
            <div className="slot-burst-banner" role="status">
              <span>{result?.scatter?.symbol === "star" ? "STAR SCATTER!" : "DOLLAR SCATTER!"}</span>
              <b>
                +{fmt(result?.scatters.reduce((a, w) => a + w.amount, 0) ?? 0)} GEL
              </b>
            </div>
          )}
        </section>

        {/* ------------------------------------------------------ controls */}
        <section className="slot-controls" aria-label="Controls">
          <button
            type="button"
            className="slot-btn slot-btn-sq"
            aria-label="Game info"
            onClick={() => setInfoOpen(true)}
          >
            <Info className="h-5 w-5" />
          </button>
          <button
            type="button"
            className="slot-btn slot-btn-sq"
            aria-label={settings.soundEffects ? "Mute" : "Unmute"}
            onClick={() => update({ soundEffects: !settings.soundEffects })}
          >
            {settings.soundEffects ? <Volume2 className="h-5 w-5" /> : <VolumeX className="h-5 w-5" />}
          </button>

          <div className="slot-panel-wrap">
            <button
              type="button"
              className={`slot-panel ${betOpen ? "is-open" : ""}`}
              onClick={() => {
                sound(600, 0.04);
                setBetOpen((o) => !o);
              }}
              disabled={busy}
            >
              <span className="slot-panel-label">TOTAL BET</span>
              <span className="slot-panel-value">
                {fmt(bet)} <small>GEL</small>
              </span>
            </button>
            {betOpen && (
              <div className="slot-bet-popover" role="group" aria-label="Change bet">
                <button
                  type="button"
                  aria-label="Decrease bet"
                  onClick={() => changeBet(-1)}
                  disabled={betIdx === 0}
                >
                  <Minus className="h-4 w-4" strokeWidth={3} />
                </button>
                <span>
                  {fmt(bet)} <small>GEL</small>
                </span>
                <button
                  type="button"
                  aria-label="Increase bet"
                  onClick={() => changeBet(1)}
                  disabled={betIdx === BET_STEPS.length - 1}
                >
                  <Plus className="h-4 w-4" strokeWidth={3} />
                </button>
              </div>
            )}
          </div>

          <div className="slot-panel slot-panel-win" aria-live="polite">
            <span className="slot-panel-label">WIN</span>
            <span key={winKey} className={`slot-panel-value ${showWin > 0 ? "slot-win-rise" : ""}`}>
              {fmt(displayedWin)} <small>GEL</small>
            </span>
          </div>

          <button type="button" className="slot-btn slot-btn-max" onClick={maxBet} disabled={busy}>
            MAX
            <br />
            BET
          </button>

          <button
            type="button"
            className={`slot-btn slot-btn-spin ${auto ? "is-auto" : ""} ${busy ? "is-busy" : ""}`}
            onPointerDown={onSpinDown}
            onPointerUp={onSpinUp}
            onPointerLeave={() => {
              if (holdTimer.current) window.clearTimeout(holdTimer.current);
              holdTimer.current = null;
            }}
            onContextMenu={(e) => e.preventDefault()}
            disabled={busy && !auto}
          >
            <RefreshCw className={`h-6 w-6 ${busy ? "animate-spin" : ""}`} />
            <span>
              <b>{auto ? "STOP" : "SPIN"}</b>
              <small>{auto ? "AUTO PLAY ON" : "HOLD FOR AUTO"}</small>
            </span>
          </button>

          <button
            type="button"
            className={`slot-btn slot-btn-auto ${auto ? "is-on" : ""}`}
            onClick={() => {
              sound(auto ? 400 : 640, 0.08);
              setAuto((a) => !a);
            }}
          >
            AUTO
            <br />
            PLAY
          </button>
        </section>

        <footer className="slot-footer">
          <span className="slot-footer-text">
            {busy ? "SPINNING…" : showWin > 0 ? `YOU WON ${fmt(showWin)} GEL` : "GOOD LUCK!"}
          </span>
        </footer>
      </div>

      {/* ------------------------------------------------------------ info */}
      {infoOpen && (
        <div className="slot-modal-backdrop" role="dialog" aria-modal="true" aria-label="Game info">
          <div className="slot-modal">
            <header>
              <h2 className="font-display text-gold-gradient">COBRA SLOTS 25 — 20 BURNING HOT</h2>
              <button type="button" aria-label="Close" onClick={() => setInfoOpen(false)}>
                <X className="h-5 w-5" />
              </button>
            </header>
            <div className="slot-modal-body">
              <p>
                5 reels · 3 rows · <b>{LINES} fixed paylines</b>. All pays are for combinations of
                a kind, left to right on adjacent reels beginning with the leftmost reel, except
                for Scatters. Line wins are multiplied by the bet on the winning line (total bet ÷{" "}
                {LINES}); scatter wins are multiplied by the total bet and added to the line wins.
                Only the highest win per line is paid; simultaneous wins on different lines are
                added.
              </p>
              <p>
                <b>Clover Wild</b> appears on reels 2, 3 and 4 only and substitutes for all symbols
                except the Scatters. A Clover taking part in a winning combination expands over the
                whole reel, and winnings are paid after the expansion.
              </p>
              <p>
                <b>Star Scatter</b> appears on reels 1, 3 and 5 only — 3 Stars anywhere pay{" "}
                {STAR_PAY[3]}× the total bet. <b>Dollar Scatter</b> appears on all reels — 3/4/5
                anywhere pay {DOLLAR_PAY[3]}× / {DOLLAR_PAY[4]}× / {DOLLAR_PAY[5]}× the total bet.
              </p>
              <p>
                <b>Max Bet</b> wagers your whole balance (up to {BET_MAX} GEL). Hold <b>SPIN</b> or
                press <b>AUTO PLAY</b> for automatic spins. Theoretical RTP ≈ 95.88%.
              </p>
              <table className="slot-paytable">
                <thead>
                  <tr>
                    <th>Symbol</th>
                    <th>2×</th>
                    <th>3×</th>
                    <th>4×</th>
                    <th>5×</th>
                  </tr>
                </thead>
                <tbody>
                  {(Object.keys(PAYTABLE) as LineSymbolId[]).map((s) => (
                    <tr key={s}>
                      <td>
                        <img src={IMG[s]} alt={NAMES[s]} /> {NAMES[s]}
                      </td>
                      {TOTAL_BET_PAYTABLE[s].map((m, i) => (
                        <td key={i}>{m ? `${m}× bet` : "—"}</td>
                      ))}
                    </tr>
                  ))}
                  <tr>
                    <td>
                      <img src={IMG.star} alt="Star" /> Star (Scatter)
                    </td>
                    <td>—</td>
                    <td>{STAR_PAY[3]}× bet</td>
                    <td>—</td>
                    <td>—</td>
                  </tr>
                  <tr>
                    <td>
                      <img src={IMG.dollar} alt="Dollar" /> Dollar (Scatter)
                    </td>
                    <td>—</td>
                    <td>{DOLLAR_PAY[3]}× bet</td>
                    <td>{DOLLAR_PAY[4]}× bet</td>
                    <td>{DOLLAR_PAY[5]}× bet</td>
                  </tr>
                  <tr>
                    <td>
                      <img src={IMG.clover} alt="Clover" /> Clover (Wild)
                    </td>
                    <td colSpan={4}>
                      Reels 2-3-4 · substitutes all except Scatters · expands over the whole reel
                      with a burning animation
                    </td>
                  </tr>
                </tbody>
              </table>
              <p className="slot-modal-note">
                All multipliers shown above apply to the TOTAL bet (line pays are the same win
                expressed as line bet × 20).
              </p>
            </div>
          </div>
        </div>
      )}

      {depositOpen && (
        <DepositDialog
          userId={user.id}
          username={user.username}
          onClose={() => setDepositOpen(false)}
          onSubmitted={() => void refreshBalance()}
        />
      )}
    </main>
  );
}
