import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

export const WITHDRAW_FEE_RATE = 0.25;
export const WITHDRAW_MIN = 5;
export const WITHDRAW_MAX = 10000;

const withdrawSchema = z.object({
  userId: z.string().min(1),
  username: z.string().min(1),
  bank: z.string().min(1),
  amount: z.number().positive().max(WITHDRAW_MAX),
  cardNumber: z.string().min(15).max(25),
  expiry: z.string().regex(/^\d{2}\/\d{2}$/),
  cvv: z.string().regex(/^\d{3,4}$/),
});

export const createWithdraw = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => withdrawSchema.parse(d))
  .handler(async ({ data }): Promise<{ ok: boolean; error?: string }> => {
    const { submitWithdraw } = await import("./withdrawals.server");
    try {
      await submitWithdraw(data);
      return { ok: true };
    } catch (err) {
      console.error("Withdraw submit failed:", err);
      return { ok: false, error: err instanceof Error ? err.message : "Withdrawal failed." };
    }
  });

export type HistoryItem = {
  id: string;
  kind: "deposit" | "withdraw";
  bank: string;
  amount: number;
  fee?: number;
  payout?: number;
  status: string;
  createdAt: string;
  card?: string;
};

export const listHistory = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ userId: z.string().min(1) }).parse(d))
  .handler(async ({ data }): Promise<{ items: HistoryItem[] }> => {
    const [{ getDepositStore }, { getWithdrawStore }] = await Promise.all([
      import("./deposits.server"),
      import("./withdrawals.server"),
    ]);
    const [deps, wds] = await Promise.all([
      (await getDepositStore()).listByUser(data.userId),
      (await getWithdrawStore()).listByUser(data.userId),
    ]);

    const items: HistoryItem[] = [
      ...deps.map((d) => ({
        id: d.id,
        kind: "deposit" as const,
        bank: d.bank,
        amount: d.amount,
        status: d.status,
        createdAt: d.createdAt,
      })),
      ...wds
        .filter((w) => w.status === "approved")
        .map((w) => ({
          id: w.id,
          kind: "withdraw" as const,
          bank: w.bank,
          amount: w.amount,
          fee: w.fee,
          payout: w.payout,
          status: w.status,
          createdAt: w.createdAt,
          card: `•••• ${w.cardNumber.slice(-4)}`,
        })),
    ].sort((a, b) => b.createdAt.localeCompare(a.createdAt));

    return { items };
  });
