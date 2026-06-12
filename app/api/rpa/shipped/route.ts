// Endpoint appelé par le robot RPA local. Protégé par RPA_API_KEY (header x-robot-key).
//
// 2 usages :
//  - multipart (champ `file` = PDF) → commande EXPÉDIÉE : on poste l'étiquette dans le
//    canal AVEC les infos en légende (un seul message, l'ancien message texte est supprimé),
//    on enregistre le n° de suivi, et on notifie le client.
//  - JSON { ref, status } → simple changement de statut (ex. robot fermé sans payer →
//    on remet la commande en "paid" pour réafficher le bouton « Générer »).
import { updateOrder, type OrderStatus } from "@/lib/orders"
import {
  refreshOrderMessage,
  refreshCustomerMessage,
  notifyCustomerMessage,
  deleteCustomerMessage,
  sendLabelToChannel,
  deleteChannelMessage,
  sendAdminAlert,
  escapeHtml,
} from "@/lib/telegram"

const ALLOWED: OrderStatus[] = ["pending", "accepted", "paid", "generating", "label_generated", "cancelled"]

export async function POST(req: Request) {
  if (!process.env.RPA_API_KEY || req.headers.get("x-robot-key") !== process.env.RPA_API_KEY) {
    return new Response("forbidden", { status: 403 })
  }

  const ct = req.headers.get("content-type") || ""

  // ── Cas 1 : upload du PDF → expédiée + message unifié ──
  if (ct.includes("multipart/form-data")) {
    const form = await req.formData().catch(() => null)
    if (!form) return new Response("form invalide", { status: 400 })
    const ref = String(form.get("ref") || "").trim()
    const trackingNumber = String(form.get("trackingNumber") || "").trim()
    const file = form.get("file")
    if (!ref) return new Response("ref manquant", { status: 400 })

    const patch: { status: OrderStatus; trackingNumber?: string } = { status: "label_generated" }
    if (trackingNumber) patch.trackingNumber = trackingNumber
    const updated = await updateOrder(ref, patch)
    if (!updated) return new Response("Commande introuvable", { status: 404 })

    // Poste l'étiquette + infos en légende, puis supprime l'ancien message texte.
    if (file && typeof (file as Blob).arrayBuffer === "function") {
      const pdf = new Uint8Array(await (file as Blob).arrayBuffer())
      const oldMsgId = updated.telegramMessageId
      const newMsgId = await sendLabelToChannel(updated, pdf)
      if (newMsgId) {
        if (oldMsgId && oldMsgId !== newMsgId) await deleteChannelMessage(updated, oldMsgId)
        await updateOrder(ref, { telegramMessageId: newMsgId })
      } else {
        await refreshOrderMessage(updated) // envoi PDF KO → au moins re-render le texte
      }
    } else {
      await refreshOrderMessage(updated)
    }

    // Notifie le client de l'expédition + n° de suivi.
    if (updated.customerChatId) {
      // Le client a activé son suivi → NOUVEAU message (= vraie notification/ping), puis on
      // supprime l'ancien message « en attente » pour ne pas laisser de doublon.
      const newId = await notifyCustomerMessage(updated)
      if (newId) {
        if (updated.customerMessageId && updated.customerMessageId !== newId) {
          await deleteCustomerMessage(updated.customerChatId, updated.customerMessageId)
        }
        await updateOrder(ref, { customerMessageId: newId })
      } else {
        await refreshCustomerMessage(updated) // envoi KO → au moins éditer l'existant
      }
    } else {
      // Le client n'a JAMAIS activé son suivi (Telegram interdit au bot de l'écrire en premier).
      // → On prévient l'ADMIN dans le canal pour qu'il relaie le n° de suivi à la main.
      const tn = updated.trackingNumber ? escapeHtml(updated.trackingNumber) : "—"
      const tel = updated.telephone ? escapeHtml(updated.telephone) : "?"
      await sendAdminAlert(
        updated,
        `📦 <b>${escapeHtml(ref)} expédiée</b> — suivi <b>${tn}</b>.\n` +
          `⚠️ Le client n'a pas activé son suivi Telegram → relaie-lui le numéro à la main (📞 ${tel}).`,
      )
    }
    return Response.json({ ok: true, ref, status: updated.status, trackingNumber: updated.trackingNumber ?? null })
  }

  // ── Cas 2 : changement de statut (JSON) ──
  const body = await req.json().catch(() => ({}))
  const ref = typeof body?.ref === "string" ? body.ref.trim() : ""
  const status = body?.status as OrderStatus | undefined
  if (!ref) return new Response("ref manquant", { status: 400 })
  if (!status || !ALLOWED.includes(status)) return new Response("statut invalide", { status: 400 })

  const updated = await updateOrder(ref, { status })
  if (!updated) return new Response("Commande introuvable", { status: 404 })
  await refreshOrderMessage(updated)
  await refreshCustomerMessage(updated)
  return Response.json({ ok: true, ref, status: updated.status })
}

export function GET() {
  return new Response("RPA shipped endpoint OK")
}
