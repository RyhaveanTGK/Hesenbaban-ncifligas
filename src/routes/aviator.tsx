import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Minus, Plus, LineChart, Layers, User as UserIcon } from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/AppShell";
import { useAuthUser } from "@/lib/session";
import {
  AVIATOR_BET_MAX,
  AVIATOR_BET_MIN,
  cashOutAviator,
  getAviatorBalance,
  getAviatorState,
  placeAviatorBet,
  type AviatorState,
} from "@/lib/aviator.functions";
import planeImg from "@/assets/aviator-plane.png";
import runwayImg from "@/assets/aviator-runway.jpg";

export const Route = createFileRoute("/aviator")({
  head: () => ({
    meta: [
      { title: "Cobra Avivator — Fly, Win, Repeat" },
      {
        name: "description",
        content:
          "Place your bet, watch the multiplier climb and cash out before the plane flies away in Cobra Avivator.",
      },
      { property: "og:title", content: "Cobra Avivator — Fly, Win, Repeat" },
      {
        property: "og:description",
        content:
          "Place your bet, watch the multiplier climb and cash out before the plane flies away in Cobra Avivator.",
      },
    ],
  }),
  component: AviatorPage,
});

const RATE = 0.06; // must match the server growth rate
const QUICK = [5, 10, 20, 50, 100];

/** Sound files are dropped into /public by the operator: 1..4.mp3 */
const SOUND = {
  countdown: "/1.mp3",
  explosion: "/2.mp3",
  music: "/3.mp3",
  flight: "/4.mp3",
} as const;

function chipClass(value: number) {
  if (value >= 4) return "border-fuchsia-500/50 bg-fuchsia-500/15 text-fuchsia-300";
  if (value >= 3) return "border-red-500/50 bg-red-500/15 text-red-400";
  if (value >= 2) return "border-emerald-500/50 bg-emerald-500/15 text-emerald-400";
  return "border-border/60 bg-card/70 text-foreground/80";
}

