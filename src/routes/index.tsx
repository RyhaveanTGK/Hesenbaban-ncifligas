import { useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { User, Lock } from "lucide-react";
import { toast } from "sonner";
import { AuthLayout } from "@/components/AuthLayout";
import { AuthField } from "@/components/AuthField";
import { loginUser } from "@/lib/auth.functions";
import { saveUser } from "@/lib/session";
import { adminLogin } from "@/lib/admin.functions";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Login — Cobra Poker" },
      { name: "description", content: "Log in to your Cobra Poker account and continue your game." },
      { property: "og:title", content: "Login — Cobra Poker" },
      {
        property: "og:description",
        content: "Log in to your Cobra Poker account and continue your game.",
      },
    ],
  }),
  component: LoginPage,
});

function LoginPage() {
  const navigate = useNavigate();
  const [login, setLogin] = useState("");
  const [password, setPassword] = useState("");
  const [remember, setRemember] = useState(false);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!login || !password) {
      toast.error("Please fill in all fields.");
      return;
    }
    setLoading(true);
    try {
      // Admin credentials (from server env) open the admin panel instead.
      const admin = await adminLogin({ data: { login, password } });
      if (admin.ok && admin.token) {
        localStorage.setItem("cobra_admin_token", admin.token);
        navigate({ to: "/admin" });
        return;
      }

      const res = await loginUser({ data: { login, password } });
      if (!res.ok || !res.user) {
        toast.error(res.error ?? "Login failed.");
        return;
      }
      saveUser(res.user);
      navigate({ to: "/dashboard" });
    } catch {
      toast.error("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthLayout title="Welcome Back" subtitle="Login to continue your game">
      <form onSubmit={onSubmit} className="space-y-4">
        <AuthField
          icon={User}
          placeholder="Username or Email"
          value={login}
          onChange={setLogin}
          autoComplete="username"
        />
        <AuthField
          icon={Lock}
          placeholder="Password"
          type="password"
          value={password}
          onChange={setPassword}
          autoComplete="current-password"
        />

        <div className="flex items-center justify-between pt-1">
          <label className="flex items-center gap-3 text-sm text-foreground">
            <input
              type="checkbox"
              checked={remember}
              onChange={(e) => setRemember(e.target.checked)}
              className="h-5 w-5 appearance-none rounded-[4px] border border-border bg-transparent checked:bg-gold"
            />
            Remember me
          </label>
          <span className="text-sm text-gold">Forgot Password?</span>
        </div>

        <button
          type="submit"
          disabled={loading}
          className="mt-3 w-full rounded-xl bg-gold-gradient py-4 text-base font-bold tracking-wide text-primary-foreground disabled:opacity-60"
        >
          {loading ? "LOGGING IN..." : "LOGIN"}
        </button>
      </form>

      <div className="mt-7 flex items-center gap-3">
        <span className="h-px flex-1 bg-border" />
        <span className="text-sm text-muted-foreground">Don&apos;t have an account?</span>
        <span className="h-px flex-1 bg-border" />
      </div>

      <div className="mt-5 text-center">
        <Link to="/register" className="text-base font-semibold tracking-wide text-gold">
          Create Account
        </Link>
      </div>
    </AuthLayout>
  );
}
