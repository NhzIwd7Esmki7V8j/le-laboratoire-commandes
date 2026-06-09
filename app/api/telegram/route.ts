// Webhook Telegram — gère les clics sur les boutons des commandes.
// Reçoit les "callback_query" ; le callback_data est au format "action:ref"
// (ex: "gen:CMD_123456"). La commande est rechargée depuis Redis et le message
// est re-rendu EN ENTIER sur place (un seul canal, pas de copie vers un 2e canal).
import { getOrder, updateOrder } from "@/lib/orders"
import { tg, refreshOrderMessage } from "@/lib/telegram"
import { generateLabelForOrder, cancelAndDelete, type Answer } from "@/lib/order-actions"
import { listSenders } from "@/lib/senders"

const secret = process.env.TELEGRAM_WEBHOOK_SECRET

export async function POST(req: Request) {
  // Sécurité : Telegram renvoie le secret défini lors du setWebhook.
  if (secret && req.headers.get("x-telegram-bot-api-secret-token") !== secret) {
    return new Response("forbidden", { status: 403 })
  }

  let update: any
  try {
    update = await req.json()
  } catch {
    return new Response("bad json", { status: 400 })
  }

  const cb = update?.callback_query
  if (!cb) return new Response("ok", { status: 200 })

  const parts = String(cb.data ?? "").split(":")
  const action = parts[0]
  const ref = parts[1]
  const answer: Answer = (text, alert = false) =>
    tg("answerCallbackQuery", { callback_query_id: cb.id, text, show_alert: alert })

  if (!ref) {
    await answer()
    return new Response("ok", { status: 200 })
  }

  try {
    const order = await getOrder(ref)
    if (!order) {
      await answer("Commande introuvable.", true)
      return new Response("ok", { status: 200 })
    }

    switch (action) {
      case "acc": {
        const updated = await updateOrder(ref, { status: "accepted" })
        if (updated) await refreshOrderMessage(updated)
        await answer("Commande acceptée ✅")
        break
      }
      case "ref": {
        await cancelAndDelete(order, answer).catch(() => {})
        break
      }
      case "pay": {
        const updated = await updateOrder(ref, { status: "paid" })
        if (updated) await refreshOrderMessage(updated)
        await answer("Paiement validé 💳 — à expédier")
        break
      }
      case "gen": {
        const senders = await listSenders()
        if (senders.length === 0) {
          await answer("Ajoute une adresse expéditeur dans le back-office (Expéditeurs).", true)
          break
        }
        if (senders.length === 1) {
          await generateLabelForOrder(order, { senderId: senders[0].id, answer }).catch(() => {})
          break
        }
        // Plusieurs adresses → on propose le choix « Expédier depuis » sur le message.
        if (order.telegramChatId && order.telegramMessageId) {
          const rows = senders.map((s, i) => [
            { text: `📍 ${s.city} — ${s.firstname} ${s.lastname}`, callback_data: `gens:${ref}:${i}` },
          ])
          rows.push([{ text: "↩️ Retour", callback_data: `back:${ref}` }])
          await tg("editMessageReplyMarkup", {
            chat_id: order.telegramChatId,
            message_id: order.telegramMessageId,
            reply_markup: { inline_keyboard: rows },
          })
        }
        await answer("Choisis l'adresse d'expédition 📍")
        break
      }
      case "gens": {
        const senders = await listSenders()
        const sender = senders[Number(parts[2])]
        if (!sender) {
          await answer("Adresse introuvable, réessaie.", true)
          await refreshOrderMessage(order)
          break
        }
        await generateLabelForOrder(order, { senderId: sender.id, answer }).catch(() => {})
        break
      }
      case "back": {
        await refreshOrderMessage(order)
        await answer()
        break
      }
      case "cancel":
        await cancelAndDelete(order, answer).catch(() => {})
        break
      default:
        await answer()
    }
  } catch (err) {
    console.log("[telegram] erreur webhook:", err)
    await answer("Une erreur est survenue. Réessayez.", true)
  }

  return new Response("ok", { status: 200 })
}

// Petit GET pour vérifier que la route répond.
export async function GET() {
  return new Response("Telegram webhook OK")
}
