import { createFileRoute } from "@tanstack/react-router";
import { EmptyPage } from "@/components/EmptyPage";

export const Route = createFileRoute("/notifications")({
  head: () => ({
    meta: [
      { title: "Notifications — Cobra Poker" },
      { name: "description", content: "Your Cobra Poker notifications." },
      { property: "og:title", content: "Notifications — Cobra Poker" },
      { property: "og:description", content: "Your Cobra Poker notifications." },
    ],
  }),
  component: () => <EmptyPage title="Notifications" />,
});
