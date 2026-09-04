import { createFileRoute } from "@tanstack/react-router";
import { EmptyPage } from "@/components/EmptyPage";

export const Route = createFileRoute("/rooms")({
  head: () => ({
    meta: [
      { title: "Bonus — Cobra Poker" },
      { name: "description", content: "Cobra Poker bonuses." },
      { property: "og:title", content: "Bonus — Cobra Poker" },
      { property: "og:description", content: "Cobra Poker bonuses." },
    ],
  }),
  component: () => <EmptyPage title="Bonus" />,
});
