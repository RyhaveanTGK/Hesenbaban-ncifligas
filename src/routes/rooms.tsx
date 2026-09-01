import { createFileRoute } from "@tanstack/react-router";
import { EmptyPage } from "@/components/EmptyPage";

export const Route = createFileRoute("/rooms")({
  head: () => ({
    meta: [
      { title: "Rooms — Cobra Poker" },
      { name: "description", content: "Browse Cobra Poker game rooms." },
      { property: "og:title", content: "Rooms — Cobra Poker" },
      { property: "og:description", content: "Browse Cobra Poker game rooms." },
    ],
  }),
  component: () => <EmptyPage title="Rooms" />,
});
