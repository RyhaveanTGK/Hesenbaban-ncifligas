import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  Coins,
  Info,
  Infinity as InfinityIcon,
  PlayCircle,
  RefreshCw,
  Volume2,
  VolumeX,
  X,
  Zap,
} from "lucide-react";
import { toast } from "sonner";
import { useAuthUser } from "@/lib/session";
import { playUiSound, useGameSettings } from "@/lib/game-settings";
import {
  SOUND_LINE_1X3,
  SOUND_REEL_STOP,
  SOUND_SPIN,
  playSound,
  symbolWinSound,
} from "@/lib/slots-sounds";
import { DepositDialog } from "@/components/DepositDialog";
import { getSlotsBalance, spinSlots } from "@/lib/slots.functions";
import {
  BET_STEPS,
  LINES,
  PAYTABLE,
  TOTAL_BET_PAYTABLE,
  REELS,
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
          "Cobra Slots 25: 5 reels, 20 fixed lines, expanding Clover Wild, Star and Dollar scatters, turbo spin and auto play.",
      },
      { property: "og:title", content: "Cobra Slots 25 — 20 Burning Hot" },
      {
        property: "og:description",
        content:
          "Cobra Slots 25: 5 reels, 20 fixed lines, expanding Clover Wild, Star and Dollar scatters, turbo spin and auto play.",
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

/** Every reel is stopped well inside 3 s (last reel: BASE + 4 × STAGGER). */
const SPIN_BASE_MS = 1180;
const SPIN_STAGGER_MS = 150;
/** Turbo spin — much shorter. */
const TURBO_BASE_MS = 420;
const TURBO_STAGGER_MS = 70;
const STRIP_LEN = 14;
/** Delay before the Clover Wild expands over its reel. */
const WILD_EXPAND_MS = 260;

const AUTO_COUNTS = [10, 20, 50, 100] as const;

const randomSymbol = (): SymbolId => SYMBOLS[Math.floor(Math.random() * SYMBOLS.length)]!;
const fmt = (n: number) => n.toFixed(2);
const betLabel = (n: number) =>
  n >= 100 ? new Intl.NumberFormat("en-US").format(n).replace(",", " ") : n.toFixed(2);

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
  const [betIdx, setBetIdx] = useState(0); // 0.20 GEL
  const [betOpen, setBetOpen] = useState(false);
  const [autoOpen, setAutoOpen] = useState(false);
  const [grid, setGrid] = useState<Grid>(INITIAL_GRID);
  const [spinningReels, setSpinningReels] = useState<boolean[]>(Array(REELS).fill(false));
  const [result, setResult] = useState<SpinResult | null>(null);
  const [wildReels, setWildReels] = useState<number[]>([]);
  const [showWin, setShowWin] = useState(0);
  const [lastWin, setLastWin] = useState(0);
  const [winKey, setWinKey] = useState(0);
  const [burst, setBurst] = useState(false);
  const [busy, setBusy] = useState(false);
  const [auto, setAuto] = useState(false);
  const [autoLeft, setAutoLeft] = useState(0);
  const [turbo, setTurbo] = useState(false);
  const [infoOpen, setInfoOpen] = useState(false);
  const [depositOpen, setDepositOpen] = useState(false);
  const [strips, setStrips] = useState<SymbolId[][]>([]);
  const [message, setMessage] = useState("");

  const settingsRef = useRef(true);
  const autoRef = useRef(false);
  const autoLeftRef = useRef(0);
  const busyRef = useRef(false);
  const turboRef = useRef(false);
  const holdTimer = useRef<number | null>(null);
  const heldRef = useRef(false);

  const bet = BET_STEPS[betIdx]!;
  const displayedWin = useCountUp(showWin);

  useEffect(() => {
    turboRef.current = turbo;
  }, [turbo]);

  useEffect(() => {
    settingsRef.current = settings.soundEffects;
  }, [settings.soundEffects]);

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

  const stopAuto = useCallback(() => {
    autoRef.current = false;
    autoLeftRef.current = 0;
    setAuto(false);
    setAutoLeft(0);
  }, []);

  /* ------------------------------------------------------------- one spin */
  const doSpin = useCallback(
    async (wager: number): Promise<boolean> => {
      if (!user || busyRef.current) return false;
      busyRef.current = true;
      setBusy(true);
      setResult(null);
      setWildReels([]);
      setBurst(false);
      setShowWin(0);
      setBetOpen(false);
      setAutoOpen(false);
      setMessage("");

      const res = await spinSlots({ data: { userId: user.id, bet: wager } });
      if (!res.ok) {
        setMessage(res.error.toUpperCase());
        toast.error(res.error);
        busyRef.current = false;
        setBusy(false);
        return false;
      }

      // balance after the bet is taken (win is credited when reels stop)
      setBalance(Math.max(0, res.balance - res.result.totalWin));
      setStrips(
        res.strips?.length === REELS
          ? res.strips.map((s) => [...s])
          : Array.from({ length: REELS }, () => Array.from({ length: STRIP_LEN }, randomSymbol)),
      );
      setSpinningReels(Array(REELS).fill(true));
      playSound(SOUND_SPIN, settingsRef.current);
      sound(420, 0.12);

      const base = turboRef.current ? TURBO_BASE_MS : SPIN_BASE_MS;
      const stagger = turboRef.current ? TURBO_STAGGER_MS : SPIN_STAGGER_MS;

      await new Promise<void>((resolve) => {
        for (let reel = 0; reel < REELS; reel++) {
          window.setTimeout(() => {
            // land the PRE-expansion grid, so a single Clover is shown first
            setGrid((g) => {
              const next = g.map((c) => [...c]) as Grid;
              next[reel] = [...res.result.baseGrid[reel]!];
              return next;
            });
            setSpinningReels((s) => {
              const n = [...s];
              n[reel] = false;
              return n;
            });
            playSound(SOUND_REEL_STOP, settingsRef.current);
            sound(300 + reel * 40, 0.05);
            if (reel === REELS - 1) resolve();
          }, base + reel * stagger);
        }
      });

      // the Clover Wild now grows over its whole reel, animated
      if (res.result.expandedReels.length > 0) {
        await new Promise((r) => window.setTimeout(r, WILD_EXPAND_MS));
        setGrid(res.result.grid.map((c) => [...c]) as Grid);
        setWildReels([...res.result.expandedReels]);
        sound(560, 0.16);
        await new Promise((r) => window.setTimeout(r, 420));
      }

      setResult(res.result);
      if (res.result.totalWin > 0) {
        const soundsOn = settingsRef.current;
        // per-symbol win sounds (3 & 4 of a kind share one file, 5 has its own)
        const best = new Map<string, number>();
        res.result.lineWins.forEach((w) => {
          best.set(w.symbol, Math.max(best.get(w.symbol) ?? 0, w.count));
        });
        best.forEach((count, symbol) => {
          playSound(symbolWinSound(symbol as SymbolId, count), soundsOn);
        });
        res.result.scatters.forEach((sc) => {
          playSound(symbolWinSound(sc.symbol, sc.count), soundsOn);
        });
        // a completed 1x3 line has its own sound slot
        if (res.result.lineWins.some((w) => w.count === 3)) {
          playSound(SOUND_LINE_1X3, soundsOn);
        }

        const scatterOnly = res.result.lineWins.length === 0 && res.result.scatters.length > 0;
        setWinKey((k) => k + 1);
        setLastWin(res.result.totalWin);
        setBalance(res.balance);
        // Star / Dollar scatter wins are paid silently — nothing is written on screen.
        if (!scatterOnly) {
          setShowWin(res.result.totalWin);
          setMessage(`YOU WON ${fmt(res.result.totalWin)} GEL`);
          [0, 100, 200].forEach((d, i) => window.setTimeout(() => sound(660 + i * 110, 0.08), d));
        }
        await new Promise((r) => window.setTimeout(r, turboRef.current ? 600 : 1200));
      } else {
        setLastWin(0);
        setBalance(res.balance);
        await new Promise((r) => window.setTimeout(r, turboRef.current ? 120 : 250));
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
          stopAuto();
          break;
        }
        if (autoLeftRef.current > 0) {
          autoLeftRef.current -= 1;
          setAutoLeft(autoLeftRef.current);
          if (autoLeftRef.current === 0) {
            stopAuto();
            break;
          }
        }
        await new Promise((r) => window.setTimeout(r, turboRef.current ? 150 : 500));
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [auto]);

  const startAuto = (count: number | "infinite") => {
    sound(620, 0.08);
    setAutoOpen(false);
    autoLeftRef.current = count === "infinite" ? 0 : count;
    setAutoLeft(count === "infinite" ? 0 : count);
    setAuto(true);
  };

  /* -------------------------------------------------- spin button gestures */
  const onSpinDown = () => {
    heldRef.current = false;
    holdTimer.current = window.setTimeout(() => {
      heldRef.current = true;
      sound(760, 0.1);
      setTurbo(true);
      turboRef.current = true;
      if (!busyRef.current) void doSpin(bet);
    }, 500);
  };
  const onSpinUp = () => {
    if (holdTimer.current) window.clearTimeout(holdTimer.current);
    holdTimer.current = null;
    if (heldRef.current) {
      setTurbo(false);
      turboRef.current = false;
      return;
    }
    if (auto) {
      stopAuto();
      return;
    }
    void doSpin(bet);
  };

  const winningCells = useMemo(() => {
    const set = new Set<string>();
    result?.lineWins.forEach((w) => w.cells.forEach(([r, c]) => set.add(`${r}-${c}`)));
    result?.scatters.forEach((sc) => sc.cells.forEach(([r, c]) => set.add(`${r}-${c}`)));
    return set;
  }, [result]);

  const expandedReels = useMemo(() => new Set<number>(wildReels), [wildReels]);

  const scatterCells = useMemo(() => {
    const set = new Set<string>();
    result?.scatters.forEach((sc) => sc.cells.forEach(([r, c]) => set.add(`${r}-${c}`)));
    return set;
  }, [result]);

  if (!ready || !user) return null;

  return (
    <main className="slot-page">
      <div className="slot-stage">
        {/* --------------------------------------------------------- top bar */}
        <div className="slot-topbar">
          <button
            type="button"
            aria-label="Exit game"
            className="slot-round-sm"
            onClick={() => {
              stopAuto();
              void navigate({ to: "/dashboard" });
            }}
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
          <span className="slot-title">COBRA SLOTS 25</span>
          <button
            type="button"
            aria-label="Deposit"
            className="slot-round-sm slot-round-coin"
            onClick={() => setDepositOpen(true)}
          >
            <Coins className="h-5 w-5" />
          </button>
        </div>

        {/* ------------------------------------------------ frame + reels */}
        <section className="slot-frame" aria-label="Cobra Slots reels">
          <img src={frameImg} alt="" className="slot-frame-img" draggable={false} />
          <div className="slot-logo-shine" aria-hidden="true" />

          {/* reels */}
          <div className="slot-reels">
            {grid.map((col, reel) => {
              const spinning = spinningReels[reel];
              const wildReel = !spinning && expandedReels.has(reel);
              return (
                <div
                  key={reel}
                  className={`slot-reel ${spinning ? "is-spinning" : "is-stopped"} ${
                    wildReel ? "is-wild-reel" : ""
                  }`}
                >
                  {wildReel && (
                    <span className="slot-wild-flames" aria-hidden="true">
                      {Array.from({ length: 9 }, (_, i) => (
                        <i key={i} style={{ ["--i" as string]: i }} />
                      ))}
                      <b className="slot-wild-label">WILD</b>
                    </span>
                  )}
                  {spinning ? (
                    <div className={`slot-strip ${turbo ? "is-turbo" : ""}`}>
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
                          } ${wildReel ? "is-wild-open" : ""} ${
                            result && !win && !wildReel ? "is-dim" : ""
                          }`}
                          style={{ animationDelay: `${row * (wildReel ? 110 : 40)}ms` }}
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

        </section>

        {/* ------------------------------------------------------ controls */}
        <section className="slot-hud" aria-label="Controls">
          <div className="slot-hud-top">
            <div className="slot-hud-stat">
              <span className="slot-hud-key">BALANCE:</span>
              <b>{fmt(balance)}</b>
              <span className="slot-hud-cur">GEL</span>
            </div>
            <div className="slot-hud-msg" role="status" aria-live="polite">
              {busy ? "" : message}
            </div>
            <div className="slot-hud-stat slot-hud-stat-right">
              <span className="slot-hud-key">LAST WIN:</span>
              <b key={winKey} className={showWin > 0 ? "slot-win-rise" : ""}>
                {fmt(showWin > 0 ? displayedWin : lastWin)}
              </b>
              <span className="slot-hud-cur">GEL</span>
            </div>
          </div>

          {/* horizontally scrollable bet ladder */}
          <div className="slot-bet-rail" role="group" aria-label="Bet">
            {BET_STEPS.map((s, i) => (
              <button
                key={s}
                type="button"
                className={`slot-chip ${i === betIdx ? "is-active" : ""}`}
                disabled={busy}
                onClick={() => {
                  sound(660, 0.05);
                  setBetIdx(i);
                }}
              >
                <span className="slot-chip-cur">GEL</span>
                <span className="slot-chip-val">{betLabel(s)}</span>
                <span className="slot-chip-bet">BET</span>
              </button>
            ))}
          </div>

          <div className="slot-actions">
            <div className="slot-action-slot">
              <button
                type="button"
                className={`slot-round slot-round-auto ${auto ? "is-on" : ""}`}
                aria-label="Auto play"
                onClick={() => {
                  sound(520, 0.06);
                  if (auto) {
                    stopAuto();
                    return;
                  }
                  setAutoOpen((o) => !o);
                }}
              >
                <PlayCircle className="h-7 w-7" />
                {autoLeft > 0 && <i className="slot-auto-count">{autoLeft}</i>}
              </button>

              {autoOpen && (
                <div className="slot-auto-panel" role="group" aria-label="Auto play options">
                  {AUTO_COUNTS.map((c) => (
                    <button key={c} type="button" onClick={() => startAuto(c)}>
                      {c}
                    </button>
                  ))}
                  <button type="button" aria-label="Infinite auto play" onClick={() => startAuto("infinite")}>
                    <InfinityIcon className="h-4 w-4" strokeWidth={3} />
                  </button>
                  <button
                    type="button"
                    aria-label="Turbo spin"
                    className={turbo ? "is-on" : ""}
                    onClick={() => {
                      sound(780, 0.08);
                      setTurbo((t) => !t);
                    }}
                  >
                    <Zap className="h-4 w-4" strokeWidth={3} />
                  </button>
                </div>
              )}
            </div>

            <button
              type="button"
              className={`slot-spin ${busy ? "is-busy" : ""} ${auto ? "is-auto" : ""}`}
              onPointerDown={onSpinDown}
              onPointerUp={onSpinUp}
              onPointerLeave={() => {
                if (holdTimer.current) window.clearTimeout(holdTimer.current);
                holdTimer.current = null;
              }}
              onContextMenu={(e) => e.preventDefault()}
              disabled={busy && !auto}
              aria-label={auto ? "Stop auto play" : "Spin"}
            >
              <svg className="slot-spin-arc" viewBox="0 0 120 120" aria-hidden="true">
                <path id="slot-arc-path" d="M12,68 A48,48 0 0 1 108,68" fill="none" />
                <text>
                  <textPath href="#slot-arc-path" startOffset="50%" textAnchor="middle" textLength="145" lengthAdjust="spacingAndGlyphs">
                    HOLD FOR TURBO SPIN
                  </textPath>
                </text>
              </svg>
              <RefreshCw className={`slot-spin-icon ${busy ? "is-spinning" : ""}`} strokeWidth={3} />
            </button>

            <button
              type="button"
              className="slot-round slot-round-bet"
              aria-label="Bet options"
              onClick={() => {
                sound(600, 0.05);
                setBetOpen(true);
              }}
            >
              <Coins className="h-7 w-7" />
            </button>
          </div>

          <div className="slot-hud-bottom">
            <button
              type="button"
              className="slot-round-sm"
              aria-label="Game info"
              onClick={() => setInfoOpen(true)}
            >
              <Info className="h-5 w-5" />
            </button>
            <button
              type="button"
              className="slot-round-sm"
              aria-label={settings.soundEffects ? "Mute" : "Unmute"}
              onClick={() => update({ soundEffects: !settings.soundEffects })}
            >
              {settings.soundEffects ? (
                <Volume2 className="h-5 w-5" />
              ) : (
                <VolumeX className="h-5 w-5" />
              )}
            </button>
          </div>
        </section>
      </div>

      {/* ------------------------------------------------------ bet options */}
      {betOpen && (
        <div
          className="slot-modal-backdrop is-center"
          role="dialog"
          aria-modal="true"
          aria-label="Bet options"
          onClick={() => setBetOpen(false)}
        >
          <div className="slot-modal slot-bet-modal" onClick={(e) => e.stopPropagation()}>
            <header>
              <h2>BET OPTIONS</h2>
              <button type="button" aria-label="Close" onClick={() => setBetOpen(false)}>
                <X className="h-5 w-5" />
              </button>
            </header>
            <div className="slot-bet-grid">
              {BET_STEPS.map((s, i) => (
                <button
                  key={s}
                  type="button"
                  className={`slot-chip slot-chip-lg ${i === betIdx ? "is-active" : ""}`}
                  onClick={() => {
                    sound(680, 0.05);
                    setBetIdx(i);
                    setBetOpen(false);
                  }}
                >
                  <span className="slot-chip-cur">GEL</span>
                  <span className="slot-chip-val">{betLabel(s)}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

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
                5 reels · 3 rows · <b>{LINES} fixed paylines</b>. All pays are for combinations of a
                kind, left to right on adjacent reels beginning with the leftmost reel, except for
                Scatters. Line wins are multiplied by the bet on the winning line (total bet ÷{" "}
                {LINES}); scatter wins are multiplied by the total bet and added to the line wins.
                Only the highest win per line is paid; simultaneous wins on different lines are
                added.
              </p>
              <p>
                <b>Clover Wild</b> appears on reels 2, 3 and 4 only and substitutes for all symbols
                except the Scatters. A Clover taking part in a winning combination lands as a single
                symbol first and then expands over the whole reel with an animation; winnings are
                paid after the expansion.
              </p>
              <p>
                <b>Star Scatter</b> appears on reels 1, 3 and 5 only — 3 Stars anywhere pay{" "}
                {STAR_PAY[3]}× the total bet. <b>Dollar Scatter</b> appears on all reels — 3/4/5
                anywhere pay {DOLLAR_PAY[3]}× / {DOLLAR_PAY[4]}× / {DOLLAR_PAY[5]}× the total bet.
              </p>
              <p>
                Pick your bet from the bet rail or the <b>BET OPTIONS</b> panel. Hold <b>SPIN</b> for
                a turbo spin, or use the <b>AUTO PLAY</b> button for 10 / 20 / 50 / 100 / ∞ spins.
                Theoretical RTP ≈ 95.88%.
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
