// Endpoint d'ALERTE appelé par le robot RPA quand il se bloque. Protégé par RPA_API_KEY.
//
// Le robot envoie (multipart) : ref + reset (step/error sont gardés pour ses logs, non affichés).
// On poste une alerte COURTE et actionnable dans le canal admin, EN RÉPONSE au message de la
// commande (sans capture ni détail technique : demande explicite de l'admin).
// Si `reset=1` (échec AVANT paiement → aucun argent dépensé), on remet la commande en "paid"
// pour réafficher le bouton « Générer le bordereau » (retry possible). Sinon (échec APRÈS
// paiement), on ne touche pas au statut : l'admin récupère juste l'étiquette à la main.
import { updateOrder, getOrder } from "@/lib/orders"
import { sendAdminAlert, refreshOrderMessage, refreshCustomerMessage, escapeHtml } from "@/lib/telegram"

export async function POST(req: Request) {
  if (!process.env.RPA_API_KEY || req.headers.get("x-robot-key") !== process.env.RPA_API_KEY) {
    return new Response("forbidden", { status: 403 })
  }

  const form = await req.formData().catch(() => null)
  if (!form) return new Response("form invalide", { status: 400 })
  const ref = String(form.get("ref") || "").trim()
  const reset = String(form.get("reset") || "") === "1"
  if (!ref) return new Response("ref manquant", { status: 400 })

  // reset = échec avant paiement → on réactive le bouton « Générer ». Sinon on garde le statut.
  const updated = reset ? await updateOrder(ref, { status: "paid" }) : await getOrder(ref)
  if (!updated) return new Response("Commande introuvable", { status: 404 })

  // Message COURT et actionnable, sans détail technique ni capture (demande explicite).
  const caption = reset
    ? `🚨 <b>Alerte</b> — génère le bordereau manuellement pour la commande <b>${escapeHtml(ref)}</b>.`
    : `🚨 <b>Alerte</b> — récupère l'étiquette à la main pour la commande <b>${escapeHtml(ref)}</b> (déjà payée).`

  await sendAdminAlert(updated, caption)
  if (reset) {
    await refreshOrderMessage(updated)
    await refreshCustomerMessage(updated)
  }
  return Response.json({ ok: true, ref, reset })
}

export function GET() {
  return new Response("RPA alert endpoint OK")
}
