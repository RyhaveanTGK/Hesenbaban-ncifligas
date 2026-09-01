import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/AppShell";
import { useAuthUser } from "@/lib/session";

export const Route = createFileRoute("/dashboard")({
  head: () => ({
    meta: [
      { title: "Play — Cobra Poker" },
      { name: "description", content: "Cobra Poker dashboard — jump into a table and play." },
      { property: "og:title", content: "Play — Cobra Poker" },
      { property: "og:description", content: "Cobra Poker dashboard — jump into a table and play." },
    ],
  }),
  component: DashboardPage,
});

function DashboardPage() {
  const { user, ready } = useAuthUser();
  if (!ready || !user) return null;

  return (
    <AppShell>
      <div className="rounded-2xl border border-border/60 bg-card p-6 text-center">
        <h1 className="text-2xl font-bold text-gold-gradient">Welcome, {user.username}</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Tables are coming soon. Open the Profile tab to manage your account.
        </p>
      </div>
    </AppShell>
  );
}
