import { useCallback, useEffect, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { LogOut, Minus, Plus, RefreshCw, Search } from "lucide-react";
import { toast } from "sonner";
import {
  adminAdjustBalance,
  adminListUsers,
  adminSetBalance,
  type AdminUserRow,
} from "@/lib/admin.functions";

const TOKEN_KEY = "cobra_admin_token";

export const Route = createFileRoute("/admin")({
  head: () => ({
    meta: [
      { title: "Admin Panel — Cobra Poker" },
      { name: "description", content: "Manage Cobra Poker players and their chip balances." },
      { property: "og:title", content: "Admin Panel — Cobra Poker" },
      {
        property: "og:description",
        content: "Manage Cobra Poker players and their chip balances.",
      },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: AdminPage,
});

function AdminPage() {
  const navigate = useNavigate();
  const [token, setToken] = useState<string | null>(null);
  const [users, setUsers] = useState<AdminUserRow[]>([]);
  const [query, setQuery] = useState("");
  const [amounts, setAmounts] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const t = localStorage.getItem(TOKEN_KEY);
    if (!t) {
      navigate({ to: "/" });
      return;
    }
    setToken(t);
  }, [navigate]);

  const load = useCallback(
    async (silent = false) => {
      if (!token) return;
      if (!silent) setLoading(true);
      try {
        const res = await adminListUsers({ data: { token } });
        if (!res.ok) {
          if (res.error === "Unauthorized.") {
            localStorage.removeItem(TOKEN_KEY);
            navigate({ to: "/" });
            return;
          }
          if (!silent) toast.error(res.error ?? "Failed to load users.");
          return;
        }
        setUsers(res.users ?? []);
      } catch {
        if (!silent) toast.error("Failed to load users.");
      } finally {
        setLoading(false);
      }
    },
    [token, navigate],
  );

  useEffect(() => {
    if (!token) return;
    void load();
    const t = setInterval(() => void load(true), 4000);
    return () => clearInterval(t);
  }, [token, load]);

  async function adjust(userId: string, sign: 1 | -1) {
    if (!token) return;
    const raw = Number(amounts[userId]);
    if (!raw || Number.isNaN(raw) || raw <= 0) {
      toast.error("Enter a valid amount.");
      return;
    }
    setBusy(userId);
    try {
      const res = await adminAdjustBalance({ data: { token, userId, delta: sign * raw } });
      if (!res.ok) {
        toast.error(res.error ?? "Update failed.");
        return;
      }
      setUsers((prev) =>
        prev.map((u) => (u.id === userId ? { ...u, chipBalance: res.balance ?? u.chipBalance } : u)),
      );
      setAmounts((prev) => ({ ...prev, [userId]: "" }));
      toast.success(`Balance updated: ${res.balance?.toFixed(2)} chips`);
    } catch {
      toast.error("Update failed.");
    } finally {
      setBusy(null);
    }
  }

  async function setExact(userId: string) {
    if (!token) return;
    const raw = Number(amounts[userId]);
    if (Number.isNaN(raw) || raw < 0) {
      toast.error("Enter a valid amount.");
      return;
    }
    setBusy(userId);
    try {
      const res = await adminSetBalance({ data: { token, userId, balance: raw } });
      if (!res.ok) {
        toast.error(res.error ?? "Update failed.");
        return;
      }
      setUsers((prev) =>
        prev.map((u) => (u.id === userId ? { ...u, chipBalance: res.balance ?? u.chipBalance } : u)),
      );
      setAmounts((prev) => ({ ...prev, [userId]: "" }));
      toast.success("Balance set.");
    } catch {
      toast.error("Update failed.");
    } finally {
      setBusy(null);
    }
  }

  function logout() {
    localStorage.removeItem(TOKEN_KEY);
    navigate({ to: "/" });
  }

  const filtered = users.filter((u) => {
    const q = query.trim().toLowerCase();
    if (!q) return true;
    return (
      u.username.toLowerCase().includes(q) ||
      u.email.toLowerCase().includes(q) ||
      u.id.toLowerCase().includes(q)
    );
  });

  const totalChips = users.reduce((sum, u) => sum + u.chipBalance, 0);

  return (
    <div className="min-h-screen bg-background pb-16">
      <header className="sticky top-0 z-20 flex items-center justify-between border-b border-border/50 bg-background/80 px-4 py-4 backdrop-blur">
        <div>
          <h1 className="text-lg font-bold tracking-wide text-gold">ADMIN PANEL</h1>
          <p className="text-xs text-muted-foreground">
            {users.length} users · {totalChips.toFixed(2)} chips total
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => void load()}
            aria-label="Refresh"
            className="flex h-10 w-10 items-center justify-center rounded-xl border border-border/60 bg-card/60"
          >
            <RefreshCw className="h-4 w-4 text-foreground" />
          </button>
          <button
            onClick={logout}
            aria-label="Log out"
            className="flex h-10 w-10 items-center justify-center rounded-xl border border-border/60 bg-card/60"
          >
            <LogOut className="h-4 w-4 text-foreground" />
          </button>
        </div>
      </header>

      <main className="mx-auto w-full max-w-md px-3 py-4">
        <div className="relative mb-4">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search username, email or ID"
            className="w-full rounded-xl border border-border/60 bg-card/60 py-3 pl-10 pr-3 text-sm text-foreground outline-none placeholder:text-muted-foreground"
          />
        </div>

        {loading && users.length === 0 ? (
          <p className="py-10 text-center text-sm text-muted-foreground">Loading users…</p>
        ) : filtered.length === 0 ? (
          <p className="py-10 text-center text-sm text-muted-foreground">No users found.</p>
        ) : (
          <ul className="space-y-3">
            {filtered.map((u) => (
              <li key={u.id} className="rounded-2xl border border-border/60 bg-card p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-base font-semibold text-foreground">{u.username}</p>
                    <p className="truncate text-xs text-muted-foreground">{u.email}</p>
                    <p className="mt-1 text-[11px] text-muted-foreground">ID: {u.id}</p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="text-lg font-bold text-gold">{u.chipBalance.toFixed(2)}</p>
                    <p className="text-[11px] text-muted-foreground">chips</p>
                  </div>
                </div>

                <div className="mt-3 flex items-center gap-2">
                  <input
                    inputMode="decimal"
                    value={amounts[u.id] ?? ""}
                    onChange={(e) => setAmounts((prev) => ({ ...prev, [u.id]: e.target.value }))}
                    placeholder="Amount"
                    className="min-w-0 flex-1 rounded-xl border border-border/60 bg-secondary/40 px-3 py-2.5 text-sm text-foreground outline-none placeholder:text-muted-foreground"
                  />
                  <button
                    disabled={busy === u.id}
                    onClick={() => void adjust(u.id, 1)}
                    aria-label="Add chips"
                    className="flex h-10 w-10 items-center justify-center rounded-xl bg-gold-gradient text-primary-foreground disabled:opacity-60"
                  >
                    <Plus className="h-4 w-4" />
                  </button>
                  <button
                    disabled={busy === u.id}
                    onClick={() => void adjust(u.id, -1)}
                    aria-label="Remove chips"
                    className="flex h-10 w-10 items-center justify-center rounded-xl border border-border/60 bg-secondary/60 text-foreground disabled:opacity-60"
                  >
                    <Minus className="h-4 w-4" />
                  </button>
                </div>

                <button
                  disabled={busy === u.id}
                  onClick={() => void setExact(u.id)}
                  className="mt-2 w-full rounded-xl border border-border/60 bg-transparent py-2 text-xs font-semibold tracking-wide text-muted-foreground disabled:opacity-60"
                >
                  SET EXACT BALANCE
                </button>
              </li>
            ))}
          </ul>
        )}
      </main>
    </div>
  );
}
