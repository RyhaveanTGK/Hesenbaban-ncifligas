import { useCallback, useEffect, useState } from "react";

export type LanguageCode = "en";

export const LANGUAGES: { code: LanguageCode; label: string; flag: string }[] = [
  { code: "en", label: "English", flag: "🇺🇸" },
];

export type GameSettings = {
  soundEffects: boolean;
  music: boolean;
  animations: boolean;
  language: LanguageCode;
};

const KEY = "cobra_poker_settings";

export const DEFAULT_SETTINGS: GameSettings = {
  soundEffects: true,
  music: true,
  animations: true,
  language: "en",
};

export function readSettings(): GameSettings {
  if (typeof window === "undefined") return DEFAULT_SETTINGS;
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? { ...DEFAULT_SETTINGS, ...(JSON.parse(raw) as Partial<GameSettings>) } : DEFAULT_SETTINGS;
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export function writeSettings(settings: GameSettings) {
  localStorage.setItem(KEY, JSON.stringify(settings));
  applySettings(settings);
  window.dispatchEvent(new CustomEvent("cobra-settings", { detail: settings }));
}

/** Applies side effects that the whole app observes (animations, audio volume). */
export function applySettings(settings: GameSettings) {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  root.dataset["animations"] = settings.animations ? "on" : "off";
  root.dataset["sound"] = settings.soundEffects ? "on" : "off";
  root.dataset["music"] = settings.music ? "on" : "off";
  root.lang = settings.language;
  document.querySelectorAll("audio, video").forEach((el) => {
    const media = el as HTMLMediaElement;
    const isMusic = media.dataset["kind"] === "music";
    media.muted = isMusic ? !settings.music : !settings.soundEffects;
    if (media.muted && isMusic) media.pause();
  });
}

/** Reactive access to the persisted settings. */
export function useGameSettings() {
  const [settings, setSettings] = useState<GameSettings>(DEFAULT_SETTINGS);

  useEffect(() => {
    const initial = readSettings();
    setSettings(initial);
    applySettings(initial);

    const onChange = (e: Event) => setSettings((e as CustomEvent<GameSettings>).detail);
    const onStorage = () => setSettings(readSettings());
    window.addEventListener("cobra-settings", onChange);
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener("cobra-settings", onChange);
      window.removeEventListener("storage", onStorage);
    };
  }, []);

  const update = useCallback((patch: Partial<GameSettings>) => {
    const next = { ...readSettings(), ...patch };
    writeSettings(next);
    setSettings(next);
  }, []);

  return { settings, update };
}

/** Plays a short UI sound only when sound effects are enabled. */
export function playUiSound(frequency = 660, duration = 0.08) {
  if (!readSettings().soundEffects) return;
  try {
    const Ctx =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.frequency.value = frequency;
    osc.type = "sine";
    gain.gain.value = 0.05;
    osc.connect(gain).connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + duration);
    osc.onended = () => void ctx.close();
  } catch {
    /* audio not available */
  }
}
