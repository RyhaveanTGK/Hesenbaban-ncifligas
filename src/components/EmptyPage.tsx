import { AppShell } from "@/components/AppShell";
import { useAuthUser } from "@/lib/session";

export function EmptyPage({ title }: { title: string }) {
  const { ready } = useAuthUser();
  if (!ready) return null;

  return (
    <AppShell>
      <div className="rounded-2xl border border-border/60 bg-card px-6 py-16 text-center">
        <h1 className="text-xl font-bold text-foreground">{title}</h1>
        <p className="mt-2 text-sm text-muted-foreground">Coming soon</p>
      </div>
    </AppShell>
  );
}
