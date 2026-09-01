import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const depositSchema = z.object({
  userId: z.string().min(1),
  username: z.string().min(1),
  bank: z.string().min(1),
  amount: z.number().positive().max(100000),
  receipt: z.string().startsWith("data:image/").max(8_000_000),
});

export const createDeposit = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => depositSchema.parse(d))
  .handler(async ({ data }): Promise<{ ok: boolean; error?: string }> => {
    const { submitDeposit } = await import("./deposits.server");
    try {
      await submitDeposit(data);
      return { ok: true };
    } catch (err) {
      console.error("Deposit submit failed:", err);
      return { ok: false, error: err instanceof Error ? err.message : "Deposit failed." };
    }
  });

export const getBalance = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ userId: z.string().min(1) }).parse(d))
  .handler(async ({ data }): Promise<{ balance: number | null }> => {
    const { getStore } = await import("./db.server");
    const store = await getStore();
    const user = await store.findById(data.userId);
    return { balance: user ? user.chipBalance : null };
  });
