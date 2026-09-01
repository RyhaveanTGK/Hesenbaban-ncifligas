import { createFileRoute } from "@tanstack/react-router";
import { EmptyPage } from "@/components/EmptyPage";

export const Route = createFileRoute("/leaderboard")({
  head: () => ({
    meta: [
      { title: "Leaderboard — Cobra Poker" },
      { name: "description", content: "See the top Cobra Poker players." },
      { property: "og:title", content: "Leaderboard — Cobra Poker" },
      { property: "og:description", content: "See the top Cobra Poker players." },
    ],
  }),
  component: () => <EmptyPage title="Leaderboard" />,
});
