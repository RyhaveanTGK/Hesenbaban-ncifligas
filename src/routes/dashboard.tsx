import { useCallback, useEffect, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ChevronRight, Plus, Trophy, User as UserIcon, HelpCircle } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { DepositDialog } from "@/components/DepositDialog";
import { getBalance } from "@/lib/deposit.functions";
import { useAuthUser } from "@/lib/session";
import blackjackImg from "@/assets/game-blackjack.jpg";
import pokerImg from "@/assets/game-poker.jpg";
import durakImg from "@/assets/game-durak.jpg";

export const Route = createFileRoute("/dashboard")({
  head: () => ({
    meta: [
      { title: "Home — Cobra Poker" },
      {
        name: "description",
        content: "Pick Blackjack, Poker or Durak and start playing on Cobra Poker.",
      },
      { property: "og:title", content: "Home — Cobra Poker" },
      {
        property: "og:description",
        content: "Pick Blackjack, Poker or Durak and start playing on Cobra Poker.",
      },
    ],
  }),
  component: DashboardPage,
});

const GAMES = [
  {
    id: "blackjack",
    name: "BLACKJACK",
    desc: "Beat the dealer and win big!",
    image: blackjackImg,
    tint: "game-tint-green",
  },
  {
    id: "poker",
    name: "POKER",
    desc: "Test your skills and bluff your way to victory!",
    image: pokerImg,
    tint: "game-tint-red",
  },
  {
    id: "durak",
    name: "DURAK",
    desc: "Classic card game. Defend and win!",
    image: durakImg,
    tint: "game-tint-blue",
  },
] as const;

function DashboardPage() {
  const { user, ready } = useAuthUser();
  const [depositOpen, setDepositOpen] = useState(false);
  const [balance, setBalance] = useState<number | null>(null);

  const userId = user?.id;
  const refreshBalance = useCallback(async () => {
    if (!userId) return;
    try {
      const res = await getBalance({ data: { userId } });
      if (res.balance !== null) setBalance(res.balance);
    } catch {
      /* ignore transient errors */
    }
  }, [userId]);

  useEffect(() => {
    if (!userId) return;
    void refreshBalance();
    const t = setInterval(() => void refreshBalance(), 5000);
    return () => clearInterval(t);
  }, [userId, refreshBalance]);

  if (!ready || !user) return null;

  const shownBalance = balance ?? user.chipBalance;

  return (
    <AppShell>
      {/* Balance + profile row */}
      <div className="grid grid-cols-2 gap-3">
        <div className="flex items-center gap-2 rounded-2xl border border-gold/35 bg-card/80 px-2.5 py-3">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-gold/50 bg-secondary/50 text-[9px] font-bold text-gold">
            GEL
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-semibold tracking-wider text-muted-foreground">
              TOTAL BALANCE
            </p>
            <p className="whitespace-nowrap text-base font-bold text-gold-gradient">
              {shownBalance.toFixed(2)} GEL
            </p>
          </div>
          <button
            type="button"
            onClick={() => setDepositOpen(true)}
            aria-label="Deposit"
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-gold/60 bg-secondary/40 text-gold transition-colors hover:bg-gold/15"
          >
            <Plus className="h-5 w-5" />
          </button>
        </div>

        <Link
          to="/profile"
          className="flex items-center gap-2 rounded-2xl border border-gold/35 bg-card/80 px-3 py-3 transition-colors hover:border-gold/70"
        >
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-secondary/60 text-muted-foreground">
            <UserIcon className="h-5 w-5" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-base font-bold text-gold-gradient">
              {user.username}
            </span>
            <span className="block truncate text-[11px] text-muted-foreground">ID: {user.id}</span>
          </span>
          <ChevronRight className="h-5 w-5 shrink-0 text-gold" />
        </Link>
      </div>

      {/* Game selection */}
      <section className="mt-3 rounded-2xl border border-gold/25 bg-card/50 p-3">
        <div className="flex items-center justify-center gap-2">
          <span className="h-px w-8 bg-gradient-to-r from-transparent to-gold/70" />
          <span className="text-[10px] text-gold">◆</span>
          <h1 className="font-display text-xl font-bold tracking-wide text-gold-gradient">
            SELECT A GAME
          </h1>
          <span className="text-[10px] text-gold">◆</span>
          <span className="h-px w-8 bg-gradient-to-l from-transparent to-gold/70" />
        </div>
        <p className="mt-1 text-center text-xs text-muted-foreground">
          Choose your favorite game and start playing
        </p>

        <div className="mt-4 grid grid-cols-3 gap-2">
          {GAMES.map((g) => (
            <article
              key={g.id}
              className={`flex flex-col overflow-hidden rounded-xl border border-gold/40 bg-card ${g.tint}`}
            >
              <img
                src={g.image}
                alt={`${g.name} cards`}
                loading="lazy"
                width={816}
                height={816}
                className="h-24 w-full object-cover"
              />
              <div className="flex flex-1 flex-col p-2">
                <h2 className="text-shimmer font-display text-center text-[13px] font-bold tracking-wide">
                  {g.name}
                </h2>
                <p className="mt-1 flex-1 text-center text-[10px] leading-tight text-foreground/80">
                  {g.desc}
                </p>
                <Link
                  to="/rooms"
                  className="mt-2 block rounded-lg bg-gold-gradient py-2 text-center text-[10px] font-bold tracking-wide text-primary-foreground"
                >
                  PLAY NOW
                </Link>
              </div>
            </article>
          ))}
        </div>

        <div className="mt-2 grid grid-cols-3 gap-2">
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className="flex flex-col items-center justify-center gap-3 rounded-xl border border-border/60 bg-secondary/20 py-6"
            >
              <span className="flex h-12 w-12 items-center justify-center rounded-full border-2 border-dashed border-gold/40 text-gold/60">
                <HelpCircle className="h-6 w-6" />
              </span>
              <span className="text-[9px] tracking-wider text-muted-foreground">COMING SOON</span>
            </div>
          ))}
        </div>

        <div className="mt-3 flex items-center gap-3 rounded-xl border border-gold/30 bg-secondary/20 p-3">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-gold/50 bg-card">
            <Trophy className="h-6 w-6 text-gold" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-xs font-bold tracking-wide text-gold-gradient">
              COMPETE, WIN, REPEAT!
            </p>
            <p className="text-[10px] leading-tight text-muted-foreground">
              Climb the leaderboard and become the next champion.
            </p>
          </div>
          <Link
            to="/leaderboard"
            className="shrink-0 rounded-lg border border-gold/60 px-2 py-2 text-[9px] font-bold tracking-wide text-gold transition-colors hover:bg-gold/15"
          >
            VIEW LEADERBOARD
          </Link>
        </div>
      </section>

      {depositOpen && (
        <DepositDialog
          userId={user.id}
          username={user.username}
          onClose={() => setDepositOpen(false)}
          onSubmitted={() => void refreshBalance()}
        />
      )}
    </AppShell>
  );
}
