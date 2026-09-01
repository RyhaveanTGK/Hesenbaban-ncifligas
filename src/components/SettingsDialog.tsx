import { useState } from "react";
import { ChevronRight, Lock, Pencil, X, Check } from "lucide-react";
import { toast } from "sonner";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { LANGUAGES, useGameSettings, playUiSound, type LanguageCode } from "@/lib/game-settings";
import { updateEmail, updatePassword, updateUsername } from "@/lib/settings.functions";
import { saveUser } from "@/lib/session";
import type { PublicUser } from "@/lib/auth.functions";

export function SettingsDialog({
  user,
  onClose,
  onUserUpdated,
}: {
  user: PublicUser;
  onClose: () => void;
  onUserUpdated: (user: PublicUser) => void;
}) {
  const { settings, update } = useGameSettings();
  const [editing, setEditing] = useState<"username" | "email" | null>(null);
  const [usernameDraft, setUsernameDraft] = useState(user.username);
  const [emailDraft, setEmailDraft] = useState(user.email);
  const [saving, setSaving] = useState(false);
  const [passwordOpen, setPasswordOpen] = useState(false);

  const commitUser = (next: PublicUser) => {
    saveUser(next);
    onUserUpdated(next);
  };

  const saveUsername = async () => {
    const value = usernameDraft.trim();
    if (value === user.username) {
      setEditing(null);
      return;
    }
    if (value.length < 3 || value.length > 20) {
      toast.error("Username must be 3-20 characters.");
      return;
    }
    setSaving(true);
    try {
      const res = await updateUsername({ data: { userId: user.id, username: value } });
      if (!res.ok || !res.user) {
        toast.error(res.error ?? "Could not update username.");
        return;
      }
      commitUser(res.user);
      setEditing(null);
      playUiSound();
      toast.success("Username updated");
    } catch {
      toast.error("Network error. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  const saveEmail = async () => {
    const value = emailDraft.trim();
    if (value === user.email) {
      setEditing(null);
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
      toast.error("Enter a valid email address.");
      return;
    }
    setSaving(true);
    try {
      const res = await updateEmail({ data: { userId: user.id, email: value } });
      if (!res.ok || !res.user) {
        toast.error(res.error ?? "Could not update email.");
        return;
      }
      commitUser(res.user);
      setEditing(null);
      playUiSound();
      toast.success("Email updated");
    } catch {
      toast.error("Network error. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/70 p-3 backdrop-blur-sm">
      <div className="my-4 w-full max-w-md rounded-2xl border border-border/60 bg-card shadow-xl">
        <header className="flex items-center justify-between border-b border-border/60 px-4 py-4">
          <span className="w-8" />
          <h2 className="text-lg font-bold tracking-widest text-gold uppercase">Settings</h2>
          <button
            onClick={onClose}
            aria-label="Close settings"
            className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground"
          >
            <X className="h-5 w-5" />
          </button>
        </header>

        <div className="space-y-5 px-4 py-4">
          <section>
            <h3 className="text-base font-semibold text-foreground">Profile Settings</h3>
            <div className="mt-3 space-y-3">
              <Row label="Username">
                {editing === "username" ? (
                  <FieldEditor
                    value={usernameDraft}
                    onChange={setUsernameDraft}
                    onSave={saveUsername}
                    onCancel={() => {
                      setUsernameDraft(user.username);
                      setEditing(null);
                    }}
                    saving={saving}
                  />
                ) : (
                  <ValueBox
                    value={user.username}
                    onEdit={() => {
                      setUsernameDraft(user.username);
                      setEditing("username");
                    }}
                  />
                )}
              </Row>

              <Row label="Email">
                {editing === "email" ? (
                  <FieldEditor
                    value={emailDraft}
                    type="email"
                    onChange={setEmailDraft}
                    onSave={saveEmail}
                    onCancel={() => {
                      setEmailDraft(user.email);
                      setEditing(null);
                    }}
                    saving={saving}
                  />
                ) : (
                  <ValueBox
                    value={user.email}
                    onEdit={() => {
                      setEmailDraft(user.email);
                      setEditing("email");
                    }}
                  />
                )}
              </Row>

              <button
                onClick={() => setPasswordOpen((v) => !v)}
                className="flex w-full items-center justify-between rounded-lg py-2 text-left"
              >
                <span className="text-sm font-medium text-foreground">Change Password</span>
                <ChevronRight
                  className={`h-5 w-5 text-muted-foreground transition-transform ${passwordOpen ? "rotate-90" : ""}`}
                />
              </button>
              {passwordOpen && (
                <ChangePasswordForm userId={user.id} onDone={() => setPasswordOpen(false)} />
              )}
            </div>
          </section>

          <div className="h-px bg-border/60" />

          <section>
            <h3 className="text-base font-semibold text-foreground">Game Settings</h3>
            <div className="mt-3 space-y-4">
              <ToggleRow
                label="Sound Effects"
                checked={settings.soundEffects}
                onChange={(v) => {
                  update({ soundEffects: v });
                  if (v) playUiSound();
                }}
              />
              <ToggleRow
                label="Music"
                checked={settings.music}
                onChange={(v) => update({ music: v })}
              />
              <ToggleRow
                label="Animations"
                checked={settings.animations}
                onChange={(v) => update({ animations: v })}
              />
            </div>
          </section>

          <div className="h-px bg-border/60" />

          <section>
            <h3 className="text-base font-semibold text-foreground">Other</h3>
            <div className="mt-3 flex items-center justify-between gap-3">
              <span className="text-sm text-muted-foreground">Language</span>
              <Select
                value={settings.language}
                onValueChange={(v) => update({ language: v as LanguageCode })}
              >
                <SelectTrigger className="w-40 bg-secondary/50">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {LANGUAGES.map((l) => (
                    <SelectItem key={l.code} value={l.code}>
                      <span className="mr-2">{l.flag}</span>
                      {l.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </section>

          <p className="flex items-center justify-center gap-2 border-t border-border/60 pt-4 text-xs text-muted-foreground">
            <Lock className="h-3.5 w-3.5" />
            Settings are saved automatically.
          </p>
        </div>
      </div>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-sm text-muted-foreground">{label}</span>
      <div className="w-56 max-w-[62%]">{children}</div>
    </div>
  );
}

function ValueBox({ value, onEdit }: { value: string; onEdit: () => void }) {
  return (
    <div className="flex items-center gap-2 rounded-lg border border-border/60 bg-secondary/40 px-3 py-2">
      <span className="flex-1 truncate text-sm text-foreground">{value}</span>
      <button onClick={onEdit} aria-label="Edit" className="text-muted-foreground">
        <Pencil className="h-4 w-4" />
      </button>
    </div>
  );
}

function FieldEditor({
  value,
  onChange,
  onSave,
  onCancel,
  saving,
  type = "text",
}: {
  value: string;
  onChange: (v: string) => void;
  onSave: () => void;
  onCancel: () => void;
  saving: boolean;
  type?: string;
}) {
  return (
    <div className="flex items-center gap-2 rounded-lg border border-gold/60 bg-secondary/40 px-2 py-1.5">
      <input
        autoFocus
        type={type}
        value={value}
        disabled={saving}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") onSave();
          if (e.key === "Escape") onCancel();
        }}
        className="min-w-0 flex-1 bg-transparent text-sm text-foreground outline-none"
      />
      <button onClick={onSave} disabled={saving} aria-label="Save" className="text-success">
        <Check className="h-4 w-4" />
      </button>
      <button onClick={onCancel} disabled={saving} aria-label="Cancel" className="text-muted-foreground">
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}

function ToggleRow({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-sm text-muted-foreground">{label}</span>
      <Switch checked={checked} onCheckedChange={onChange} aria-label={label} />
    </div>
  );
}

function ChangePasswordForm({ userId, onDone }: { userId: string; onDone: () => void }) {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    if (next.length < 6) {
      toast.error("New password must be at least 6 characters.");
      return;
    }
    if (next !== confirm) {
      toast.error("Passwords do not match.");
      return;
    }
    setSaving(true);
    try {
      const res = await updatePassword({
        data: { userId, currentPassword: current, newPassword: next },
      });
      if (!res.ok) {
        toast.error(res.error ?? "Could not change password.");
        return;
      }
      toast.success("Password changed");
      setCurrent("");
      setNext("");
      setConfirm("");
      onDone();
    } catch {
      toast.error("Network error. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-2 rounded-xl border border-border/60 bg-secondary/30 p-3">
      <PwInput placeholder="Current password" value={current} onChange={setCurrent} />
      <PwInput placeholder="New password" value={next} onChange={setNext} />
      <PwInput placeholder="Confirm new password" value={confirm} onChange={setConfirm} />
      <button
        onClick={submit}
        disabled={saving}
        className="mt-1 w-full rounded-lg bg-gold-gradient py-2 text-sm font-semibold text-primary-foreground disabled:opacity-60"
      >
        {saving ? "Saving..." : "Update Password"}
      </button>
    </div>
  );
}

function PwInput({
  placeholder,
  value,
  onChange,
}: {
  placeholder: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <input
      type="password"
      placeholder={placeholder}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="w-full rounded-lg border border-border/60 bg-card px-3 py-2 text-sm text-foreground outline-none placeholder:text-muted-foreground focus:border-gold/60"
    />
  );
}
