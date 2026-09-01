import { createFileRoute } from "@tanstack/react-router";

type TgUpdate = {
  message?: { chat?: { id: number }; text?: string };
  callback_query?: {
    id: string;
    data?: string;
    message?: { chat?: { id: number }; message_id: number; text?: string; caption?: string };
  };
};

export const Route = createFileRoute("/api/public/telegram/webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { handleDepositCallback, getDepositStore, telegramCall } = await import(
          "@/lib/deposits.server"
        );

        let update: TgUpdate;
        try {
          update = (await request.json()) as TgUpdate;
        } catch {
          return Response.json({ ok: true });
        }

        const cb = update.callback_query;
        const cbChatId = cb?.message?.chat?.id;

        if (cb && cb.data && cbChatId) {
          const source = cb.message?.caption ?? cb.message?.text ?? "";
          let text = "Done";
          try {
            if (cb.data.startsWith("wd:")) {
              const { handleWithdrawCallback } = await import("@/lib/withdrawals.server");
              text = await handleWithdrawCallback(
                cb.data,
                cbChatId,
                cb.message!.message_id,
                source,
              );
            } else if (cb.data.startsWith("dep:")) {
              text = await handleDepositCallback(cb.data, cbChatId, cb.message!.message_id, source);
            } else {
              text = "Unknown action";
            }
          } catch (err) {
            console.error("Callback handling failed:", err);
            text = err instanceof Error ? err.message.slice(0, 190) : "Error";
          }

          // Always answer, otherwise Telegram keeps the button spinner running.
          await telegramCall("answerCallbackQuery", {
            callback_query_id: cb.id,
            text,
            show_alert: false,
          }).catch((e) => console.error("answerCallbackQuery failed:", e));

          return Response.json({ ok: true });
        }

        const chatId = update.message?.chat?.id;
        if (chatId && update.message?.text?.startsWith("/start")) {
          const store = await getDepositStore();
          await store.setAdminChatId(chatId);
          await telegramCall("sendMessage", {
            chat_id: chatId,
            text: `Cobra Poker admin bot is ready. Chat ID: ${chatId}\nDeposit and withdrawal requests will arrive here.`,
          }).catch((e) => console.error(e));
        }

        return Response.json({ ok: true });
      },
    },
  },
});
