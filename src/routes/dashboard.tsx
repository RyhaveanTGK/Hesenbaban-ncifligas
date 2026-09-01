import { createFileRoute, Link } from "@tanstack/react-router";
import { AppShell } from "@/components/AppShell";
import { useAuthUser } from "@/lib/session";
import blackjackImg from "@/assets/game-blackjack.jpg";
import pokerImg from "@/assets/game-poker.jpg";
import durakImg from "@/assets/game-durak.jpg";
import slotsImg from "@/assets/game-slots.jpg";
import aviatorImg from "@/assets/game-aviator.jpg";
import rouletteImg from "@/assets/game-roulette.jpg";
import homeBg from "@/assets/home-bg.jpg";

export const Route = createFileRoute("/dashboard")({
  head: () => ({
    meta: [
      { title: "Home — Cobra Poker" },
      {
        name: "description",
        content:
          "Pick Blackjack, Poker, Durak, Cobra Slots 5, Cobra Avivator or Cobra Rulet and start playing.",
      },
      { property: "og:title", content: "Home — Cobra Poker" },
      {
        property: "og:description",
        content:
          "Pick Blackjack, Poker, Durak, Cobra Slots 5, Cobra Avivator or Cobra Rulet and start playing.",
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
  {
    id: "slots",
    name: "COBRA SLOTS 5",
    desc: "Hit the reels and win big prizes!",
    image: slotsImg,
    tint: "game-tint-green",
  },
  {
    id: "aviator",
    name: "COBRA AVIVATOR",
    desc: "Cash out before it flies away!",
    image: aviatorImg,
    tint: "game-tint-red",
  },
  {
    id: "roulette",
    name: "COBRA RULET",
    desc: "Take a risk and double your luck!",
    image: rouletteImg,
    tint: "game-tint-gold",
  },
] as const;

function DashboardPage() {
  const { user, ready } = useAuthUser();

  if (!ready || !user) return null;

  return (
    <AppShell backgroundImage={homeBg}>
      <section className="rounded-2xl border border-gold/25 bg-card/40 p-3 backdrop-blur-sm">
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
              className={`flex flex-col overflow-hidden rounded-xl border border-gold/40 bg-card/85 ${g.tint}`}
            >
              <img
                src={g.image}
                alt={`${g.name} game`}
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
      </section>
    </AppShell>
  );
}
