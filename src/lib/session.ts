import { useEffect, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import type { PublicUser } from "./auth.functions";

const KEY = "cobra_poker_user";

export function saveUser(user: PublicUser) {
  localStorage.setItem(KEY, JSON.stringify(user));
}

export function clearUser() {
  localStorage.removeItem(KEY);
}

export function readUser(): PublicUser | null {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as PublicUser) : null;
  } catch {
    return null;
  }
}

/** Client-side auth guard: returns the user once hydrated, redirects if absent. */
export function useAuthUser() {
  const navigate = useNavigate();
  const [user, setUser] = useState<PublicUser | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const u = readUser();
    if (!u) {
      navigate({ to: "/" });
      return;
    }
    setUser(u);
    setReady(true);
  }, [navigate]);

  return { user, ready };
}
