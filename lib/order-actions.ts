// Actions « métier » sur une commande, partagées par le webhook Telegram ET l'API admin
// (Mini App). Centralise la génération / l'annulation du bordereau pour éviter toute
// divergence de logique entre les deux points d'entrée.
import { updateOrder, type Order } from "./orders"
import { tg, refreshOrderMessage, escapeHtml } from "./telegram"
import { generateLabel, cancelShipment } from "./boxtal"

const TOKEN = process.env.TELEGRAM_BOT_TOKEN

export type Answer = (text?: string, alert?: boolean) => Promise<unknown>

// Envoie le PDF du bordereau en réponse au message de commande (caption stylée).
async function sendLabelPdf(order: Order, pdf: Uint8Array): Promise<void> {
  if (!order.telegramChatId) return
  const caption =
    `🧪⚗️ <b>Bordereau généré !</b>\n` +
    `📋 ${escapeHtml(order.ref)}\n` +
    `📦 Suivi : <b>${escapeHtml(order.trackingNumber ?? "—")}</b>` +
    (order.labelUrl ? `\n🔗 ${escapeHtml(order.labelUrl)}` : "")

  const fd = new FormData()
  fd.append("chat_id", String(order.telegramChatId))
  if (order.telegramMessageId) fd.append("reply_to_message_id", String(order.telegramMessageId))
  fd.append("caption", caption)
  fd.append("parse_mode", "HTML")
  fd.append("document", new Blob([pdf], { type: "application/pdf" }), `bordereau-${order.ref}.pdf`)
  await fetch(`https://api.telegram.org/bot${TOKEN}/sendDocument`, { method: "POST", body: fd })
}

// Génère le bordereau Boxtal — idempotent + lock optimiste (chaque bordereau est facturé).
export async function generateLabelForOrder(order: Order, answer?: Answer): Promise<Order | null> {
  if (order.status === "label_generated") {
    await answer?.(`⚠️ Bordereau déjà généré (suivi : ${order.trackingNumber ?? "—"})`, true)
    return order
  }
  if (order.status === "generating") {
    await answer?.("Génération déjà en cours…", true)
    return order
  }

  // Lock : passe en "generating" (retire les boutons) avant l'appel Boxtal.
  const working = await updateOrder(order.ref, { status: "generating" })
  if (working) await refreshOrderMessage(working)
  await answer?.("Génération du bordereau en cours…")

  try {
    const { shipmentId, trackingNumber, labelUrl, pdf } = await generateLabel(order)
    const done = await updateOrder(order.ref, {
      status: "label_generated",
      shipmentId,
      trackingNumber,
      labelUrl,
    })
    if (done) {
      await sendLabelPdf(done, pdf)
      await refreshOrderMessage(done)
    }
    return done
  } catch (err) {
    console.log("[order-actions] génération bordereau échouée:", err)
    // Retour en "paid" (à expédier) pour permettre de réessayer.
    const reverted = await updateOrder(order.ref, { status: "paid" })
    if (reverted) await refreshOrderMessage(reverted)
    if (order.telegramChatId) {
      await tg("sendMessage", {
        chat_id: order.telegramChatId,
        reply_to_message_id: order.telegramMessageId,
        text: `⚠️ Échec de la génération du bordereau pour ${escapeHtml(order.ref)}. Vous pouvez réessayer.`,
        parse_mode: "HTML",
      })
    }
    throw err
  }
}

// Annule un bordereau déjà généré.
export async function cancelLabelForOrder(order: Order, answer?: Answer): Promise<Order | null> {
  if (!order.shipmentId) {
    await answer?.("Aucun bordereau à annuler.", true)
    return order
  }
  try {
    await cancelShipment(order.shipmentId)
    const updated = await updateOrder(order.ref, { status: "cancelled" })
    if (updated) await refreshOrderMessage(updated)
    await answer?.("Bordereau annulé ✅", true)
    return updated
  } catch (err) {
    console.log("[order-actions] annulation échouée:", err)
    await answer?.("Échec de l'annulation. Réessayez.", true)
    throw err
  }
}
