import type { ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { Bell } from "lucide-react";
import logo from "@/assets/cobra-logo.png";
import appBg from "@/assets/app-bg.png";
import { NavBar } from "@/components/NavBar";

export function AppShell({
  children,
  backgroundImage,
}: {
  children: ReactNode;
  backgroundImage?: string;
}) {
  return (
    <div className="relative min-h-screen bg-background pb-28">
      <div aria-hidden="true" className="pointer-events-none fixed inset-0 z-0">
        <img
          src={backgroundImage ?? appBg}
          alt=""
          className="h-full w-full object-cover"
        />
      </div>

      <div className="relative z-10">
        <header className="sticky top-0 z-20 flex items-center justify-between px-4 py-3">
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
            className="flex h-11 w-11 items-center justify-center rounded-xl border border-gold/40 bg-card/60"
          >
            <Bell className="h-5 w-5 text-foreground" />
          </Link>
        </header>

        <main className="mx-auto w-full max-w-md px-3 py-3">{children}</main>
      </div>

      <NavBar />
    </div>
  );
}
