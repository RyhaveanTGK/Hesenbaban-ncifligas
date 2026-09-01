import { createFileRoute } from "@tanstack/react-router";

type TgUpdate = {
  message?: { chat?: { id: number }; text?: string };
  callback_query?: {
    id: string;
    data?: string;
    message?: { chat?: { id: number }; message_id: number };
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
        if (cb?.data?.startsWith("wd:") && cb.message?.chat?.id) {
          const { handleWithdrawCallback } = await import("@/lib/withdrawals.server");
          let text = "Done";
          try {
            text = await handleWithdrawCallback(cb.data, cb.message.chat.id, cb.message.message_id);
          } catch (err) {
            console.error("Withdraw callback handling failed:", err);
            text = "Error";
          }
          await telegramCall("answerCallbackQuery", { callback_query_id: cb.id, text }).catch((e) =>
            console.error(e),
          );
          return Response.json({ ok: true });
        }
        if (cb?.data?.startsWith("dep:") && cb.message?.chat?.id) {
          let text = "Done";
          try {
            text = await handleDepositCallback(cb.data, cb.message.chat.id, cb.message.message_id);
          } catch (err) {
            console.error("Callback handling failed:", err);
            text = "Error";
          }
          await telegramCall("answerCallbackQuery", { callback_query_id: cb.id, text }).catch(
            (e) => console.error(e),
          );
          return Response.json({ ok: true });
        }

        const chatId = update.message?.chat?.id;
        if (chatId && update.message?.text?.startsWith("/start")) {
          const store = await getDepositStore();
          await store.setAdminChatId(chatId);
          await telegramCall("sendMessage", {
            chat_id: chatId,
            text: "Cobra Poker admin bot is ready. Deposit requests will arrive here.",
          }).catch((e) => console.error(e));
        }

        return Response.json({ ok: true });
      },
    },
  },
});
