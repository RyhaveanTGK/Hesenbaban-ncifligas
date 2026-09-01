import type { ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import bg from "@/assets/poker-bg.jpg";
import logo from "@/assets/cobra-logo.png";

export function AuthLayout({
  children,
  title,
  subtitle,
  showBack = false,
}: {
  children: ReactNode;
  title: string;
  subtitle: string;
  showBack?: boolean;
}) {
  return (
    <div
      className="relative min-h-screen w-full bg-background bg-cover bg-center bg-no-repeat"
      style={{ backgroundImage: `url(${bg})` }}
    >
      <div className="absolute inset-0 bg-background/55" />

      <div className="relative mx-auto flex min-h-screen w-full max-w-md flex-col px-4 pb-10 pt-6">
        {showBack && (
          <Link
            to="/"
            aria-label="Back"
            className="mb-2 inline-flex h-11 w-11 items-center justify-center rounded-xl border border-border/70 bg-card/70 text-foreground"
          >
            <ArrowLeft className="h-5 w-5" />
          </Link>
        )}

        <img
          src={logo}
          alt="Cobra Poker"
          width={1024}
          height={1024}
          className="mx-auto mt-2 h-52 w-52 object-contain drop-shadow-[0_10px_30px_rgba(0,0,0,0.8)]"
        />

        <div className="panel-frame mt-2 px-5 pb-8 pt-7">
          <h1 className="text-center text-3xl font-bold tracking-tight text-foreground">{title}</h1>
          <p className="mt-2 text-center text-sm text-muted-foreground">{subtitle}</p>
          <div className="mt-7">{children}</div>
        </div>
      </div>
    </div>
  );
}
