import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  Menu,
  MessageSquare,
  Spade,
  Users,
  User,
  History,
  BarChart3,
  Send,
} from "lucide-react";
import logo from "@/assets/cobra-logo.png";
import pokerBg from "@/assets/poker-bg.jpg";
import blackjackTableAsset from "@/assets/cobra-blackjack-table.png.asset.json";
import { useAuthUser } from "@/lib/session";
import { playUiSound } from "@/lib/game-settings";
import {
  BJ_BET_MAX,
  BJ_BET_MIN,
  BJ_MAX_SEATS,
  blackjackAction,
  getBlackjackState,
  joinBlackjack,
  leaveBlackjack,
  placeBlackjackBet,
  sendBlackjackChat,
  type BlackjackState,
} from "@/lib/blackjack.functions";

export const Route = createFileRoute("/blackjack")({
  head: () => ({
    meta: [
      { title: "Cobra Blackjack — Live Table" },
      {
        name: "description",
        content:
          "Live multiplayer Cobra Blackjack: server-dealt cards, 2 to 6 players, 0.5 to 10 GEL bets and a shared pot.",
      },
      { property: "og:title", content: "Cobra Blackjack — Live Table" },
      {
        property: "og:description",
        content:
          "Live multiplayer Cobra Blackjack: server-dealt cards, 2 to 6 players, 0.5 to 10 GEL bets and a shared pot.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: BlackjackPage,
});

const NAV = [
  { to: "/dashboard", label: "Play", icon: Spade },
  { to: "/rooms", label: "Rooms", icon: Users },
  { to: "/profile", label: "Profile", icon: User },
  { to: "/history", label: "History", icon: History },
  { to: "/leaderboard", label: "Leaderboard", icon: BarChart3 },
] as const;

const SUIT_GLYPH: Record<string, string> = { S: "♠", H: "♥", D: "♦", C: "♣" };

/* ---------------------------------------------------------------- sounds */

function useTableSounds(state: BlackjackState | null) {
  const lastDeal = useRef(0);
  const lastPot = useRef(0);
  const lastCards = useRef(0);

  useEffect(() => {
    if (!state) return;
    if (state.dealtAt && state.dealtAt !== lastDeal.current) {
      lastDeal.current = state.dealtAt;
      // deal sound: a short run of card flicks
      [0, 120, 240, 360].forEach((delay, i) =>
        window.setTimeout(() => playUiSound(520 + i * 60, 0.05), delay),
      );
    }
    const cards = state.players.reduce(
      (sum, p) => sum + p.hands.reduce((s, h) => s + h.cardCount, 0),
      0,
    );
    if (cards > lastCards.current && state.phase === "turns") playUiSound(600, 0.05);
    lastCards.current = cards;

    if (state.pot > lastPot.current) playUiSound(880, 0.07); // bet / chip sound
    lastPot.current = state.pot;
  }, [state]);
}

/* ----------------------------------------------------------------- cards */

function PlayingCard({
  card,
  index,
  small,
}: {
  card: { rank: string; suit: string } | null;
  index: number;
  small?: boolean | undefined;
}) {
  const red = card?.suit === "H" || card?.suit === "D";
  const size = small ? "h-9 w-6 text-[9px]" : "h-12 w-8 text-[11px]";
  return (
    <div
      className={`bj-card bj-card-delay-${Math.min(index, 5)} ${size} ${card ? "" : "bj-card-back"}`}
    >
      {card ? (
        <span className={red ? "text-card-red" : "text-card-ink"}>
          <span className="block font-bold leading-none">{card.rank}</span>
          <span className="block leading-none">{SUIT_GLYPH[card.suit] ?? "♠"}</span>
        </span>
      ) : null}
    </div>
  );
}

function Hand({
  cards,
  count,
  small,
}: {
  cards: { rank: string; suit: string }[] | null;
  count: number;
  small?: boolean | undefined;
}) {
  const items = cards ?? Array.from({ length: count }, () => null);
  return (
    <div className="flex -space-x-2">
      {items.map((c, i) => (
        <PlayingCard key={i} card={c} index={i} small={small} />
      ))}
    </div>
  );
}

function Chip({ amount }: { amount: number }) {
  return <div className="bj-chip">{amount.toFixed(2).replace(/\.00$/, "")}</div>;
}

/* ------------------------------------------------------------------ page */

const TABLE_SEAT_POS = [
  "left-[13%] top-[58%]",
  "left-[27%] top-[68%]",
  "left-[43%] top-[73%]",
  "left-[63%] top-[73%]",
  "left-[79%] top-[68%]",
  "left-[87%] top-[58%]",
] as const;

function BlackjackPage() {
  const { user, ready } = useAuthUser();
  const [state, setState] = useState<BlackjackState | null>(null);
  const [bet, setBet] = useState(BJ_BET_MIN);
  const [notice, setNotice] = useState<string | null>(null);
  const [chatOpen, setChatOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const busy = useRef(false);

  useTableSounds(state);

  const refresh = useCallback(async () => {
    if (!user) return;
    try {
      const next = await getBlackjackState({
        data: { userId: user.id, username: user.username },
      });
      setState(next);
    } catch {
      /* transient network error, next poll retries */
    }
  }, [user]);

  /* join the table, poll live state, leave on unmount */
  useEffect(() => {
    if (!user) return;
    let alive = true;
    void (async () => {
      const res = await joinBlackjack({ data: { userId: user.id, username: user.username } });
      if (!alive) return;
      if (!res.ok) setNotice(res.error);
      await refresh();
    })();
    const timer = window.setInterval(() => void refresh(), 700);
    return () => {
      alive = false;
      window.clearInterval(timer);
      void leaveBlackjack({ data: { userId: user.id } });
    };
  }, [user, refresh]);

  const act = useCallback(
    async (action: "hit" | "stand" | "double" | "split") => {
      if (!user || busy.current) return;
      busy.current = true;
      playUiSound(action === "hit" ? 620 : 460, 0.06);
      const res = await blackjackAction({ data: { userId: user.id, action } });
      if (!res.ok && res.error) setNotice(res.error);
      await refresh();
      busy.current = false;
    },
    [user, refresh],
  );

  const doBet = useCallback(async () => {
    if (!user || busy.current) return;
    busy.current = true;
    playUiSound(900, 0.08);
    const res = await placeBlackjackBet({ data: { userId: user.id, amount: bet } });
    if (!res.ok && res.error) setNotice(res.error);
    await refresh();
    busy.current = false;
  }, [user, bet, refresh]);

  const send = useCallback(async () => {
    if (!user || !draft.trim()) return;
    const text = draft.trim();
    setDraft("");
    await sendBlackjackChat({ data: { userId: user.id, username: user.username, text } });
    await refresh();
  }, [user, draft, refresh]);

  useEffect(() => {
    if (!notice) return;
    const t = window.setTimeout(() => setNotice(null), 2600);
    return () => window.clearTimeout(t);
  }, [notice]);

  const seconds = state ? Math.ceil(state.phaseMs / 1000) : 0;
  const winner = state?.lastWinners[0];

  if (!ready || !user) return null;

  return (
    <div className="relative min-h-screen bg-background pb-24">
      <div aria-hidden="true" className="pointer-events-none fixed inset-0 z-0">
        <img src={pokerBg} alt="" className="h-full w-full object-cover opacity-40" />
        <div className="absolute inset-0 bg-background/80" />
      </div>

      <div className="relative z-10 mx-auto w-full max-w-md px-3">
        <header className="flex items-center justify-between py-3">
          <Link
            to="/dashboard"
            aria-label="Back"
            className="flex h-11 w-11 items-center justify-center rounded-xl border border-gold/40 bg-card/60"
          >
            <ArrowLeft className="h-5 w-5 text-foreground" />
          </Link>
          <div className="flex flex-col items-center">
            <img src={logo} alt="Cobra Blackjack" className="h-14 w-auto object-contain" />
            <span className="font-display text-[10px] tracking-[0.35em] text-gold">BLACKJACK</span>
          </div>
          <Link
            to="/profile"
            aria-label="Menu"
            className="flex h-11 w-11 items-center justify-center rounded-xl border border-gold/40 bg-card/60"
          >
            <Menu className="h-5 w-5 text-foreground" />
          </Link>
        </header>

        {/* table info */}
        <div className="flex items-start justify-between gap-2 text-[10px]">
          <div className="rounded-xl border border-gold/25 bg-card/70 px-3 py-2">
            <p className="text-foreground">Table ID: {state?.tableId ?? "BJ-784512"}</p>
            <p className="text-muted-foreground">2 - {BJ_MAX_SEATS} Players</p>
          </div>
          <div className="rounded-xl border border-gold/25 bg-card/70 px-3 py-2 text-right">
            <p className="text-foreground">Min Bet: {BJ_BET_MIN.toFixed(2)} GEL</p>
            <p className="text-foreground">Max Bet: {BJ_BET_MAX.toFixed(2)} GEL</p>
          </div>
        </div>

        {/* live table */}
        <div className="relative mt-3">
          <div className="absolute inset-x-0 top-0 flex items-center justify-between px-1">
            <span className="rounded-full border border-gold/40 bg-card/80 px-2.5 py-1 text-[11px] text-gold">
              {state?.seatsTaken ?? 0}/{BJ_MAX_SEATS}
            </span>
            <span className="rounded-full border border-gold/30 bg-card/80 px-2.5 py-1 text-[11px] text-foreground">
              Pot: {(state?.pot ?? 0).toFixed(2)} GEL
            </span>
          </div>

          <div className="bj-photo-table relative top-8 aspect-[3/2] w-full overflow-hidden">
            <img
              src={blackjackTableAsset.url}
              alt="Cobra Blackjack casino table with six player seats"
              className="absolute inset-0 h-full w-full object-cover"
            />

            {/* dealer cards arrive from the shoe at the upper-right */}
            <div className="bj-dealer-hand absolute left-1/2 top-[28%] -translate-x-1/2 text-center">
              <Hand cards={state?.dealer.cards ?? []} count={state?.dealer.cards.length ?? 0} />
              <span className="mt-1 inline-block rounded-full bg-table-overlay px-2 py-0.5 text-[10px] text-table-text">
                Dealer {state?.dealer.total ? state.dealer.total : "—"}
              </span>
            </div>

            <div className="absolute left-1/2 top-[49%] w-[58%] -translate-x-1/2 text-center">
              <p className="text-[10px] font-semibold text-table-text drop-shadow-md">
                {state?.phase === "waiting"
                  ? `Waiting for players (${state.seatsTaken}/2)`
                  : state
                    ? `${state.phase.toUpperCase()} · ${seconds}s`
                    : "Connecting…"}
              </p>
            </div>

            {state?.phase === "payout" ? (
              <div className="bj-winner-banner absolute left-1/2 top-[43%] z-30 -translate-x-1/2 text-center">
                <p className="font-display text-xs font-bold text-gold">ROUND RESULT</p>
                <p className="mt-0.5 text-[10px] font-semibold text-table-text">
                  {winner
                    ? `${state.lastWinners.map((item) => item.username).join(", ")} won ${winner.payout.toFixed(2)} GEL`
                    : "House wins · 30% refunded"}
                </p>
              </div>
            ) : null}

            {/* Live players are aligned to the six printed PLAYER positions. */}
            {state?.players.map((p) => (
              <div
                key={p.userId}
                className={`bj-seat bj-seat-${p.seat} absolute z-20 -translate-x-1/2 -translate-y-1/2 ${TABLE_SEAT_POS[p.seat] ?? TABLE_SEAT_POS[0]}`}
              >
                <div className="flex justify-center">
                  {p.hands.map((hand, handIndex) => (
                    <div
                      key={handIndex}
                      className={`rounded-lg p-0.5 ${p.isTurn && p.activeHand === handIndex ? "ring-2 ring-gold" : ""}`}
                    >
                      <Hand cards={hand.cards} count={hand.cardCount} small={!p.isSelf} />
                    </div>
                  ))}
                  {p.inRound ? (
                    <span className="ml-1 rounded-full bg-table-overlay px-1.5 py-0.5 text-[9px] font-bold text-table-text">
                      {h_total(p.hands)}
                    </span>
                  ) : null}
                </div>
                <div
                  className={`mx-auto mt-1 flex w-max items-center gap-1 rounded-full border px-1.5 py-0.5 shadow-lg ${
                    p.isTurn ? "border-gold bg-table-overlay-strong" : "border-table-line bg-table-overlay"
                  }`}
                >
                  <span className="flex h-6 w-6 items-center justify-center rounded-full bg-gold/20 text-[9px] font-bold text-gold">
                    {p.username.slice(0, 2).toUpperCase()}
                  </span>
                  <span className="max-w-16 truncate text-[9px] leading-tight text-table-text">
                    {p.isSelf ? "You" : p.username}
                    <span className="block text-gold">{p.balance.toFixed(2)} GEL</span>
                  </span>
                </div>
                {state.phase === "payout" && p.result ? (
                  <p className={`mt-0.5 text-center text-[9px] font-bold ${p.result === "lose" ? "text-danger" : "text-success"}`}>
                    {p.result === "lose" ? `−${p.bet.toFixed(2)}` : `+${p.payout.toFixed(2)}`} GEL
                  </p>
                ) : null}
                {p.bet > 0 ? <Chip amount={p.bet} /> : null}
              </div>
            ))}
          </div>
        </div>

        {/* bet controls */}
        {state?.you?.canBet ? (
          <div className="mt-3 rounded-2xl border border-gold/25 bg-card/70 p-3">
            <div className="flex items-center justify-between text-[11px] text-muted-foreground">
              <span>Your bet</span>
              <span className="text-gold">{seconds}s left</span>
            </div>
            <div className="mt-2 flex flex-wrap gap-2">
              {[0.5, 1, 2, 5, 10].map((v) => (
                <button
                  key={v}
                  onClick={() => setBet(v)}
                  className={`rounded-lg border px-3 py-1.5 text-[11px] font-bold ${
                    bet === v ? "border-gold bg-gold/20 text-gold" : "border-border/60 text-foreground"
                  }`}
                >
                  {v.toFixed(2)}
                </button>
              ))}
              <button
                onClick={() => void doBet()}
                className="ml-auto rounded-lg bg-gold-gradient px-4 py-1.5 text-[11px] font-bold text-primary-foreground"
              >
                BET {bet.toFixed(2)} GEL
              </button>
            </div>
          </div>
        ) : null}

        {/* action buttons */}
        <div className="mt-3 grid grid-cols-4 gap-2">
          <ActionButton
            label="DOUBLE"
            className="border-gold/60 text-gold"
            disabled={!state?.you?.canDouble}
            onClick={() => void act("double")}
          />
          <ActionButton
            label="HIT"
            className="border-emerald-500/60 bg-emerald-900/50 text-emerald-100"
            disabled={!state?.you?.canHit}
            onClick={() => void act("hit")}
          />
          <ActionButton
            label="STAND"
            className="border-red-500/60 bg-red-900/50 text-red-100"
            disabled={!state?.you?.canStand}
            onClick={() => void act("stand")}
          />
          <ActionButton
            label="SPLIT"
            className="border-sky-500/60 bg-sky-900/50 text-sky-100"
            disabled={!state?.you?.canSplit}
            onClick={() => void act("split")}
          />
        </div>

        <p className="mt-2 text-center text-[11px] text-muted-foreground">
          {notice ?? state?.you?.message ?? ""}
        </p>

        {/* chat — messages disappear after 15 seconds */}
        <div className="relative mt-3 min-h-[92px] rounded-2xl border border-gold/25 bg-card/70 p-3">
          <div className="space-y-1 pr-12">
            {state?.chat.length ? (
              state.chat.map((m) => (
                <p key={m.id} className="text-[11px] leading-tight">
                  <span className="text-gold">{m.username}:</span>{" "}
                  <span className="text-foreground/90">{m.text}</span>
                </p>
              ))
            ) : (
              <p className="text-[11px] text-muted-foreground">
                Table chat — messages vanish after 15 seconds
              </p>
            )}
          </div>
          <button
            onClick={() => setChatOpen((v) => !v)}
            aria-label="Toggle chat input"
            className="absolute bottom-3 right-3 flex h-9 w-9 items-center justify-center rounded-full border border-gold/40 bg-black/60"
          >
            <MessageSquare className="h-4 w-4 text-gold" />
          </button>
          {chatOpen ? (
            <div className="mt-3 flex gap-2">
              <input
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") void send();
                }}
                placeholder="Message the table…"
                maxLength={120}
                className="flex-1 rounded-lg border border-border/60 bg-background/70 px-3 py-2 text-[12px] text-foreground outline-none"
              />
              <button
                onClick={() => void send()}
                aria-label="Send message"
                className="flex h-9 w-9 items-center justify-center rounded-lg bg-gold-gradient"
              >
                <Send className="h-4 w-4 text-primary-foreground" />
              </button>
            </div>
          ) : null}
        </div>
      </div>

      <nav className="fixed inset-x-0 bottom-0 z-10 border-t border-border/30 bg-card/40 backdrop-blur-sm">
        <div className="mx-auto flex w-full max-w-md items-stretch">
          {NAV.map(({ to, label, icon: Icon }) => (
            <Link
              key={to}
              to={to}
              className="flex flex-1 flex-col items-center gap-1 py-2.5 text-[11px] text-muted-foreground"
              activeProps={{ className: "text-gold" }}
            >
              <Icon className="h-5 w-5" />
              <span className="leading-none">{label}</span>
            </Link>
          ))}
        </div>
      </nav>
    </div>
  );
}

function ActionButton({
  label,
  className,
  disabled,
  onClick,
}: {
  label: string;
  className: string;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`rounded-xl border py-3 text-[12px] font-bold tracking-wide transition-opacity disabled:opacity-35 ${className}`}
    >
      {label}
    </button>
  );
}

function h_total(hands: { total: number | null; cardCount: number }[]): string {
  const totals = hands.map((h) => h.total).filter((t): t is number => t !== null);
  if (!totals.length) return "?";
  return totals.join(" / ");
}
