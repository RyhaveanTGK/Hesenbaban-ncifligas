import type { ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { Bell, Spade, Users, User, History, BarChart3 } from "lucide-react";
import logo from "@/assets/cobra-logo.png";

const NAV = [
  { to: "/dashboard", label: "Home", icon: Spade },
  { to: "/rooms", label: "Rooms", icon: Users },
  { to: "/profile", label: "Profile", icon: User },
  { to: "/history", label: "History", icon: History },
  { to: "/leaderboard", label: "Leaderboard", icon: BarChart3 },
] as const;

export function AppShell({
  children,
  backgroundImage,
}: {
  children: ReactNode;
  backgroundImage?: string;
}) {
  return (
    <div className="relative min-h-screen bg-background pb-24">
      {backgroundImage && (
        <div aria-hidden="true" className="pointer-events-none fixed inset-0 z-0">
          <img
            src={backgroundImage}
            alt=""
            className="h-full w-full object-cover opacity-55"
          />
          <div className="absolute inset-0 bg-background/55" />
          <div className="absolute inset-0 bg-gradient-to-b from-background/85 via-background/35 to-background/90" />
        </div>
      )}

      <div className="relative z-10">
        <header className="sticky top-0 z-20 flex items-center justify-between border-b border-border/40 bg-background/40 px-4 py-3 backdrop-blur-sm">
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
            className="flex h-11 w-11 items-center justify-center rounded-xl border border-border/60 bg-card/60"
          >
            <Bell className="h-5 w-5 text-foreground" />
          </Link>
        </header>

        <main className="mx-auto w-full max-w-md px-3 py-3">{children}</main>
      </div>

      <nav className="fixed inset-x-0 bottom-0 z-10 border-t border-border/30 bg-card/25 backdrop-blur-[2px]">
        <div className="mx-auto flex w-full max-w-md items-stretch">
          {NAV.map(({ to, label, icon: Icon }) => (
            <Link
              key={to}
              to={to}
              className="nav-faded relative flex flex-1 flex-col items-center gap-1 py-2.5 text-[11px] text-muted-foreground"
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
