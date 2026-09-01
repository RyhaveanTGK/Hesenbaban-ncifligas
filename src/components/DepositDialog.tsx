import { useRef, useState } from "react";
import { Check, Copy, Upload, X } from "lucide-react";
import { toast } from "sonner";
import { BANK_LIST, type BankInfo } from "@/lib/banks";
import { createDeposit } from "@/lib/deposit.functions";
import bogLogo from "@/assets/bank-bog.png";
import tbcLogo from "@/assets/bank-tbc.svg";

const AMOUNTS = [10, 20, 50, 100];
const LOGOS: Record<string, string> = { bog: bogLogo, tbc: tbcLogo };

type Step = "amount" | "bank" | "details";

export function DepositDialog({
  userId,
  username,
  onClose,
  onSubmitted,
}: {
  userId: string;
  username: string;
  onClose: () => void;
  onSubmitted: () => void;
}) {
  const [step, setStep] = useState<Step>("amount");
  const [preset, setPreset] = useState<number | null>(20);
  const [custom, setCustom] = useState("");
  const [method, setMethod] = useState<"card" | "transfer">("card");
  const [bank, setBank] = useState<BankInfo | null>(null);
  const [receipt, setReceipt] = useState<string | null>(null);
  const [receiptName, setReceiptName] = useState("");
  const [sending, setSending] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const amount = custom ? Number(custom) : (preset ?? 0);

  function copy(value: string, label: string) {
    navigator.clipboard?.writeText(value.replace(/\s/g, ""));
    toast.success(`${label} copied`);
  }

  function pickFile(file?: File) {
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      toast.error("Receipt must be smaller than 5 MB");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      setReceipt(String(reader.result));
      setReceiptName(file.name);
    };
    reader.readAsDataURL(file);
  }

  async function submit() {
    if (!bank || !receipt) return;
    setSending(true);
    try {
      const res = await createDeposit({
        data: { userId, username, bank: bank.name, amount, receipt },
      });
      if (!res.ok) {
        toast.error(res.error ?? "Deposit failed");
        return;
      }
      toast.success("Deposit request sent");
      onSubmitted();
      onClose();
    } catch {
      toast.error("Deposit failed. Please try again.");
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-3">
      <div className="max-h-[92vh] w-full max-w-md overflow-y-auto rounded-2xl border border-border/70 bg-card p-4 shadow-2xl">
        <div className="relative flex items-center justify-center">
          <h2 className="text-lg font-bold tracking-wide text-success">DEPOSIT</h2>
          <button
            onClick={onClose}
            aria-label="Close"
            className="absolute right-0 text-muted-foreground"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {step === "amount" && (
          <div className="mt-5">
            <p className="text-sm font-medium text-foreground">Select Amount</p>
            <div className="mt-2 grid grid-cols-4 gap-2">
              {AMOUNTS.map((a) => {
                const active = !custom && preset === a;
                return (
                  <button
                    key={a}
                    onClick={() => {
                      setPreset(a);
                      setCustom("");
                    }}
                    className={`rounded-lg border px-2 py-3 text-sm font-semibold transition-colors ${
                      active
                        ? "border-success bg-success/15 text-foreground"
                        : "border-border/70 bg-secondary/40 text-muted-foreground"
                    }`}
                  >
                    {a} GEL
                  </button>
                );
              })}
            </div>

            <p className="mt-5 text-sm font-medium text-foreground">Custom Amount</p>
            <div className="mt-2 flex items-center rounded-lg border border-border/70 bg-secondary/30 px-3">
              <input
                inputMode="decimal"
                value={custom}
                onChange={(e) => setCustom(e.target.value.replace(/[^\d.]/g, ""))}
                placeholder="Enter amount"
                className="w-full bg-transparent py-3 text-sm text-foreground outline-none placeholder:text-muted-foreground"
              />
              <span className="text-sm text-muted-foreground">GEL</span>
            </div>

            <p className="mt-5 text-sm font-medium text-foreground">Payment Method</p>
            <div className="mt-2 grid grid-cols-2 gap-3">
              <MethodCard
                active={method === "card"}
                onClick={() => setMethod("card")}
                title="VISA"
                subtitle="Visa / Mastercard"
              />
              <MethodCard
                active={method === "transfer"}
                onClick={() => setMethod("transfer")}
                title="TRANSFER"
                subtitle="Bank Transfer"
              />
            </div>

            <button
              disabled={!amount}
              onClick={() => setStep("bank")}
              className="mt-6 w-full rounded-xl bg-success py-3 text-base font-bold tracking-wide text-success-foreground disabled:opacity-50"
            >
              DEPOSIT
            </button>
            <p className="mt-3 text-center text-xs text-muted-foreground">
              All transactions are secure and encrypted.
            </p>
          </div>
        )}

        {step === "bank" && (
          <div className="mt-5">
            <p className="text-sm font-medium text-foreground">
              Select Bank — {amount.toFixed(2)} GEL
            </p>
            <div className="mt-3 grid grid-cols-2 gap-3">
              {BANK_LIST.map((b) => (
                <button
                  key={b.id}
                  onClick={() => {
                    setBank(b);
                    setStep("details");
                  }}
                  className="flex flex-col items-center gap-3 rounded-xl border border-border/70 bg-secondary/30 p-4 transition-colors hover:border-success"
                >
                  <img
                    src={LOGOS[b.id]}
                    alt={`${b.name} logo`}
                    className="h-12 w-auto max-w-[100px] object-contain"
                  />
                  <span className="text-center text-xs font-semibold text-foreground">{b.name}</span>
                </button>
              ))}
            </div>
            <button
              onClick={() => setStep("amount")}
              className="mt-5 w-full rounded-xl border border-border/70 py-3 text-sm font-medium text-muted-foreground"
            >
              Back
            </button>
          </div>
        )}

        {step === "details" && bank && (
          <div className="mt-5">
            <div className="flex items-center gap-3">
              <img src={LOGOS[bank.id]} alt={`${bank.name} logo`} className="h-9 w-auto object-contain" />
              <div>
                <p className="text-sm font-semibold text-foreground">{bank.name}</p>
                <p className="text-xs text-muted-foreground">{amount.toFixed(2)} GEL</p>
              </div>
            </div>

            <div className="mt-4 space-y-2">
              <CopyRow label="IBAN" value={bank.iban} onCopy={copy} />
              <CopyRow label="Card Number" value={bank.card} onCopy={copy} />
              <CopyRow label="Recipient" value={bank.recipient} onCopy={copy} />
            </div>

            <p className="mt-5 text-sm font-medium text-foreground">Receipt (Dekont)</p>
            <button
              onClick={() => fileRef.current?.click()}
              className="mt-2 flex w-full flex-col items-center gap-2 rounded-xl border border-dashed border-border/70 bg-secondary/20 px-3 py-6 text-center"
            >
              {receipt ? (
                <>
                  <img src={receipt} alt="Receipt preview" className="max-h-40 rounded-lg object-contain" />
                  <span className="text-xs text-muted-foreground">{receiptName} — tap to change</span>
                </>
              ) : (
                <>
                  <Upload className="h-6 w-6 text-muted-foreground" />
                  <span className="text-sm text-muted-foreground">Upload receipt image</span>
                </>
              )}
            </button>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => pickFile(e.target.files?.[0])}
            />

            <button
              disabled={!receipt || sending}
              onClick={submit}
              className="mt-5 flex w-full items-center justify-center gap-2 rounded-xl bg-success py-3 text-base font-bold tracking-wide text-success-foreground disabled:opacity-50"
            >
              <Check className="h-5 w-5" /> {sending ? "Sending…" : "DONE"}
            </button>
            <button
              onClick={() => setStep("bank")}
              className="mt-3 w-full rounded-xl border border-border/70 py-3 text-sm font-medium text-muted-foreground"
            >
              Back
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function MethodCard({
  active,
  onClick,
  title,
  subtitle,
}: {
  active: boolean;
  onClick: () => void;
  title: string;
  subtitle: string;
}) {
  return (
    <button
      onClick={onClick}
      className={`relative rounded-xl border px-3 py-5 text-center transition-colors ${
        active ? "border-success bg-success/10" : "border-border/70 bg-secondary/30"
      }`}
    >
      {active && (
        <span className="absolute right-2 top-2 flex h-5 w-5 items-center justify-center rounded-full bg-success">
          <Check className="h-3 w-3 text-success-foreground" />
        </span>
      )}
      <p className="text-lg font-black italic tracking-wider text-foreground">{title}</p>
      <p className="mt-2 text-xs text-muted-foreground">{subtitle}</p>
    </button>
  );
}

function CopyRow({
  label,
  value,
  onCopy,
}: {
  label: string;
  value: string;
  onCopy: (v: string, label: string) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-xl border border-border/70 bg-secondary/30 px-3 py-3">
      <div className="min-w-0">
        <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</p>
        <p className="truncate text-sm font-semibold text-foreground">{value}</p>
      </div>
      <button
        onClick={() => onCopy(value, label)}
        aria-label={`Copy ${label}`}
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-border/70 text-muted-foreground"
      >
        <Copy className="h-4 w-4" />
      </button>
    </div>
  );
}
