import { useEffect, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import navBar from "@/assets/nav-bar.png";

/**
 * Bottom navigation rendered exactly as the provided artwork.
 * Tap zones are aligned to the icons printed on the image:
 * Play, Bonus, the cobra medallion (Profile), History, Leaderboard.
 */
const ZONES = [
  { to: "/dashboard", label: "Play", left: "1%", width: "20%" },
  { to: "/rooms", label: "Bonus", left: "21%", width: "18%" },
  { to: "/profile", label: "Profile", left: "39%", width: "22%" },
  { to: "/history", label: "History", left: "61%", width: "18%" },
  { to: "/leaderboard", label: "Leaderboard", left: "79%", width: "20%" },
] as const;

export function NavBar() {
  const [hidden, setHidden] = useState(false);
  const lastY = useRef(0);

  useEffect(() => {
    lastY.current = window.scrollY;
    const onScroll = () => {
      const y = window.scrollY;
      const delta = y - lastY.current;
      if (Math.abs(delta) > 6) {
        setHidden(delta > 0 && y > 48);
        lastY.current = y;
      }
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-30 transition-transform duration-300 ease-out"
      style={{ transform: hidden ? "translateY(115%)" : "translateY(0)" }}
    >
      <div className="relative mx-auto w-full max-w-md">
        <div className="nav-glass absolute inset-x-2 inset-y-[14%] rounded-3xl" />
        <img
          src={navBar}
          alt=""
          aria-hidden="true"
          className="relative block h-auto w-full mix-blend-screen"
        />
        <svg
          aria-hidden="true"
          className="nav-outline pointer-events-none absolute inset-x-2 inset-y-[14%] h-auto"
          viewBox="0 0 400 100"
          preserveAspectRatio="none"
          style={{ height: "72%" }}
        >
          <rect
            x="1"
            y="1"
            width="398"
            height="98"
            rx="22"
            ry="22"
            fill="none"
            stroke="var(--gold-2)"
            strokeWidth="1.5"
            opacity="0.28"
            vectorEffect="non-scaling-stroke"
          />
          <rect
            className="nav-outline-run"
            x="1"
            y="1"
            width="398"
            height="98"
            rx="22"
            ry="22"
            fill="none"
            stroke="var(--gold-2)"
            strokeWidth="2"
            strokeLinecap="round"
            vectorEffect="non-scaling-stroke"
          />
        </svg>
        {ZONES.map((z) => (
          <Link
            key={z.to}
            to={z.to}
            aria-label={z.label}
            className="absolute top-[25%] h-[50%]"
            style={{ left: z.left, width: z.width }}
          />
        ))}
      </div>
    </nav>
  );
}
