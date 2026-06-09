// GET /api/admin/orders/:ref/label — proxy authentifié vers le PDF du bordereau Boxtal.
// (L'URL Boxtal nécessite l'auth ; on récupère le PDF côté serveur et on le renvoie.)
import { getOrder } from "@/lib/orders"
import { fetchLabelPdf } from "@/lib/boxtal"
import { requireAdmin } from "@/lib/telegram-auth"

export async function GET(req: Request, { params }: { params: Promise<{ ref: string }> }) {
  const auth = requireAdmin(req)
  if (!auth.ok) return new Response(auth.message, { status: auth.status })

  const { ref } = await params
  const order = await getOrder(ref)
  if (!order || order.status !== "label_generated") {
    return new Response("Aucun bordereau disponible", { status: 404 })
  }

  try {
    const pdf = await fetchLabelPdf(order.labelUrl || order.shipmentId || ref)
    return new Response(pdf, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="bordereau-${ref}.pdf"`,
      },
    })
  } catch (err) {
    return new Response(`Échec du téléchargement : ${String(err).slice(0, 160)}`, { status: 502 })
  }
}
