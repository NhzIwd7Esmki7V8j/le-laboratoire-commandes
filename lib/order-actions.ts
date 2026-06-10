// Actions « métier » sur une commande, partagées par le webhook Telegram ET l'API admin
// (Mini App). Centralise la génération / l'annulation du bordereau pour éviter toute
// divergence de logique entre les deux points d'entrée.
import { updateOrder, deleteOrder, type Order } from "./orders"
import { tg, refreshOrderMessage, refreshCustomerMessage, escapeHtml } from "./telegram"
import { generateLabel, cancelShipment } from "./boxtal"
import { getSender, getDefaultSender } from "./senders"

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
export async function generateLabelForOrder(
  order: Order,
  opts: { senderId?: string; answer?: Answer } = {},
): Promise<Order | null> {
  const answer = opts.answer
  if (order.status === "label_generated") {
    await answer?.(`⚠️ Bordereau déjà généré (suivi : ${order.trackingNumber ?? "—"})`, true)
    return order
  }
  if (order.status === "generating") {
    await answer?.("Génération déjà en cours…", true)
    return order
  }

  // Résout l'expéditeur (choisi ou par défaut) AVANT de verrouiller.
  const sender = opts.senderId ? await getSender(opts.senderId) : await getDefaultSender()
  if (!sender) {
    await answer?.("Aucune adresse expéditeur. Ajoutez-en une dans le back-office (Réglages).", true)
    return order
  }

  // Lock : passe en "generating" (retire les boutons) avant l'appel Boxtal.
  const working = await updateOrder(order.ref, { status: "generating" })
  if (working) {
    await refreshOrderMessage(working)
    await refreshCustomerMessage(working)
  }
  await answer?.("Génération du bordereau en cours…")

  try {
    const { shipmentId, trackingNumber, labelUrl, pdf } = await generateLabel(order, sender)
    const done = await updateOrder(order.ref, {
      status: "label_generated",
      shipmentId,
      trackingNumber,
      labelUrl,
    })
    if (done) {
      await sendLabelPdf(done, pdf)
      await refreshOrderMessage(done)
      await refreshCustomerMessage(done)
    }
    return done
  } catch (err) {
    console.log("[order-actions] génération bordereau échouée:", err)
    // Retour en "paid" (à expédier) pour permettre de réessayer.
    const reverted = await updateOrder(order.ref, { status: "paid" })
    if (reverted) {
      await refreshOrderMessage(reverted)
      await refreshCustomerMessage(reverted)
    }
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

// Annuler = SUPPRIMER : annule le bordereau Boxtal (si généré), efface le message
// Telegram, et supprime la commande de la base. Elle disparaît partout.
export async function cancelAndDelete(order: Order, answer?: Answer): Promise<void> {
  try {
    if (order.status === "label_generated" && order.shipmentId) {
      try {
        await cancelShipment(order.shipmentId)
      } catch (e) {
        console.log("[order-actions] annulation Boxtal échouée (on supprime quand même):", e)
      }
    }
    if (order.telegramChatId && order.telegramMessageId) {
      await tg("deleteMessage", {
        chat_id: order.telegramChatId,
        message_id: order.telegramMessageId,
      })
    }
    // Édite le message de suivi côté client en "Commande annulée" AVANT la suppression
    // (après deleteOrder, on perd les IDs Telegram du client).
    await refreshCustomerMessage({ ...order, status: "cancelled" })
    await deleteOrder(order.ref)
    await answer?.("Commande supprimée 🗑️", true)
  } catch (err) {
    console.log("[order-actions] suppression échouée:", err)
    await answer?.("Échec de la suppression. Réessayez.", true)
    throw err
  }
}
