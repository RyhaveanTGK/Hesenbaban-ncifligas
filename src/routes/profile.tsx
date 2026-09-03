import { createFileRoute, useNavigate } from "@tanstack/react-router";
import {
  Camera,
  ChevronRight,
  Copy,
  Download,
  ArrowUp,
  Settings,
  LogOut,
  CircleDollarSign,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { DepositDialog } from "@/components/DepositDialog";
import { WithdrawDialog } from "@/components/WithdrawDialog";
import { getBalance } from "@/lib/deposit.functions";
import { AppShell } from "@/components/AppShell";
import { useAuthUser, clearUser, saveUser } from "@/lib/session";
import { SettingsDialog } from "@/components/SettingsDialog";
import type { PublicUser } from "@/lib/auth.functions";

export const Route = createFileRoute("/profile")({
  head: () => ({
    meta: [
      { title: "Profile — Cobra Poker" },
      { name: "description", content: "Your Cobra Poker profile, chip balance and wallet." },
      { property: "og:title", content: "Profile — Cobra Poker" },
      { property: "og:description", content: "Your Cobra Poker profile, chip balance and wallet." },
    ],
  }),
  component: ProfilePage,
});

function ProfilePage() {
  const navigate = useNavigate();
  const { user: sessionUser, ready } = useAuthUser();
  const [userOverride, setUserOverride] = useState<PublicUser | null>(null);
  const user = userOverride ?? sessionUser;
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [depositOpen, setDepositOpen] = useState(false);
  const [withdrawOpen, setWithdrawOpen] = useState(false);
  const [balance, setBalance] = useState<number | null>(null);

  const userId = user?.id;
  const refreshBalance = useCallback(async () => {
    if (!userId) return;
    try {
      const res = await getBalance({ data: { userId } });
      if (typeof res.balance === "number" && Number.isFinite(res.balance)) setBalance(res.balance);
    } catch {
      /* ignore transient errors */
    }
  }, [userId]);

  useEffect(() => {
    if (!userId) return;
    void refreshBalance();
    const t = setInterval(() => void refreshBalance(), 2000);
    const onFocus = () => void refreshBalance();
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onFocus);
    return () => {
      clearInterval(t);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onFocus);
    };
  }, [userId, refreshBalance]);


  if (!ready || !user) return null;

  const shownBalance = balance ?? user.chipBalance;

  const memberSince = new Date(user.createdAt).toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
  const winRate = user.totalGames > 0 ? ((user.wins / user.totalGames) * 100).toFixed(2) : "0.00";

  return (
    <AppShell>
      <section className="rounded-2xl border border-border/60 bg-card p-4">
        <div className="flex items-center gap-4">
          <div className="relative">
            <div className="flex h-20 w-20 items-center justify-center overflow-hidden rounded-full border-2 border-gold bg-secondary text-2xl font-bold text-gold">
              {user.username.slice(0, 2).toUpperCase()}
            </div>
            <span className="absolute -bottom-1 -right-1 flex h-8 w-8 items-center justify-center rounded-full border-2 border-card bg-secondary">
              <Camera className="h-4 w-4 text-muted-foreground" />
            </span>
          </div>
          <div className="min-w-0">
            <h1 className="truncate text-2xl font-bold text-foreground">{user.username}</h1>
            <button
              onClick={() => {
                navigator.clipboard?.writeText(user.id);
                toast.success("ID copied");
              }}
              className="mt-1 flex items-center gap-2 text-sm text-muted-foreground"
            >
              ID: {user.id} <Copy className="h-3.5 w-3.5" />
            </button>
            <p className="mt-1 text-sm text-muted-foreground">Member since: {memberSince}</p>
          </div>
        </div>

        <div className="mt-4 flex items-center justify-between rounded-xl border border-border/60 bg-secondary/40 p-4">
          <div>
            <p className="text-xs tracking-wide text-muted-foreground">CHIP BALANCE</p>
            <p className="mt-2 flex items-center gap-2 text-2xl font-bold text-gold">
              <CircleDollarSign className="h-6 w-6" />
              {shownBalance.toFixed(2)} GEL
            </p>
          </div>
          <ChevronRight className="h-5 w-5 text-muted-foreground" />
        </div>

        <div className="mt-3 grid grid-cols-4 divide-x divide-border/60 rounded-xl border border-border/60 bg-secondary/40 py-3 text-center">
          <Stat label="Total Games" value={String(user.totalGames)} />
          <Stat label="Wins" value={String(user.wins)} tone="text-success" />
          <Stat label="Win Rate" value={`${winRate}%`} tone="text-success" />
          <Stat label="Highest Win" value={`${user.highestWin.toFixed(2)}`} tone="text-gold" />
        </div>
      </section>

      <section className="mt-4 rounded-2xl border border-border/60 bg-card p-4">
        <h2 className="text-xl font-bold text-foreground">Wallet</h2>
        <div className="mt-3 divide-y divide-border/60 rounded-xl border border-border/60">
          <WalletRow
            icon={<Download className="h-5 w-5 text-success" />}
            tint="bg-success/10"
            title="Deposit"
            subtitle="Add chips to your account"
            onClick={() => setDepositOpen(true)}
          />
          <WalletRow
            icon={<ArrowUp className="h-5 w-5 text-info" />}
            tint="bg-info/10"
            title="Withdraw"
            subtitle="Withdraw your winnings"
            onClick={() => setWithdrawOpen(true)}
          />
        </div>

        <div className="mt-5 flex items-center justify-between">
          <h3 className="text-lg font-semibold text-foreground">Recent Activity</h3>
          <span className="text-sm text-gold">View All</span>
        </div>
        <div className="mt-3 rounded-xl border border-border/60 px-4 py-10 text-center text-sm text-muted-foreground">
          No activity yet
        </div>
      </section>

      <section className="mt-4 divide-y divide-border/60 rounded-2xl border border-border/60 bg-card">
        <button
          onClick={() => setSettingsOpen(true)}
          className="flex w-full items-center gap-4 px-4 py-4 text-left"
        >
          <Settings className="h-6 w-6 text-muted-foreground" />
          <span className="flex-1 text-base font-medium text-foreground">Settings</span>
          <ChevronRight className="h-5 w-5 text-muted-foreground" />
        </button>
        <button
          onClick={() => {
            clearUser();
            navigate({ to: "/" });
          }}
          className="flex w-full items-center gap-4 px-4 py-4 text-left"
        >
          <LogOut className="h-6 w-6 text-danger" />
          <span className="flex-1 text-base font-medium text-foreground">Logout</span>
          <ChevronRight className="h-5 w-5 text-muted-foreground" />
        </button>
      </section>
      {settingsOpen && (
        <SettingsDialog
          user={user}
          onClose={() => setSettingsOpen(false)}
          onUserUpdated={(u) => {
            saveUser(u);
            setUserOverride(u);
          }}
        />
      )}
      {depositOpen && (
        <DepositDialog
          userId={user.id}
          username={user.username}
          onClose={() => setDepositOpen(false)}
          onSubmitted={() => void refreshBalance()}
        />
      )}
      {withdrawOpen && (
        <WithdrawDialog
          userId={user.id}
          username={user.username}
          balance={shownBalance}
          onClose={() => setWithdrawOpen(false)}
          onSubmitted={() => void refreshBalance()}
        />
      )}
    </AppShell>
  );
}

function Stat({ label, value, tone = "text-foreground" }: { label: string; value: string; tone?: string }) {
  return (
    <div className="px-1">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={`mt-1 text-lg font-bold ${tone}`}>{value}</p>
    </div>
  );
}

function WalletRow({
  icon,
  tint,
  title,
  subtitle,
  onClick,
}: {
  icon: React.ReactNode;
  tint: string;
  title: string;
  subtitle: string;
  onClick?: () => void;
}) {
  return (
    <button onClick={onClick} className="flex w-full items-center gap-4 px-3 py-4 text-left">
      <span className={`flex h-11 w-11 items-center justify-center rounded-lg ${tint}`}>{icon}</span>
      <span className="flex-1">
        <span className="block text-base font-semibold text-foreground">{title}</span>
        <span className="block text-sm text-muted-foreground">{subtitle}</span>
      </span>
      <ChevronRight className="h-5 w-5 text-muted-foreground" />
    </button>
  );
}
