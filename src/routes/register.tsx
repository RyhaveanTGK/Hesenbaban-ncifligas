import { useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { User, Mail, Lock } from "lucide-react";
import { toast } from "sonner";
import { AuthLayout } from "@/components/AuthLayout";
import { AuthField } from "@/components/AuthField";
import { registerUser } from "@/lib/auth.functions";
import { saveUser } from "@/lib/session";

export const Route = createFileRoute("/register")({
  head: () => ({
    meta: [
      { title: "Create Account — Cobra Poker" },
      { name: "description", content: "Sign up to start your Cobra Poker journey." },
      { property: "og:title", content: "Create Account — Cobra Poker" },
      { property: "og:description", content: "Sign up to start your Cobra Poker journey." },
    ],
  }),
  component: RegisterPage,
});

function RegisterPage() {
  const navigate = useNavigate();
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [agree, setAgree] = useState(false);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!username || !email || !password || !confirm) {
      toast.error("Please fill in all fields.");
      return;
    }
    if (username.length < 3) {
      toast.error("Username must be at least 3 characters.");
      return;
    }
    if (password.length < 6) {
      toast.error("Password must be at least 6 characters.");
      return;
    }
    if (password !== confirm) {
      toast.error("Passwords do not match.");
      return;
    }
    if (!agree) {
      toast.error("Please accept the Terms of Service.");
      return;
    }

    setLoading(true);
    try {
      const res = await registerUser({ data: { username, email, password } });
      if (!res.ok || !res.user) {
        toast.error(res.error ?? "Sign up failed.");
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
    <AuthLayout title="Create Account" subtitle="Sign up to start your poker journey" showBack>
      <form onSubmit={onSubmit} className="space-y-3.5">
        <AuthField icon={User} placeholder="Username" value={username} onChange={setUsername} />
        <AuthField
          icon={Mail}
          placeholder="Email"
          type="email"
          value={email}
          onChange={setEmail}
          autoComplete="email"
        />
        <AuthField
          icon={Lock}
          placeholder="Password"
          type="password"
          value={password}
          onChange={setPassword}
          autoComplete="new-password"
        />
        <AuthField
          icon={Lock}
          placeholder="Confirm Password"
          type="password"
          value={confirm}
          onChange={setConfirm}
          autoComplete="new-password"
        />

        <label className="flex items-start gap-3 pt-2 text-sm text-foreground">
          <input
            type="checkbox"
            checked={agree}
            onChange={(e) => setAgree(e.target.checked)}
            className="mt-0.5 h-5 w-5 shrink-0 appearance-none rounded-[4px] border border-border bg-transparent checked:bg-gold"
          />
          <span>
            I agree to the <span className="text-gold">Terms of Service</span> and{" "}
            <span className="text-gold">Privacy Policy</span>
          </span>
        </label>

        <button
          type="submit"
          disabled={loading}
          className="mt-3 w-full rounded-xl bg-gold-gradient py-4 text-base font-bold tracking-wide text-primary-foreground disabled:opacity-60"
        >
          {loading ? "SIGNING UP..." : "SIGN UP"}
        </button>
      </form>

      <p className="mt-5 text-center text-sm text-foreground">
        Already have an account?{" "}
        <Link to="/" className="font-semibold text-gold">
          Login
        </Link>
      </p>
    </AuthLayout>
  );
}
