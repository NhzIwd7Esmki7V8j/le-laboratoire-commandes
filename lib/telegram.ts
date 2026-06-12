// Couche Telegram partagée (server-only) : envoi d'API + rendu des messages de commande.
//
// Principe : le message Telegram d'une commande est TOUJOURS re-rendu en entier
// à partir de l'objet `Order` (renderOrderMessage). Plus besoin de re-parser le texte
// existant pour changer un statut — on recharge la commande depuis Redis et on ré-affiche.
import { updateOrder, type Order } from "./orders"

const TOKEN = process.env.TELEGRAM_BOT_TOKEN
const TRACKING_TOKEN = process.env.TELEGRAM_TRACKING_BOT_TOKEN

// URL de suivi La Poste / Colissimo (pour le bouton final côté client)
function laPosteTrackingUrl(trackingNumber: string): string {
  return `https://www.laposte.fr/outils/suivre-vos-envois?code=${encodeURIComponent(trackingNumber)}`
}

export type InlineButton =
  | { text: string; callback_data: string }
  | { text: string; url: string }

// `token` permet d'envoyer via un autre bot (ex: le bot de suivi client). Défaut = bot admin.
export async function tg(method: string, payload: unknown, token?: string): Promise<Response> {
  return fetch(`https://api.telegram.org/bot${token ?? TOKEN}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  })
}

// Variante qui renvoie le JSON parsé de l'API Telegram ({ ok, result, ... }).
// `token` permet d'utiliser un autre bot (ex: bot de suivi). Défaut = bot admin.
export async function tgJson<T = { ok: boolean; result?: any; description?: string }>(
  method: string,
  payload: unknown,
  token?: string,
): Promise<T> {
  const res = await tg(method, payload, token)
  return (await res.json()) as T
}

export function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
}

// Re-render le message Telegram d'une commande (texte + boutons) sur place.
// Partagé par le webhook ET l'API admin (Mini App).
export async function refreshOrderMessage(order: Order): Promise<void> {
  if (!order.telegramChatId || !order.telegramMessageId) return
  await tg("editMessageText", {
    chat_id: order.telegramChatId,
    message_id: order.telegramMessageId,
    text: renderOrderMessage(order),
    parse_mode: "HTML",
    reply_markup: orderButtons(order),
  })
}

// Envoie le PDF du bordereau dans le canal AVEC les infos de la commande en légende
// (= un seul message qui remplace l'ancien message texte). Renvoie l'ID du nouveau message.
export async function sendLabelToChannel(
  order: Order,
  pdf: Uint8Array | ArrayBuffer,
  filename = `bordereau-${order.ref}.pdf`,
): Promise<number | null> {
  if (!TOKEN || !order.telegramChatId) return null
  try {
    const fd = new FormData()
    fd.append("chat_id", String(order.telegramChatId))
    fd.append("caption", renderOrderMessage(order))
    fd.append("parse_mode", "HTML")
    fd.append("document", new Blob([pdf], { type: "application/pdf" }), filename)
    const res = await fetch(`https://api.telegram.org/bot${TOKEN}/sendDocument`, { method: "POST", body: fd })
    const j = (await res.json()) as { ok?: boolean; result?: { message_id?: number } }
    return j?.ok && j.result?.message_id ? j.result.message_id : null
  } catch {
    return null
  }
}

// Poste une ALERTE (échec du robot) dans le canal admin, en réponse au message de la
// commande, avec une capture d'écran optionnelle. Best-effort (n'échoue jamais bruyamment).
export async function sendAdminAlert(
  order: Order,
  caption: string,
  photo?: Uint8Array | ArrayBuffer,
): Promise<void> {
  if (!TOKEN || !order.telegramChatId) return
  try {
    if (photo) {
      const fd = new FormData()
      fd.append("chat_id", String(order.telegramChatId))
      fd.append("caption", caption.slice(0, 1024))
      fd.append("parse_mode", "HTML")
      if (order.telegramMessageId) fd.append("reply_to_message_id", String(order.telegramMessageId))
      fd.append("photo", new Blob([photo], { type: "image/png" }), `error-${order.ref}.png`)
      await fetch(`https://api.telegram.org/bot${TOKEN}/sendPhoto`, { method: "POST", body: fd })
    } else {
      await tg("sendMessage", {
        chat_id: order.telegramChatId,
        text: caption,
        parse_mode: "HTML",
        reply_to_message_id: order.telegramMessageId,
      })
    }
  } catch {
    /* best-effort : une alerte ratée ne doit pas casser le flux */
  }
}

// Supprime un message du canal (best-effort).
export async function deleteChannelMessage(order: Order, messageId?: number): Promise<void> {
  const id = messageId ?? order.telegramMessageId
  if (!order.telegramChatId || !id) return
  await tg("deleteMessage", { chat_id: order.telegramChatId, message_id: id }).catch(() => {})
}

