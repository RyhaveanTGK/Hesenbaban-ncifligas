import { Link } from "@tanstack/react-router";
import navBar from "@/assets/nav-bar-new.png";

/**
 * Bottom navigation rendered exactly as the provided artwork.
 * The bar is always visible (no hide on scroll) and each item gets its
 * own left-to-right gold shine, same feel as the game titles on Home.
 *
 * Tap zones are aligned to the icons printed on the image:
 * Play, Bonus, the cobra medallion (Profile), History, Leaderboard.
 */
const ZONES = [
  { to: "/dashboard", label: "Play", left: "3%", width: "14%", delay: "0s", round: false },
  { to: "/rooms", label: "Bonus", left: "21%", width: "16%", delay: "0.45s", round: false },
  { to: "/profile", label: "Profile", left: "41%", width: "18%", delay: "0.9s", round: true },
  { to: "/history", label: "History", left: "62%", width: "16%", delay: "1.35s", round: false },
  { to: "/leaderboard", label: "Leaderboard", left: "80%", width: "17%", delay: "1.8s", round: false },
] as const;

export function NavBar() {
  return (
    <nav className="fixed inset-x-0 bottom-0 z-30">
      <div className="relative mx-auto w-full max-w-md">
        {/* soft blur behind the bar, no black panel */}
        <div className="nav-blur pointer-events-none absolute inset-x-2 inset-y-[26%] rounded-3xl" />

        <img
          src={navBar}
          alt=""
          aria-hidden="true"
          className="relative block h-auto w-full"
        />

        {ZONES.map((z) => (
          <span
            key={`shine-${z.label}`}
            aria-hidden="true"
            className={`nav-shine pointer-events-none absolute top-[30%] h-[42%] ${
              z.round ? "rounded-full" : "rounded-xl"
            }`}
            style={{ left: z.left, width: z.width, animationDelay: z.delay }}
          />
        ))}

        {ZONES.map((z) => (
          <Link
            key={z.to}
            to={z.to}
            aria-label={z.label}
            className="absolute top-[28%] h-[44%]"
            style={{ left: z.left, width: z.width }}
          />
        ))}
      </div>
    </nav>
  );
}
