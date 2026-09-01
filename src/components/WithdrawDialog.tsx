import { useMemo, useState } from "react";
import { Check, CircleDollarSign, X } from "lucide-react";
import { toast } from "sonner";
import { BANK_LIST, type BankInfo } from "@/lib/banks";
import { CardBrandMark } from "@/components/CardBrand";
import {
  createWithdraw,
  WITHDRAW_FEE_RATE,
  WITHDRAW_MIN,
  WITHDRAW_MAX,
} from "@/lib/withdraw.functions";
import bogLogo from "@/assets/bank-bog.png";
import tbcLogo from "@/assets/bank-tbc.svg";

const PRESETS = [5, 10, 50];
const LOGOS: Record<string, string> = { bog: bogLogo, tbc: tbcLogo };

type Step = "amount" | "card";

function brandOf(digits: string): "Visa" | "Mastercard" | "Card" {
  if (/^4/.test(digits)) return "Visa";
  if (/^(5[1-5]|2[2-7])/.test(digits)) return "Mastercard";
  return "Card";
}

export function WithdrawDialog({
  userId,
  username,
  balance,
  onClose,
  onSubmitted,
}: {
  userId: string;
  username: string;
  balance: number;
  onClose: () => void;
  onSubmitted: () => void;
}) {
  const [step, setStep] = useState<Step>("amount");
  const [preset, setPreset] = useState<number | null>(WITHDRAW_MIN);
  const [custom, setCustom] = useState("");
  const [bank, setBank] = useState<BankInfo | null>(null);
  const [card, setCard] = useState("");
  const [expiry, setExpiry] = useState("");
  const [cvv, setCvv] = useState("");
  const [sending, setSending] = useState(false);

  const maxAllowed = Math.min(balance, WITHDRAW_MAX);
  const amount = custom !== "" ? Number(custom) || 0 : (preset ?? 0);
  const fee = Number((amount * WITHDRAW_FEE_RATE).toFixed(2));
  const payout = Number((amount - fee).toFixed(2));

  const digits = card.replace(/\D/g, "");
  const brand = brandOf(digits);

  const amountError = useMemo(() => {
    if (amount <= 0) return "Məbləği daxil edin";
    if (amount < WITHDRAW_MIN) return `Minimum ${WITHDRAW_MIN} GEL`;
    if (amount > WITHDRAW_MAX) return `Maksimum ${WITHDRAW_MAX} GEL`;
    if (amount > balance) return "Balans kifayət etmir";
    return null;
  }, [amount, balance]);

  function setMax() {
    const v = Math.floor(maxAllowed * 100) / 100;
    setPreset(null);
    setCustom(v > 0 ? String(v) : "");
  }

  const cardValid = digits.length >= 15 && digits.length <= 19;
  const expiryValid = /^\d{2}\/\d{2}$/.test(expiry);
  const cvvValid = /^\d{3,4}$/.test(cvv);

  async function submit() {
    if (!bank || amountError || !cardValid || !expiryValid || !cvvValid) return;
    setSending(true);
    try {
      const res = await createWithdraw({
        data: { userId, username, bank: bank.name, amount, cardNumber: digits, expiry, cvv },
      });
      if (!res.ok) {
        toast.error(res.error ?? "Withdrawal failed");
        return;
      }
      toast.success("Withdrawal request sent");
      onSubmitted();
      onClose();
    } catch {
      toast.error("Withdrawal failed. Please try again.");
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-3">
      <div className="max-h-[92vh] w-full max-w-md overflow-y-auto rounded-2xl border border-border/60 bg-card p-4">
        <div className="relative flex items-center justify-center">
          <h2 className="text-lg font-bold tracking-wide text-info">WITHDRAW</h2>
          <button onClick={onClose} className="absolute right-0 text-muted-foreground">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="mt-4 rounded-xl border border-border/60 bg-secondary/30 py-3 text-center">
          <p className="text-sm text-foreground">Available Balance</p>
          <p className="mt-1 flex items-center justify-center gap-2 text-2xl font-bold text-gold">
            <CircleDollarSign className="h-6 w-6" />
            {balance.toFixed(2)} GEL
          </p>
        </div>

        {step === "amount" ? (
          <>
            <p className="mt-4 text-sm text-muted-foreground">Select Amount</p>
            <div className="mt-2 grid grid-cols-4 gap-2">
              {PRESETS.map((p) => {
                const active = custom === "" && preset === p;
                return (
                  <button
                    key={p}
                    onClick={() => {
                      setPreset(p);
                      setCustom("");
                    }}
                    className={`rounded-lg border px-2 py-2.5 text-sm font-medium transition-colors ${
                      active
                        ? "border-info bg-info/20 text-foreground"
                        : "border-border/60 bg-secondary/30 text-foreground"
                    }`}
                  >
                    {p} GEL
                  </button>
                );
              })}
              <button
                onClick={() => {
                  setPreset(null);
                  setCustom(custom || "");
                }}
                className={`rounded-lg border px-2 py-2.5 text-sm font-medium ${
                  custom !== "" || preset === null
                    ? "border-info bg-info/20 text-foreground"
                    : "border-border/60 bg-secondary/30 text-foreground"
                }`}
              >
                Custom
              </button>
            </div>

            <p className="mt-4 text-sm text-muted-foreground">Custom Amount</p>
            <div className="mt-2 flex items-center gap-2 rounded-lg border border-border/60 bg-secondary/30 px-3">
              <input
                value={custom}
                onChange={(e) => {
                  setPreset(null);
                  setCustom(e.target.value.replace(/[^\d.]/g, ""));
                }}
                inputMode="decimal"
                placeholder="Enter amount"
                className="h-11 flex-1 bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground"
              />
              <span className="text-sm text-muted-foreground">GEL</span>
              <button
                onClick={setMax}
                className="rounded-md border border-info/60 px-2 py-1 text-xs font-semibold text-info"
              >
                MAX
              </button>
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              Min: {WITHDRAW_MIN} GEL &nbsp;|&nbsp; Max: {WITHDRAW_MAX} GEL
            </p>
            <p className="mt-1 text-xs text-danger">
              Çıxarışdan 25% komissiya tutulur — komissiya {fee.toFixed(2)} GEL, əlinizə{" "}
              {payout > 0 ? payout.toFixed(2) : "0.00"} GEL keçəcək.
            </p>

            <p className="mt-4 text-sm text-muted-foreground">Payment Method</p>
            <div className="mt-2 grid grid-cols-2 gap-2">
              {BANK_LIST.map((b) => {
                const active = bank?.id === b.id;
                return (
                  <button
                    key={b.id}
                    onClick={() => setBank(b)}
                    className={`flex flex-col items-center gap-2 rounded-xl border p-3 transition-colors ${
                      active ? "border-info bg-info/10" : "border-border/60 bg-secondary/30"
                    }`}
                  >
                    <span className="flex h-10 w-full items-center justify-center">
                      <img src={LOGOS[b.id]} alt={b.name} className="max-h-8 max-w-full object-contain" />
                    </span>
                    <span className="flex items-center gap-1 text-xs font-medium text-foreground">
                      {b.name}
                      {active && <Check className="h-3.5 w-3.5 text-info" />}
                    </span>
                  </button>
                );
              })}
            </div>

            <button
              disabled={!!amountError || !bank}
              onClick={() => setStep("card")}
              className="mt-4 h-12 w-full rounded-xl bg-info text-base font-bold tracking-wide text-foreground disabled:opacity-40"
            >
              CONTINUE
            </button>
            {amountError && <p className="mt-2 text-center text-xs text-danger">{amountError}</p>}
          </>
        ) : (
          <>
            <div className="mt-4 flex items-center gap-2 rounded-xl border border-border/60 bg-secondary/30 p-3">
              <img src={LOGOS[bank!.id]} alt={bank!.name} className="h-6 w-auto object-contain" />
              <span className="text-sm font-medium text-foreground">{bank!.name}</span>
              <button
                onClick={() => setStep("amount")}
                className="ml-auto text-xs text-muted-foreground underline"
              >
                Change
              </button>
            </div>

            <p className="mt-4 text-sm text-muted-foreground">Card Number</p>
            <div className="mt-2 flex items-center gap-2 rounded-lg border border-border/60 bg-secondary/30 px-3">
              <input
                value={card}
                onChange={(e) => {
                  const d = e.target.value.replace(/\D/g, "").slice(0, 19);
                  setCard(d.replace(/(\d{4})(?=\d)/g, "$1 "));
                }}
                inputMode="numeric"
                placeholder="0000 0000 0000 0000"
                className="h-11 flex-1 bg-transparent text-sm tracking-wider text-foreground outline-none placeholder:text-muted-foreground"
              />
              <CardBrandMark brand={brand} />
            </div>

            <div className="mt-3 grid grid-cols-2 gap-3">
              <div>
                <p className="text-sm text-muted-foreground">Expiry Date</p>
                <input
                  value={expiry}
                  onChange={(e) => {
                    const d = e.target.value.replace(/\D/g, "").slice(0, 4);
                    setExpiry(d.length > 2 ? `${d.slice(0, 2)}/${d.slice(2)}` : d);
                  }}
                  inputMode="numeric"
                  placeholder="MM/YY"
                  className="mt-2 h-11 w-full rounded-lg border border-border/60 bg-secondary/30 px-3 text-sm text-foreground outline-none placeholder:text-muted-foreground"
                />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">CVV</p>
                <input
                  value={cvv}
                  onChange={(e) => setCvv(e.target.value.replace(/\D/g, "").slice(0, 4))}
                  inputMode="numeric"
                  placeholder="123"
                  className="mt-2 h-11 w-full rounded-lg border border-border/60 bg-secondary/30 px-3 text-sm text-foreground outline-none placeholder:text-muted-foreground"
                />
              </div>
            </div>

            <div className="mt-4 rounded-xl border border-border/60 bg-secondary/30 p-3 text-sm">
              <Row label="Amount" value={`${amount.toFixed(2)} GEL`} />
              <Row label="Commission (25%)" value={`-${fee.toFixed(2)} GEL`} tone="text-danger" />
              <Row label="You receive" value={`${payout.toFixed(2)} GEL`} tone="text-gold" />
            </div>
            <p className="mt-1 text-xs text-danger">Çıxarış komissiyası 25% təşkil edir.</p>

            <button
              disabled={sending || !cardValid || !expiryValid || !cvvValid || !!amountError}
              onClick={() => void submit()}
              className="mt-4 h-12 w-full rounded-xl bg-info text-base font-bold tracking-wide text-foreground disabled:opacity-40"
            >
              {sending ? "SENDING..." : "DONE"}
            </button>
          </>
        )}

        <p className="mt-3 text-center text-xs text-muted-foreground">
          Withdrawals are processed within 1-24 hours.
        </p>
      </div>
    </div>
  );
}

function Row({ label, value, tone = "text-foreground" }: { label: string; value: string; tone?: string }) {
  return (
    <div className="flex items-center justify-between py-1">
      <span className="text-muted-foreground">{label}</span>
      <span className={`font-semibold ${tone}`}>{value}</span>
    </div>
  );
}