const FLAG: Record<string, string> = { FR: "🇫🇷", BE: "🇧🇪" }
// Séparateur court : assez fin pour ne pas déborder/wrapper sur mobile.
const SEP = "━━━━━━━━━━━━"

function statusFooter(order: Order): string {
  switch (order.status) {
    case "pending":
      return "⏳ En attente de validation"
    case "accepted":
      return "🟡 Acceptée — en attente de paiement"
    case "paid":
      return "📦 Payé — à expédier"
    case "generating":
      return "🟢 Paiement validé — génération du bordereau…"
    case "label_generated":
      return `✅ Expédiée — Suivi : <b>${escapeHtml(order.trackingNumber ?? "—")}</b>`
    case "cancelled":
      return "🔴 Commande annulée"
  }
}

// Ligne de livraison compacte (1 à 2 lignes selon le mode).
function deliveryLine(order: Order): string {
  const flag = FLAG[order.pays] ?? ""
  if (order.deliveryMode === "relais") {
    const relais = order.pointRelais ? escapeHtml(order.pointRelais) : "Point Retrait"
    const id = order.relayId ? ` <i>(#${escapeHtml(order.relayId)})</i>` : ""
    return `🚚 <i>Colissimo · Point Retrait</i>\n📦 ${relais} ${flag}${id}`
  }
  const addr = [order.adresse, order.codePostal, order.ville]
    .filter(Boolean)
    .map((v) => escapeHtml(v!))
    .join(", ")
  return `🚚 <i>Colissimo · Domicile</i>\n🏠 ${addr} ${flag}`
}

