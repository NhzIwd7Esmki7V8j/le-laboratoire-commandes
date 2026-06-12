// Webhook Telegram — gère les clics sur les boutons des commandes.
// Reçoit les "callback_query" ; le callback_data est au format "action:ref"
// (ex: "gen:CMD_123456"). La commande est rechargée depuis Redis et le message
// est re-rendu EN ENTIER sur place (un seul canal, pas de copie vers un 2e canal).
import { getOrder, updateOrder, listOrders } from "@/lib/orders"
import { redis } from "@/lib/redis"
import { tg, refreshOrderMessage, refreshCustomerMessage } from "@/lib/telegram"
import { cancelAndDelete, type Answer } from "@/lib/order-actions"

const secret = process.env.TELEGRAM_WEBHOOK_SECRET
const ADMIN_CHAT = process.env.TELEGRAM_CHAT_ID

// Prix estimé d'un bordereau (FR domicile ~7,59 / FR relais ~6,89 / Belgique ~14,99).
function estLabelEur(o: { pays?: string; deliveryMode?: string }): number {
  if (o.pays === "BE") return 14.99
  return o.deliveryMode === "relais" ? 6.89 : 7.59
}

// /colis → demande CONFIRMATION (nombre + total estimé) avant de payer, pour qu'un simple
// clic ne déclenche jamais un gros paiement par accident.
async function askDayBatchConfirm(chatId: number): Promise<void> {
  const paid = await listOrders("paid")
  if (!paid.length) {
    await tg("sendMessage", { chat_id: chatId, text: "📭 Aucune commande payée à expédier pour le moment." })
    return
  }
  const total = paid.reduce((s, o) => s + estLabelEur(o), 0)
  await tg("sendMessage", {
    chat_id: chatId,
    parse_mode: "HTML",
    text:
      `🛒 <b>Expédition du jour</b>\n\n` +
      `📦 <b>${paid.length}</b> commande(s) prête(s)\n` +
      `💶 Total estimé : <b>~${total.toFixed(2)} €</b>\n\n` +
      `⚠️ Confirme pour PAYER et expédier tout le lot en une fois.`,
    reply_markup: {
      inline_keyboard: [[{ text: `✅ Payer ${paid.length} colis (~${total.toFixed(2)} €)`, callback_data: "dobatch:ALL" }]],
    },
  })
}

// 📦 Expédie TOUTES les commandes payées en une fois (après confirmation) :
// chaque colis est ajouté au panier (robot), puis tout est payé en un seul paiement,
// déposé sur le Drive, et le numéro de suivi est envoyé à chaque client.
async function handleDayBatch(chatId: number): Promise<void> {
  const paid = await listOrders("paid")
  if (!paid.length) {
    await tg("sendMessage", { chat_id: chatId, text: "📭 Aucune commande payée à expédier pour le moment." })
    return
  }
  // Verrou (passe en « génération ») + ajout au panier de chaque commande, puis paiement du lot.
  for (const o of paid) {
    await updateOrder(o.ref, { status: "generating" })
    await redis.rpush("robot:queue", `cart:${o.ref}`)
  }
  await redis.rpush("robot:queue", "pay")
  await tg("sendMessage", {
    chat_id: chatId,
    parse_mode: "HTML",
    text:
      `📦 <b>Expédition du jour lancée — ${paid.length} commande(s)</b>\n\n` +
      `• Ajout des colis au panier\n• Paiement groupé en une fois\n• Dépôt des bordereaux sur le Drive\n• Envoi du numéro de suivi à chaque client\n\n` +
      `⏳ Garde le robot (veilleur) allumé sur le PC — ça tourne tout seul.`,
  })
}

