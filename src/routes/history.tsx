import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { ArrowDown, ArrowUp } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { useAuthUser } from "@/lib/session";
import { listHistory, type HistoryItem } from "@/lib/withdraw.functions";

export const Route = createFileRoute("/history")({
  head: () => ({
    meta: [
      { title: "History — Cobra Poker" },
      { name: "description", content: "Your Cobra Poker deposit and withdrawal history." },
      { property: "og:title", content: "History — Cobra Poker" },
      { property: "og:description", content: "Your Cobra Poker deposit and withdrawal history." },
    ],
  }),
  component: HistoryPage,
});

function HistoryPage() {
  const { user, ready } = useAuthUser();
  const [items, setItems] = useState<HistoryItem[]>([]);
  const userId = user?.id;

  const refresh = useCallback(async () => {
    if (!userId) return;
    try {
      const res = await listHistory({ data: { userId } });
      setItems(res.items);
    } catch {
      /* ignore transient errors */
    }
  }, [userId]);

  useEffect(() => {
    if (!userId) return;
    void refresh();
    const t = setInterval(() => void refresh(), 5000);
    return () => clearInterval(t);
  }, [userId, refresh]);

  if (!ready || !user) return null;

  return (
    <AppShell>
      <h1 className="text-2xl font-bold text-foreground">History</h1>
      {items.length === 0 ? (
        <div className="mt-4 rounded-2xl border border-border/60 bg-card px-4 py-12 text-center text-sm text-muted-foreground">
          No transactions yet
        </div>
      ) : (
        <div className="mt-4 divide-y divide-border/60 rounded-2xl border border-border/60 bg-card">
          {items.map((it) => {
            const dt = new Date(it.createdAt);
            const isWd = it.kind === "withdraw";
            return (
              <div key={it.id} className="flex items-center gap-3 p-4">
                <span
                  className={`flex h-10 w-10 items-center justify-center rounded-lg ${
                    isWd ? "bg-info/10" : "bg-success/10"
                  }`}
                >
                  {isWd ? (
                    <ArrowUp className="h-5 w-5 text-info" />
                  ) : (
                    <ArrowDown className="h-5 w-5 text-success" />
                  )}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-base font-semibold text-foreground">
                    {isWd ? "Withdraw" : "Deposit"}
                  </p>
                  <p className="truncate text-xs text-muted-foreground">
                    {it.bank}
                    {it.card ? ` • ${it.card}` : ""} • {dt.toLocaleString("en-GB")}
                  </p>
                  {isWd && it.fee !== undefined && (
                    <p className="text-xs text-danger">Commission: {it.fee.toFixed(2)} GEL</p>
                  )}
                </div>
                <div className="text-right">
                  <p className={`text-base font-bold ${isWd ? "text-info" : "text-success"}`}>
                    {isWd ? "-" : "+"}
                    {it.amount.toFixed(2)} GEL
                  </p>
                  {isWd && it.payout !== undefined && (
                    <p className="text-xs text-muted-foreground">Paid: {it.payout.toFixed(2)} GEL</p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </AppShell>
  );
}
