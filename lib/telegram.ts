// Couche Telegram partagée (server-only) : envoi d'API + rendu des messages de commande.
//
// Principe : le message Telegram d'une commande est TOUJOURS re-rendu en entier
// à partir de l'objet `Order` (renderOrderMessage). Plus besoin de re-parser le texte
// existant pour changer un statut — on recharge la commande depuis Redis et on ré-affiche.
import type { Order } from "./orders"

const TOKEN = process.env.TELEGRAM_BOT_TOKEN
const TRACKING_TOKEN = process.env.TELEGRAM_TRACKING_BOT_TOKEN
const MINI_APP_URL = process.env.MINI_APP_URL

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

// Texte du message client selon le statut.
export function renderCustomerMessage(order: Order): string {
  const ref = escapeHtml(order.ref)
  const header = `🧪 <b>LE LABORATOIRE</b>\n📋 Commande <b>${ref}</b>\n\n`
  switch (order.status) {
    case "pending":
      return (
        header +
        `⏳ <b>En attente de validation</b>\n` +
        `On a bien reçu ta commande ! Notre équipe la valide manuellement — tu seras notifié·e ici dès que c'est bon ✅`
      )
    case "accepted":
      return (
        header +
        `🟡 <b>En attente de paiement</b>\n` +
        `Ta commande est validée 🎉 Finalise le paiement avec l'admin sur Telegram.\n\n` +
        `<i>Tu recevras la notif de confirmation ici dès que ton paiement sera reçu.</i>`
      )
    case "paid":
    case "generating":
      return (
        header +
        `📦 <b>En attente d'expédition</b>\n` +
        `Paiement bien reçu, merci ! 🙌 On prépare ton colis — tu recevras ton numéro de suivi ici dès l'envoi.`
      )
    case "label_generated":
      return (
        header +
        `🚀 <b>Ton colis est en route !</b>\n\n` +
        `🔖 Numéro de suivi :\n<b>${escapeHtml(order.trackingNumber ?? "—")}</b>\n\n` +
        `Suis ton colis en temps réel sur laposte.fr 👇`
      )
    case "cancelled":
      return (
        header +
        `❌ <b>Commande annulée</b>\n` +
        `Si c'est une erreur ou si tu as une question, n'hésite pas à contacter nos admins sur Telegram 💬`
      )
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

// Édite en place le message de suivi (no-op si pas encore envoyé / pas de bot configuré).
export async function refreshCustomerMessage(order: Order): Promise<void> {
  if (!TRACKING_TOKEN) return
  if (!order.customerChatId || !order.customerMessageId) return
  await tg(
    "editMessageText",
    {
      chat_id: order.customerChatId,
      message_id: order.customerMessageId,
      text: renderCustomerMessage(order),
      parse_mode: "HTML",
      reply_markup: customerStatusButtons(order),
    },
    TRACKING_TOKEN,
  ).catch(() => {})
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
  if (MINI_APP_URL) rows.push([{ text: "📊 Dashboard", url: MINI_APP_URL }])
  return { inline_keyboard: rows }
}
