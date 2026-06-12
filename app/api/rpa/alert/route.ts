// Endpoint d'ALERTE appelé par le robot RPA quand il se bloque. Protégé par RPA_API_KEY.
//
// Le robot envoie (multipart) : ref, step (étape), error (message), photo (capture d'écran).
// On poste l'alerte dans le canal admin EN RÉPONSE au message de la commande, avec la capture.
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
  const step = String(form.get("step") || "").trim()
  const error = String(form.get("error") || "").trim()
  const reset = String(form.get("reset") || "") === "1"
  const photo = form.get("photo")
  if (!ref) return new Response("ref manquant", { status: 400 })

  // reset = échec avant paiement → on réactive le bouton « Générer ». Sinon on garde le statut.
  const updated = reset ? await updateOrder(ref, { status: "paid" }) : await getOrder(ref)
  if (!updated) return new Response("Commande introuvable", { status: 404 })

  const caption =
    `⚠️ <b>Robot bloqué</b> — commande <b>${escapeHtml(ref)}</b>\n` +
    (step ? `📍 Étape : ${escapeHtml(step)}\n` : "") +
    (error ? `🐞 <i>${escapeHtml(error.slice(0, 280))}</i>\n` : "") +
    `\n👉 ${reset ? "Le bouton « Générer le bordereau » est réactivé — relance ou fais-le à la main." : "Paiement déjà passé — récupère l'étiquette à la main dans l'espace client."}`

  const img =
    photo && typeof (photo as Blob).arrayBuffer === "function"
      ? new Uint8Array(await (photo as Blob).arrayBuffer())
      : undefined

  await sendAdminAlert(updated, caption, img)
  if (reset) {
    await refreshOrderMessage(updated)
    await refreshCustomerMessage(updated)
  }
  return Response.json({ ok: true, ref, reset })
}

export function GET() {
  return new Response("RPA alert endpoint OK")
}
