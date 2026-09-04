/**
 * Telegram Webhook Handler - Fixed Version
 * Place this content in: src/routes/api/public/telegram/webhook.ts
 */

import { createFileRoute } from "@tanstack/react-router";

type TgUpdate = {
  update_id?: number;
  message?: { chat?: { id: number }; text?: string };
  callback_query?: {
    id: string;
    from?: { id: number; username?: string };
    data?: string;
    message?: { chat?: { id: number }; message_id: number; text?: string; caption?: string };
  };
};

export const Route = createFileRoute("/api/public/telegram/webhook-handler")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        let update: TgUpdate;
        try {
          update = (await request.json()) as TgUpdate;
          console.log(`[WEBHOOK] Received update:`, JSON.stringify(update, null, 2));
        } catch (err) {
          console.error(`[WEBHOOK] JSON parse error:`, err);
          return Response.json({ ok: true });
        }

        try {
          const { handleDepositCallback, getDepositStore, telegramCall } = await import(
            "@/lib/deposits.server"
          );

          const cb = update.callback_query;
          
          if (!cb) {
            console.log(`[WEBHOOK] No callback_query in update`);
            // Handle message /start
            const chatId = update.message?.chat?.id;
            if (chatId && update.message?.text?.startsWith("/start")) {
              console.log(`[WEBHOOK] /start from chat: ${chatId}`);
              const store = await getDepositStore();
              await store.setAdminChatId(chatId);
              await telegramCall("sendMessage", {
                chat_id: chatId,
                text: `Cobra Poker admin bot is ready. Chat ID: ${chatId}\nDeposit and withdrawal requests will arrive here.`,
              }).catch((e) => console.error("[WEBHOOK] sendMessage error:", e));
            }
            return Response.json({ ok: true });
          }

          const cbChatId = cb.message?.chat?.id;
          const cbData = cb.data;
          const cbMessageId = cb.message?.message_id;
          const cbId = cb.id;

          console.log(`[WEBHOOK] Callback received:`);
          console.log(`  - callback_query_id: ${cbId}`);
          console.log(`  - data: ${cbData}`);
          console.log(`  - chat_id: ${cbChatId}`);
          console.log(`  - message_id: ${cbMessageId}`);

          if (!cbData || !cbChatId || !cbMessageId) {
            console.error(`[WEBHOOK] Missing required callback fields`);
            await telegramCall("answerCallbackQuery", {
              callback_query_id: cbId,
              text: "Error: Missing data",
              show_alert: true,
            }).catch(() => {});
            return Response.json({ ok: true });
          }

          const source = cb.message?.caption ?? cb.message?.text ?? "";
          console.log(`[WEBHOOK] Message source length: ${source.length}`);

          let text = "Processing...";
          
          // Start background processing - DON'T AWAIT (fire and forget)
          // This ensures we respond to Telegram quickly (< 5s)
          // even if MongoDB is slow
          (async () => {
            try {
              if (cbData.startsWith("wd:")) {
                console.log(`[WEBHOOK] Handling withdrawal callback (background)`);
                const { handleWithdrawCallback } = await import("@/lib/withdrawals.server");
                text = await handleWithdrawCallback(cbData, cbChatId, cbMessageId, source);
                console.log(`[WEBHOOK] Withdrawal callback result: ${text}`);
              } else if (cbData.startsWith("dep:")) {
                console.log(`[WEBHOOK] Handling deposit callback (background)`);
                text = await handleDepositCallback(cbData, cbChatId, cbMessageId, source);
                console.log(`[WEBHOOK] Deposit callback result: ${text}`);
              } else {
                console.warn(`[WEBHOOK] Unknown callback data prefix: ${cbData.substring(0, 10)}`);
                text = "Unknown action";
              }
            } catch (err) {
              console.error(`[WEBHOOK] Callback handling error:`, err);
              text = err instanceof Error ? err.message.slice(0, 190) : "Error occurred";
            }
          })().catch((e) => console.error("[WEBHOOK] Background processing error:", e));

          // ALWAYS answer callback query immediately (< 5s)
          try {
            console.log(`[WEBHOOK] Answering callback query: ${cbId}`);
            await telegramCall("answerCallbackQuery", {
              callback_query_id: cbId,
              text: "Processing...",  // Don't wait for actual result
              show_alert: false,
            });
            console.log(`[WEBHOOK] Callback query answered successfully`);
          } catch (e) {
            console.error("[WEBHOOK] answerCallbackQuery failed:", e);
          }

          return Response.json({ ok: true });
        } catch (err) {
          console.error(`[WEBHOOK] Critical error:`, err);
          return Response.json({ ok: true }); // Always return 200 to Telegram
        }
      },
    },
  },
});
