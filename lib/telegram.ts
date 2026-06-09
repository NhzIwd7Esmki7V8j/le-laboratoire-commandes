// Couche Telegram partagée (server-only) : envoi d'API + rendu des messages de commande.
//
// Principe : le message Telegram d'une commande est TOUJOURS re-rendu en entier
// à partir de l'objet `Order` (renderOrderMessage). Plus besoin de re-parser le texte
// existant pour changer un statut — on recharge la commande depuis Redis et on ré-affiche.
import type { Order } from "./orders"

const TOKEN = process.env.TELEGRAM_BOT_TOKEN
const MINI_APP_URL = process.env.MINI_APP_URL

export type InlineButton =
  | { text: string; callback_data: string }
  | { text: string; url: string }

export async function tg(method: string, payload: unknown): Promise<Response> {
  return fetch(`https://api.telegram.org/bot${TOKEN}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  })
}

// Variante qui renvoie le JSON parsé de l'API Telegram ({ ok, result, ... }).
export async function tgJson<T = { ok: boolean; result?: any; description?: string }>(
  method: string,
  payload: unknown,
): Promise<T> {
  const res = await tg(method, payload)
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
    const relais = order.pointRelais ? escapeHtml(order.pointRelais) : "Point relais"
    const id = order.relayId ? ` <i>(#${escapeHtml(order.relayId)})</i>` : ""
    return `📦 ${relais} ${flag}${id}`
  }
  const addr = [order.adresse, order.codePostal, order.ville]
    .filter(Boolean)
    .map((v) => escapeHtml(v!))
    .join(", ")
  return `🏠 ${addr} ${flag}`
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
      rows.push([
        ...(order.labelUrl ? [{ text: "📄 Voir bordereau", url: order.labelUrl }] : []),
        { text: "❌ Annuler bordereau", callback_data: `cancel:${order.ref}` },
      ])
      break
    case "cancelled":
      break
  }
  if (MINI_APP_URL) rows.push([{ text: "📊 Dashboard", url: MINI_APP_URL }])
  return { inline_keyboard: rows }
}