// Le client démarre le bot avec "/start CMD_xxx" → on lie son chat à la commande
// pour pouvoir lui envoyer son suivi automatiquement à l'expédition.
async function handleStart(msg: any): Promise<void> {
  const chatId = msg?.chat?.id
  if (!chatId) return
  const ref = String(msg.text).split(/\s+/)[1]?.trim()
  if (!ref) {
    await tg("sendMessage", {
      chat_id: chatId,
      text: "👋 Bonjour ! Passe ta commande sur notre site, puis clique « Recevoir mon suivi » pour être notifié ici dès l'expédition.",
    })
    return
  }
  const order = await getOrder(ref)
  if (!order) {
    await tg("sendMessage", { chat_id: chatId, text: "Commande introuvable — vérifie ton lien de suivi." })
    return
  }
  await updateOrder(ref, { customerChatId: chatId })
  await tg("sendMessage", {
    chat_id: chatId,
    text: `✅ C'est noté ! Tu recevras ton numéro de suivi ici dès que ta commande ${ref} sera expédiée. 📦`,
  })
}

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

  // Message texte (message direct OU post du canal admin).
  const msg = update?.message || update?.channel_post
  const msgText = typeof msg?.text === "string" ? msg.text.trim() : ""

  // 📦 Commande ADMIN : /colis — UNIQUEMENT dans le canal où arrivent les commandes
  // (TELEGRAM_CHAT_ID). Ignorée partout ailleurs (message privé, autre groupe…).
  if (msgText.startsWith("/colis")) {
    if (ADMIN_CHAT && String(msg?.chat?.id) === ADMIN_CHAT) {
      await askDayBatchConfirm(msg.chat.id).catch(() => {})
    }
    return new Response("ok", { status: 200 })
  }

  // Message du CLIENT : "/start CMD_xxx" (via le bouton « Recevoir mon suivi »).
  if (msgText.startsWith("/start")) {
    await handleStart(msg).catch(() => {})
    return new Response("ok", { status: 200 })
  }

  const cb = update?.callback_query
  if (!cb) return new Response("ok", { status: 200 })

  const parts = String(cb.data ?? "").split(":")
  const action = parts[0]
  const ref = parts[1]
  const answer: Answer = (text, alert = false) =>
    tg("answerCallbackQuery", { callback_query_id: cb.id, text, show_alert: alert })

  // ✅ Confirmation de l'expédition du jour (bouton de /colis) — action GLOBALE, réservée au
  // canal admin → traitée avant le chargement d'une commande.
  if (action === "dobatch") {
    if (ADMIN_CHAT && String(cb.message?.chat?.id) === ADMIN_CHAT) {
      // 🔒 Verrou anti-double-clic : un seul lot peut être lancé toutes les 2 min
      // (évite un double paiement si on tape deux fois sur le bouton).
      const lock = await redis.set("batch:lock", "1", { nx: true, ex: 120 })
      if (lock === null) {
        await answer("Lot déjà lancé à l'instant ⏳ — attends qu'il finisse.", true)
        return new Response("ok", { status: 200 })
      }
      // Retire le bouton du message pour qu'on ne puisse plus re-cliquer.
      await tg("editMessageReplyMarkup", {
        chat_id: cb.message.chat.id,
        message_id: cb.message.message_id,
        reply_markup: { inline_keyboard: [] },
      }).catch(() => {})
      await handleDayBatch(cb.message.chat.id).catch(() => {})
      await answer("Expédition lancée 📦")
    } else {
      await answer()
    }
    return new Response("ok", { status: 200 })
  }

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
        if (updated) {
          await refreshOrderMessage(updated)
          await refreshCustomerMessage(updated)
        }
        await answer("Commande acceptée ✅")
        break
      }
      case "ref": {
        await cancelAndDelete(order, answer).catch(() => {})
        break
      }
      case "pay": {
        const updated = await updateOrder(ref, { status: "paid" })
        if (updated) {
          await refreshOrderMessage(updated)
          await refreshCustomerMessage(updated)
        }
        await answer("Paiement validé 💳 — à expédier")
        break
      }
      case "gen": {
        // Met la commande « en génération » + la pousse dans la file que le VEILLEUR
        // local surveille → il lancera le robot Colissimo sur la machine.
        if (order.status === "generating") {
          await answer("Génération déjà demandée…", true)
          break
        }
        const updated = await updateOrder(ref, { status: "generating" })
        await redis.rpush("robot:queue", ref)
        if (updated) {
          await refreshOrderMessage(updated)
          await refreshCustomerMessage(updated)
        }
        await answer("Génération du bordereau lancée ⚗️ — le robot va s'ouvrir sur ta machine.")
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
