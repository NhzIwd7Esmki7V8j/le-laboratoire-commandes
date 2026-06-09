// Webhook Telegram — gère les clics sur les boutons des commandes.
// Reçoit les "callback_query" ; le callback_data est au format "action:ref"
// (ex: "gen:CMD_123456"). La commande est rechargée depuis Redis et le message
// est re-rendu EN ENTIER sur place (un seul canal, pas de copie vers un 2e canal).
import { getOrder, updateOrder } from "@/lib/orders"
import { tg, refreshOrderMessage } from "@/lib/telegram"
import { generateLabelForOrder, cancelLabelForOrder, type Answer } from "@/lib/order-actions"

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

  const [action, ref] = String(cb.data ?? "").split(":")
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
        const updated = await updateOrder(ref, { status: "cancelled" })
        if (updated) await refreshOrderMessage(updated)
        await answer("Commande annulée ❌")
        break
      }
      case "gen":
        await generateLabelForOrder(order, answer).catch(() => {})
        break
      case "cancel":
        await cancelLabelForOrder(order, answer).catch(() => {})
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