function AviatorPage() {
  const { user, ready } = useAuthUser();
  const userId = user?.id;

  const [state, setState] = useState<AviatorState | null>(null);
  const [balance, setBalance] = useState(0);
  const [bet, setBet] = useState(10);
  const [tick, setTick] = useState(() => Date.now());
  const [queued, setQueued] = useState(false);
  const [busy, setBusy] = useState(false);

  // client-side anchors derived from the server state
  const flyStartRef = useRef<number | null>(null);
  const roundRef = useRef<number>(-1);
  const audioRef = useRef<Record<string, HTMLAudioElement>>({});
  const playedRef = useRef<{ countdown: number; explosion: number }>({
    countdown: -1,
    explosion: -1,
  });

  useEffect(() => {
    if (user) setBalance(user.chipBalance);
  }, [user]);

  /* ---------------- audio ---------------- */
  useEffect(() => {
    if (typeof window === "undefined") return;
    const make = (src: string, loop = false, kind?: string) => {
      const a = new Audio(src);
      a.loop = loop;
      a.preload = "auto";
      if (kind) a.dataset["kind"] = kind;
      return a;
    };
    audioRef.current = {
      countdown: make(SOUND.countdown),
      explosion: make(SOUND.explosion),
      music: make(SOUND.music, true, "music"),
      flight: make(SOUND.flight, true),
    };
    const audios = audioRef.current;
    const start = () => void audios["music"]?.play().catch(() => {});
    window.addEventListener("pointerdown", start, { once: true });
    return () => {
      window.removeEventListener("pointerdown", start);
      Object.values(audios).forEach((a) => {
        a.pause();
        a.src = "";
      });
    };
  }, []);

  const play = useCallback((key: keyof typeof SOUND) => {
    const a = audioRef.current[key];
    if (!a) return;
    try {
      a.currentTime = 0;
      void a.play().catch(() => {});
    } catch {
      /* ignore */
    }
  }, []);

  const stop = useCallback((key: keyof typeof SOUND) => {
    const a = audioRef.current[key];
    if (!a) return;
    a.pause();
    try {
      a.currentTime = 0;
    } catch {
      /* ignore */
    }
  }, []);

  /* ---------------- server polling ---------------- */
  const refresh = useCallback(async () => {
    try {
      const next = await getAviatorState({ data: userId ? { userId } : {} });
      const clientNow = Date.now();
      if (next.phase === "waiting") {
        flyStartRef.current = clientNow + next.countdownMs;
      } else {
        flyStartRef.current = clientNow - next.elapsedMs;
      }
      setState(next);
    } catch {
      /* transient network error — keep the last state */
    }
  }, [userId]);

  useEffect(() => {
    if (!ready) return;
    void refresh();
    const id = window.setInterval(() => void refresh(), 400);
    return () => window.clearInterval(id);
  }, [ready, refresh]);

  useEffect(() => {
    let raf = 0;
    const loop = () => {
      setTick(Date.now());
      raf = window.requestAnimationFrame(loop);
    };
    raf = window.requestAnimationFrame(loop);
    return () => window.cancelAnimationFrame(raf);
  }, []);

  /* ---------------- derived live values ---------------- */
  const phase = state?.phase ?? "waiting";
  const flyStart = flyStartRef.current;

  const elapsedMs =
    phase === "crashed"
      ? (state?.elapsedMs ?? 0)
      : flyStart != null && tick > flyStart
        ? tick - flyStart
        : 0;

  const multiplier =
    phase === "crashed"
      ? (state?.crash ?? 1)
      : phase === "flying"
        ? Math.exp(RATE * (elapsedMs / 1000))
        : 1;

  const countdownMs = flyStart != null ? Math.max(0, flyStart - tick) : 5000;
  const countdownSeconds = Math.max(1, Math.ceil(countdownMs / 1000));
  const countdownProgress = Math.min(1, Math.max(0, countdownMs / 5000));

  const myBet = state?.bet ?? null;
  const cashedOut = myBet?.cashedOut ?? false;

  /* round transitions: sounds + queued bet */
  useEffect(() => {
    if (!state) return;
    if (state.roundId !== roundRef.current) {
      roundRef.current = state.roundId;
      playedRef.current = { countdown: -1, explosion: -1 };
    }
    if (phase === "waiting" && playedRef.current.countdown !== state.roundId) {
      playedRef.current.countdown = state.roundId;
      stop("flight");
      play("countdown");
    }
    if (phase === "flying") {
      const a = audioRef.current["flight"];
      if (a && a.paused) void a.play().catch(() => {});
    }
    if (phase === "crashed" && playedRef.current.explosion !== state.roundId) {
      playedRef.current.explosion = state.roundId;
      stop("flight");
      play("explosion");
    }
  }, [state, phase, play, stop]);

  /* place a queued bet as soon as a new betting window opens */
  const placeBet = useCallback(
    async (amount: number) => {
      if (!userId) return;
      setBusy(true);
      const res = await placeAviatorBet({ data: { userId, amount } });
      setBusy(false);
      if (!res.ok) {
        toast.error(res.error);
        return false;
      }
      setBalance(res.balance);
      void refresh();
      toast.success(`Bet placed: ${amount.toFixed(2)} GEL`);
      return true;
    },
    [userId, refresh],
  );

  useEffect(() => {
    if (!queued || !userId) return;
    if (phase !== "waiting" || myBet) return;
    setQueued(false);
    void placeBet(bet);
  }, [queued, phase, myBet, bet, userId, placeBet]);

  const onCashOut = useCallback(async () => {
    if (!userId) return;
    setBusy(true);
    const res = await cashOutAviator({ data: { userId } });
    setBusy(false);
    if (!res.ok) {
      toast.error(res.error);
      void refresh();
      return;
    }
    setBalance(res.balance);
    toast.success(`Cashed out ${res.payout.toFixed(2)} GEL at ${res.multiplier.toFixed(2)}x`);
    void refresh();
  }, [userId, refresh]);

  /* keep the balance in sync after losses */
  useEffect(() => {
    if (!userId || phase !== "crashed") return;
    void getAviatorBalance({ data: { userId } }).then((r) => setBalance(r.balance));
  }, [userId, phase]);

  /* ---------------- chart geometry ---------------- */
  const yMax = useMemo(() => {
    const m = Math.max(multiplier, 1);
    if (m <= 4) return 4;
    return Math.ceil(m * 1.05 * 2) / 2;
  }, [multiplier]);

  const xMaxSec = useMemo(() => {
    const s = elapsedMs / 1000;
    return s <= 30 ? 30 : Math.ceil(s / 10) * 10;
  }, [elapsedMs]);

  const W = 320;
  const H = 210;
  const PAD_L = 4;
  const PAD_B = 4;

  const pointAt = useCallback(
    (seconds: number) => {
      const m = Math.exp(RATE * seconds);
      const x = PAD_L + (seconds / xMaxSec) * (W - PAD_L);
      const y = H - PAD_B - ((m - 1) / (yMax - 1)) * (H - PAD_B);
      return { x, y: Math.max(2, y) };
    },
    [xMaxSec, yMax],
  );

  const curve = useMemo(() => {
    const total = elapsedMs / 1000;
    const steps = 48;
    let d = "";
    for (let i = 0; i <= steps; i++) {
      const t = (total * i) / steps;
      const p = pointAt(t);
      d += `${i === 0 ? "M" : "L"}${p.x.toFixed(2)},${p.y.toFixed(2)} `;
    }
    return d.trim();
  }, [elapsedMs, pointAt]);

  const head = pointAt(elapsedMs / 1000);
  const dots = useMemo(() => {
    const total = elapsedMs / 1000;
    const out: { x: number; y: number }[] = [];
    for (let t = 3; t < total; t += 3) out.push(pointAt(t));
    return out;
  }, [elapsedMs, pointAt]);

  const yLabels = useMemo(() => {
    const out: number[] = [];
    const step = (yMax - 1) / 6;
    for (let i = 6; i >= 0; i--) out.push(1 + step * i);
    return out;
  }, [yMax]);

  if (!ready || !user) return null;

  const canBet = phase === "waiting" && !myBet;
  const canCash = phase === "flying" && !!myBet && !cashedOut;

  return (
    <AppShell>
      {/* ---------- round history ---------- */}
      <div className="flex items-center gap-2">
        <div className="scrollbar-none flex flex-1 gap-2 overflow-x-auto">
          {(state?.history.length ? state.history : [1.23, 2.45, 1.11, 3.67, 1.89]).map(
            (h, i) => (
              <span
                key={`${h}-${i}`}
                className={`shrink-0 rounded-lg border px-3 py-1.5 text-xs font-semibold ${chipClass(h)}`}
              >
                {h.toFixed(2)}x
              </span>
            ),
          )}
        </div>
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-border/60 bg-card/70">
          <LineChart className="h-4 w-4 text-foreground/80" />
        </span>
      </div>

      {/* ---------- stage ---------- */}
      <section className="relative mt-3 h-[280px] overflow-hidden rounded-2xl border border-border/50 bg-black">
        {phase === "waiting" ? (
          <div className="relative h-full w-full">
            <img
              src={runwayImg}
              alt="Cobra Avivator runway"
              width={1024}
              height={1024}
              className="h-full w-full object-cover opacity-90"
            />
            <div className="absolute inset-0 bg-gradient-to-b from-black/70 via-transparent to-black/70" />
            <div className="absolute inset-x-0 top-4 flex flex-col items-center">
              <p className="text-sm font-semibold tracking-[0.2em] text-foreground/90">
                NEXT ROUND IN
              </p>
              <div className="relative mt-3 h-32 w-32">
                <svg viewBox="0 0 100 100" className="h-full w-full -rotate-90">
                  <circle cx="50" cy="50" r="44" className="fill-none stroke-red-900/60" strokeWidth="7" />
                  <circle
                    cx="50"
                    cy="50"
                    r="44"
                    className="fill-none stroke-red-500"
                    strokeWidth="7"
                    strokeLinecap="round"
                    strokeDasharray={2 * Math.PI * 44}
                    strokeDashoffset={2 * Math.PI * 44 * (1 - countdownProgress)}
                    style={{ filter: "drop-shadow(0 0 6px rgb(239 68 68))" }}
                  />
                </svg>
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                  <span className="text-5xl font-bold text-foreground">{countdownSeconds}</span>
                  <span className="text-[10px] tracking-widest text-foreground/70">SECONDS</span>
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="relative h-full w-full p-2">
            <div className="absolute inset-0 opacity-30 [background-image:linear-gradient(rgba(239,68,68,.25)_1px,transparent_1px),linear-gradient(90deg,rgba(239,68,68,.25)_1px,transparent_1px)] [background-size:40px_35px]" />

            {/* y axis labels */}
            <div className="absolute inset-y-2 left-2 flex w-10 flex-col justify-between text-[10px] text-foreground/70">
              {yLabels.map((v, i) => (
                <span key={i}>{v.toFixed(2)}x</span>
              ))}
            </div>
            {/* x axis labels */}
            <div className="absolute inset-x-12 bottom-1 flex justify-between text-[10px] text-foreground/70">
              <span>0s</span>
              <span>{Math.round(xMaxSec / 3)}s</span>
              <span>{Math.round((xMaxSec * 2) / 3)}s</span>
              <span>{xMaxSec}s</span>
            </div>

            <div className="absolute inset-y-2 left-12 right-2 bottom-6">
              <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="h-full w-full">
                <path
                  d={curve}
                  fill="none"
                  stroke="rgb(239 68 68)"
                  strokeWidth="2"
                  strokeLinecap="round"
                  style={{ filter: "drop-shadow(0 0 4px rgb(239 68 68))" }}
                />
                {dots.map((p, i) => (
                  <circle key={i} cx={p.x} cy={p.y} r="2.5" fill="rgb(248 113 113)" />
                ))}
              </svg>

              {/* plane / explosion */}
              <div
                className="pointer-events-none absolute"
                style={{
                  left: `${(head.x / W) * 100}%`,
                  top: `${(head.y / H) * 100}%`,
                  transform: "translate(-40%, -60%)",
                }}
              >
                {phase === "crashed" ? (
                  <span className="block h-16 w-16 animate-[aviator-boom_.6s_ease-out_forwards] rounded-full bg-[radial-gradient(circle,rgba(255,196,80,.95),rgba(239,68,68,.7)_45%,transparent_70%)]" />
                ) : (
                  <img
                    src={planeImg}
                    alt="Avivator plane"
                    width={512}
                    height={512}
                    className="h-16 w-16 animate-[aviator-hover_1.1s_ease-in-out_infinite] object-contain drop-shadow-[0_0_10px_rgba(239,68,68,.8)]"
                  />
                )}
              </div>
            </div>

            {/* multiplier */}
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
              <span
                className={`text-5xl font-extrabold tabular-nums text-red-500 drop-shadow-[0_0_14px_rgba(239,68,68,.6)] ${
                  phase === "crashed" ? "animate-[aviator-shake_.4s_ease-out]" : ""
                }`}
              >
                {multiplier.toFixed(2)}x
              </span>
            </div>

            {phase === "crashed" && (
              <div className="absolute inset-x-0 bottom-8 text-center text-sm font-bold tracking-widest text-red-400">
                FLEW AWAY!
              </div>
            )}
          </div>
        )}
      </section>

      {/* ---------- bet panel ---------- */}
      <section className="mt-3 rounded-2xl border border-border/50 bg-card/60 p-3">
        <p className="text-center text-[11px] tracking-[0.2em] text-muted-foreground">BET</p>
        <div className="mt-2 flex items-center justify-between rounded-xl border border-border/60 bg-background/60 px-2 py-2">
          <button
            type="button"
            aria-label="Decrease bet"
            onClick={() => setBet((v) => Math.max(AVIATOR_BET_MIN, Number((v - 1).toFixed(2))))}
            className="flex h-9 w-9 items-center justify-center rounded-lg border border-gold/50 text-gold"
          >
            <Minus className="h-4 w-4" />
          </button>
          <span className="text-lg font-semibold text-foreground">{bet.toFixed(2)} GEL</span>
          <button
            type="button"
            aria-label="Increase bet"
            onClick={() => setBet((v) => Math.min(AVIATOR_BET_MAX, Number((v + 1).toFixed(2))))}
            className="flex h-9 w-9 items-center justify-center rounded-lg border border-gold/50 text-gold"
          >
            <Plus className="h-4 w-4" />
          </button>
        </div>

        <div className="mt-2 grid grid-cols-5 gap-2">
          {QUICK.map((q) => (
            <button
              key={q}
              type="button"
              onClick={() => setBet(q)}
              className={`rounded-lg border py-2 text-xs ${
                bet === q
                  ? "border-gold/70 bg-gold/10 text-gold"
                  : "border-border/60 bg-background/50 text-foreground/80"
              }`}
            >
              {q.toFixed(2)}
            </button>
          ))}
        </div>

        <button
          type="button"
          disabled={busy || (!canBet && !canCash && !(phase !== "waiting" && !myBet))}
          onClick={() => {
            if (canCash) return void onCashOut();
            if (canBet) return void placeBet(bet);
            setQueued((q) => !q);
          }}
          className="mt-3 w-full rounded-xl border border-emerald-500/60 bg-gradient-to-b from-emerald-600 to-emerald-800 py-4 text-center text-lg font-bold leading-tight text-white shadow-[0_0_18px_rgba(16,185,129,.25)] disabled:opacity-60"
        >
          {canCash ? (
            <>
              CASH OUT
              <span className="block text-xl">
                {(myBet ? myBet.amount * multiplier : 0).toFixed(2)} GEL
              </span>
            </>
          ) : cashedOut && myBet ? (
            <>
              CASHED OUT
              <span className="block text-xl">{myBet.payout?.toFixed(2)} GEL</span>
            </>
          ) : canBet ? (
            <>
              BET
              <span className="block text-xl">{bet.toFixed(2)} GEL</span>
            </>
          ) : myBet ? (
            <>
              IN FLIGHT
              <span className="block text-xl">{myBet.amount.toFixed(2)} GEL</span>
            </>
          ) : queued ? (
            <>
              CANCEL
              <span className="block text-xl">NEXT ROUND BET</span>
            </>
          ) : (
            <>
              BET
              <span className="block text-xl">NEXT ROUND</span>
            </>
          )}
        </button>
        <p className="mt-2 text-center text-[10px] text-muted-foreground">
          Min {AVIATOR_BET_MIN.toFixed(2)} GEL — Max {AVIATOR_BET_MAX.toFixed(2)} GEL
        </p>
      </section>

      {/* ---------- balance / players ---------- */}
      <section className="mt-3 flex items-center rounded-2xl border border-border/50 bg-card/60 px-4 py-3">
        <div className="flex flex-1 items-center gap-3">
          <Layers className="h-5 w-5 text-muted-foreground" />
          <div>
            <p className="text-[10px] tracking-widest text-muted-foreground">BALANCE</p>
            <p className="text-sm font-semibold text-foreground">{balance.toFixed(2)} GEL</p>
          </div>
        </div>
        <span className="h-8 w-px bg-border/60" />
        <div className="flex flex-1 items-center justify-end gap-3">
          <UserIcon className="h-5 w-5 text-muted-foreground" />
          <div>
            <p className="text-[10px] tracking-widest text-muted-foreground">PLAYERS</p>
            <p className="text-sm font-semibold text-foreground">{state?.players ?? 0}</p>
          </div>
        </div>
      </section>
    </AppShell>
  );
}