// Rend le message HTML compact d'une commande (en-tête + corps client + footer statut).
export function renderOrderMessage(order: Order): string {
  const date = new Date(order.createdAt).toLocaleString("fr-FR", {
    timeZone: "Europe/Paris",
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  })

  return (
    `🧪 <b>LE LABORATOIRE</b> · Commande\n` +
    `${SEP}\n` +
    `📋 <b>${escapeHtml(order.ref)}</b>\n` +
    `👤 ${escapeHtml(order.prenom)} ${escapeHtml(order.nom)}\n` +
    `📞 ${escapeHtml(order.telephone)}\n` +
    `${deliveryLine(order)}\n` +
    (order.message ? `💬 <i>${escapeHtml(order.message)}</i>\n` : "") +
    `🕐 ${date}\n` +
    `${SEP}\n` +
    statusFooter(order)
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Message de SUIVI CLIENT (un seul message qui évolue avec le statut).
// Envoyé par le bot de suivi quand le client clique « Recevoir mon suivi »
// (deep link /start CMD_xxx) ; ré-édité à chaque changement de statut.
// ─────────────────────────────────────────────────────────────────────────────

// Texte du message client selon le statut — design soigné & pro (un seul message à l'écran).
export function renderCustomerMessage(order: Order): string {
  const ref = escapeHtml(order.ref)
  // Barre de progression visuelle de la commande (le ● = étape courante).
  const steps = ["pending", "accepted", "paid", "label_generated"]
  const idx = order.status === "generating" ? 2 : steps.indexOf(order.status)
  const bar = order.status === "cancelled" ? "" : steps.map((_, i) => (i <= idx ? "🟣" : "⚪️")).join(" ") + "\n\n"
  const header = `🧪 <b>LE LABORATOIRE</b>\n${SEP}\n📋 Commande <b>${ref}</b>\n\n${bar}`
  switch (order.status) {
    case "pending":
      return header + `⏳ <b>Commande reçue</b>\n\nOn vérifie ta commande — tu seras prévenu·e ici à chaque étape. ✨`
    case "accepted":
      return header + `✅ <b>Commande validée</b>\n\nIl ne reste plus qu'à finaliser le <b>paiement</b> avec l'équipe. 💳`
    case "paid":
    case "generating":
      return header + `💳 <b>Paiement confirmé — merci !</b> 🙌\n\n📦 Ton colis est en cours de préparation…`
    case "label_generated":
      return (
        header +
        `🚀 <b>Ton colis est expédié !</b>\n\n` +
        `📧 Ton <b>numéro de suivi</b> t'est envoyé <b>par email</b> (de la part de La Poste) dès que le colis est pris en charge.\n\n` +
        `<i>Pense à vérifier tes spams 📬</i>`
      )
    case "cancelled":
      return header + `❌ <b>Commande annulée</b>\n\nUne erreur, une question ? Contacte l'équipe, on est là. 💬`
  }
}

// Boutons sous le message client : bouton « Suivre sur laposte.fr » uniquement quand expédié.
export function customerStatusButtons(order: Order): { inline_keyboard: InlineButton[][] } {
  const rows: InlineButton[][] = []
  if (order.status === "label_generated" && order.trackingNumber) {
    rows.push([{ text: "📬 Suivre mon colis sur laposte.fr", url: laPosteTrackingUrl(order.trackingNumber) }])
  }
  return { inline_keyboard: rows }
}

// Envoie un NOUVEAU message de suivi au client et renvoie l'ID Telegram du message
// (à stocker dans `order.customerMessageId` pour pouvoir l'éditer ensuite).
export async function sendCustomerMessage(order: Order, chatId: number): Promise<number | null> {
  if (!TRACKING_TOKEN) return null
  try {
    const res = await tgJson<{ ok: boolean; result?: { message_id: number } }>(
      "sendMessage",
      {
        chat_id: chatId,
        text: renderCustomerMessage(order),
        parse_mode: "HTML",
        reply_markup: customerStatusButtons(order),
      },
      TRACKING_TOKEN,
    )
    return res?.ok && res.result?.message_id ? res.result.message_id : null
  } catch {
    return null
  }
}

// Envoie au client un NOUVEAU message de suivi (≠ édition) → le client reçoit une vraie
// NOTIFICATION Telegram (utile pour l'événement « colis expédié »). Renvoie le message_id.
export async function notifyCustomerMessage(order: Order): Promise<number | null> {
  if (!TRACKING_TOKEN || !order.customerChatId) return null
  try {
    const res = await tgJson<{ ok: boolean; result?: { message_id: number } }>(
      "sendMessage",
      {
        chat_id: order.customerChatId,
        text: renderCustomerMessage(order),
        parse_mode: "HTML",
        reply_markup: customerStatusButtons(order),
      },
      TRACKING_TOKEN,
    )
    return res?.ok && res.result?.message_id ? res.result.message_id : null
  } catch {
    return null
  }
}

// Supprime un message côté bot de suivi client (best-effort) — pour éviter les doublons.
export async function deleteCustomerMessage(chatId: number, messageId?: number): Promise<void> {
  if (!chatId || !messageId) return
  await tg("deleteMessage", { chat_id: chatId, message_id: messageId }, TRACKING_TOKEN).catch(() => {})
}

// Met à jour le statut côté client : SUPPRIME l'ancien message et en envoie un NOUVEAU.
// → le client reçoit une vraie notification (ping) ET il ne reste QUE le statut courant
//   dans la conversation (chat propre). No-op si le client n'a pas lié le bot.
export async function refreshCustomerMessage(order: Order): Promise<void> {
  if (!TRACKING_TOKEN || !order.customerChatId) return
  // 1) Efface l'ancien message de statut (s'il existe) pour ne pas empiler les messages.
  if (order.customerMessageId) {
    await deleteCustomerMessage(order.customerChatId, order.customerMessageId)
  }
  // 2) Envoie le nouveau statut (= notification) et mémorise son id.
  const res = await tgJson<{ ok: boolean; result?: { message_id: number } }>(
    "sendMessage",
    {
      chat_id: order.customerChatId,
      text: renderCustomerMessage(order),
      parse_mode: "HTML",
      reply_markup: customerStatusButtons(order),
    },
    TRACKING_TOKEN,
  ).catch(() => null)
  const newId = res?.ok && res.result?.message_id ? res.result.message_id : null
  if (newId) await updateOrder(order.ref, { customerMessageId: newId })
}

// Boutons inline selon le statut courant.
// NB : on utilise un bouton `url` (et non `web_app`) pour le Dashboard car les boutons
// web_app inline ne sont PAS autorisés dans un canal/groupe (seulement en chat privé) —
// ils feraient échouer tout l'envoi. Pour ouvrir la Mini App authentifiée DANS Telegram,
// configurer MINI_APP_URL avec le lien direct t.me du bot (ex: https://t.me/labo_commandes_bot/app)
// ou passer par le bouton Menu du bot (setChatMenuButton).
export function orderButtons(order: Order): { inline_keyboard: InlineButton[][] } {
  const rows: InlineButton[][] = []
  switch (order.status) {
    case "pending":
      rows.push([
        { text: "✅ Accepter", callback_data: `acc:${order.ref}` },
        { text: "❌ Refuser", callback_data: `ref:${order.ref}` },
      ])
      break
    case "accepted":
      rows.push([{ text: "💳 Payé !", callback_data: `pay:${order.ref}` }])
      rows.push([{ text: "❌ Annuler", callback_data: `ref:${order.ref}` }])
      break
    case "paid":
      // Une fois payé, plus d'annulation possible (commande protégée).
      rows.push([
        { text: "⚗️ Générer le bordereau", callback_data: `gen:${order.ref}` },
      ])
      break
    case "generating":
      break // aucun bouton pendant la génération (évite le double-clic)
    case "label_generated":
      // Expédiée : plus d'annulation possible. (Le PDF est aussi déjà dans le canal.)
      if (order.labelUrl) rows.push([{ text: "📄 Voir bordereau", url: order.labelUrl }])
      break
    case "cancelled":
      break
  }
  return { inline_keyboard: rows }
}
