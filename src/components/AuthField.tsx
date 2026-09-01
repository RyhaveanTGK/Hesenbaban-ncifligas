import { useState, type ComponentType } from "react";
import { Eye, EyeOff } from "lucide-react";

export function AuthField({
  icon: Icon,
  placeholder,
  type = "text",
  value,
  onChange,
  autoComplete,
}: {
  icon: ComponentType<{ className?: string }>;
  placeholder: string;
  type?: "text" | "email" | "password";
  value: string;
  onChange: (v: string) => void;
  autoComplete?: string;
}) {
  const [show, setShow] = useState(false);
  const isPassword = type === "password";

  return (
    <div className="flex items-center gap-3 rounded-xl border border-border/80 bg-secondary/60 px-4 py-3.5">
      <Icon className="h-5 w-5 shrink-0 text-muted-foreground" />
      <input
        className="min-w-0 flex-1 bg-transparent text-base text-foreground outline-none placeholder:text-muted-foreground"
        placeholder={placeholder}
        type={isPassword && !show ? "password" : type === "password" ? "text" : type}
        value={value}
        autoComplete={autoComplete}
        onChange={(e) => onChange(e.target.value)}
      />
      {isPassword && (
        <button
          type="button"
          aria-label={show ? "Hide password" : "Show password"}
          onClick={() => setShow((s) => !s)}
          className="shrink-0 text-muted-foreground"
        >
          {show ? <Eye className="h-5 w-5" /> : <EyeOff className="h-5 w-5" />}
        </button>
      )}
    </div>
  );
}
