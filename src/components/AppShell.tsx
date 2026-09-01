import type { ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { Bell, Spade, Users, User, History, BarChart3 } from "lucide-react";
import logo from "@/assets/cobra-logo.png";

const NAV = [
  { to: "/dashboard", label: "Play", icon: Spade },
  { to: "/rooms", label: "Rooms", icon: Users },
  { to: "/profile", label: "Profile", icon: User },
  { to: "/history", label: "History", icon: History },
  { to: "/leaderboard", label: "Leaderboard", icon: BarChart3 },
] as const;

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-background pb-24">
      <header className="sticky top-0 z-20 flex items-center justify-between border-b border-border/60 bg-background/95 px-4 py-3 backdrop-blur">
        <div className="h-11 w-11" />
        <img
          src={logo}
          alt="Cobra Poker"
          width={1024}
          height={1024}
          className="h-16 w-auto object-contain"
        />
        <Link
          to="/notifications"
          aria-label="Notifications"
          className="flex h-11 w-11 items-center justify-center rounded-xl border border-border/70 bg-card"
        >
          <Bell className="h-5 w-5 text-foreground" />
        </Link>
      </header>

      <main className="mx-auto w-full max-w-md px-3 py-3">{children}</main>

      <nav className="fixed inset-x-0 bottom-0 z-20 border-t border-border/60 bg-card/95 backdrop-blur">
        <div className="mx-auto flex w-full max-w-md items-stretch">
          {NAV.map(({ to, label, icon: Icon }) => (
            <Link
              key={to}
              to={to}
              className="relative flex flex-1 flex-col items-center gap-1 py-2.5 text-[11px] text-muted-foreground"
              activeProps={{ className: "text-gold" }}
            >
              <Icon className="h-5 w-5" />
              <span className="leading-none">{label}</span>
              
            </Link>
          ))}
        </div>
      </nav>
    </div>
  );
}
