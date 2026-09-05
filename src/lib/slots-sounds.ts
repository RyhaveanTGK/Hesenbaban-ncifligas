/**
 * Cobra Slots 25 — sound slots.
 *
 * Every file below is an EMPTY placeholder in `public/sounds/`; drop your own
 * mp3 over the file with the same name and it plays automatically.
 *
 *   public/sounds/spin.mp3          → spin button pressed
 *   public/sounds/reel-stop.mp3     → each reel stops / symbols land
 *   public/sounds/line-1x3.mp3      → a 1x3 line is completed
 *   public/sounds/win/<symbol>-3.mp3 → 3 OR 4 of that symbol pays
 *   public/sounds/win/<symbol>-5.mp3 → 5 of that symbol pays
 *
 * Symbols: seven, watermelon, star, dollar, bell, grapes, plum, orange,
 *          lemon, cherry, clover.
 */
import type { SymbolId } from "./slots-engine";

export const SOUND_SPIN = "/sounds/spin.mp3";
export const SOUND_REEL_STOP = "/sounds/reel-stop.mp3";
export const SOUND_LINE_1X3 = "/sounds/line-1x3.mp3";

/** 3 and 4 of a kind share one sound, 5 of a kind has its own. */
export const symbolWinSound = (symbol: SymbolId, count: number) =>
  `/sounds/win/${symbol}-${count >= 5 ? 5 : 3}.mp3`;

const cache = new Map<string, HTMLAudioElement>();

/** Fire and forget. Missing or still-empty files fail silently. */
export function playSound(src: string, enabled = true, volume = 1) {
  if (!enabled || typeof window === "undefined") return;
  try {
    let base = cache.get(src);
    if (!base) {
      base = new Audio(src);
      base.preload = "auto";
      cache.set(src, base);
    }
    const a = base.cloneNode(true) as HTMLAudioElement;
    a.volume = volume;
    void a.play().catch(() => {});
  } catch {
    /* ignore */
  }
}
