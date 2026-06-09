// POST /api/admin/orders/:ref/cancel — annule le bordereau Boxtal.
import { getOrder } from "@/lib/orders"
import { cancelLabelForOrder } from "@/lib/order-actions"
import { requireAdmin } from "@/lib/telegram-auth"

export async function POST(req: Request, { params }: { params: Promise<{ ref: string }> }) {
  const auth = requireAdmin(req)
  if (!auth.ok) return new Response(auth.message, { status: auth.status })

  const { ref } = await params
  const order = await getOrder(ref)
  if (!order) return new Response("Commande introuvable", { status: 404 })

  try {
    const updated = await cancelLabelForOrder(order)
    return Response.json({ order: updated })
  } catch (err) {
    return new Response(`Échec de l'annulation : ${String(err).slice(0, 200)}`, { status: 502 })
  }
}
