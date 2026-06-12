// Endpoint appelé par le robot RPA local. Protégé par RPA_API_KEY (header x-robot-key).
//
// 2 usages :
//  - multipart (champ `file` = PDF) → commande EXPÉDIÉE : on poste l'étiquette dans le
//    canal AVEC les infos en légende (un seul message, l'ancien message texte est supprimé),
//    on enregistre le n° de suivi, et on notifie le client.
//  - JSON { ref, status } → simple changement de statut (ex. robot fermé sans payer →
//    on remet la commande en "paid" pour réafficher le bouton « Générer »).
import { updateOrder, type OrderStatus } from "@/lib/orders"
import { refreshOrderMessage, refreshCustomerMessage } from "@/lib/telegram"

const ALLOWED: OrderStatus[] = ["pending", "accepted", "paid", "in_cart", "generating", "label_generated", "cancelled"]

export async function POST(req: Request) {
  if (!process.env.RPA_API_KEY || req.headers.get("x-robot-key") !== process.env.RPA_API_KEY) {
    return new Response("forbidden", { status: 403 })
  }

  const ct = req.headers.get("content-type") || ""

  // ── Cas 1 : commande EXPÉDIÉE (le PDF, lui, est déposé sur le Drive par le robot) ──
  // On NE poste PLUS le bordereau sur Telegram : on met juste à jour le statut (texte) et on
  // envoie le NUMÉRO DE SUIVI au client (au moment du paiement). Le `file` éventuel est ignoré.
  if (ct.includes("multipart/form-data")) {
    const form = await req.formData().catch(() => null)
    if (!form) return new Response("form invalide", { status: 400 })
    const ref = String(form.get("ref") || "").trim()
    const trackingNumber = String(form.get("trackingNumber") || "").trim()
    if (!ref) return new Response("ref manquant", { status: 400 })

    const patch: { status: OrderStatus; trackingNumber?: string } = { status: "label_generated" }
    if (trackingNumber) patch.trackingNumber = trackingNumber
    const updated = await updateOrder(ref, patch)
    if (!updated) return new Response("Commande introuvable", { status: 404 })

    await refreshOrderMessage(updated) // message admin : passe à « Expédiée » (texte, sans PDF)
    await refreshCustomerMessage(updated) // client : reçoit son numéro de suivi
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
  return Response.json({ ok: true, ref, status: updated.status })
}

export function GET() {
  return new Response("RPA shipped endpoint OK")
}
