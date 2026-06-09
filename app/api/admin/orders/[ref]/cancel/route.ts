// POST /api/admin/orders/:ref/cancel — annule = SUPPRIME la commande (Boxtal + Telegram + base).
import { getOrder } from "@/lib/orders"
import { cancelAndDelete } from "@/lib/order-actions"
import { requireAdmin } from "@/lib/telegram-auth"

export async function POST(req: Request, { params }: { params: Promise<{ ref: string }> }) {
  const auth = requireAdmin(req)
  if (!auth.ok) return new Response(auth.message, { status: auth.status })

  const { ref } = await params
  const order = await getOrder(ref)
  if (!order) return Response.json({ ok: true }) // déjà supprimée

  try {
    await cancelAndDelete(order)
    return Response.json({ ok: true })
  } catch (err) {
    return new Response(`Échec de la suppression : ${String(err).slice(0, 200)}`, { status: 502 })
  }
}
