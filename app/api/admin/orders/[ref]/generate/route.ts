// POST /api/admin/orders/:ref/generate — déclenche la génération du bordereau Boxtal.
// Réutilise EXACTEMENT la logique du webhook (idempotence + lock + envoi PDF Telegram).
import { getOrder } from "@/lib/orders"
import { generateLabelForOrder } from "@/lib/order-actions"
import { requireAdmin } from "@/lib/telegram-auth"

export async function POST(req: Request, { params }: { params: Promise<{ ref: string }> }) {
  const auth = requireAdmin(req)
  if (!auth.ok) return new Response(auth.message, { status: auth.status })

  const { ref } = await params
  const order = await getOrder(ref)
  if (!order) return new Response("Commande introuvable", { status: 404 })

  const body = await req.json().catch(() => ({}))
  const senderId = typeof body?.senderId === "string" ? body.senderId : undefined

  try {
    const updated = await generateLabelForOrder(order, { senderId })
    return Response.json({ order: updated })
  } catch (err) {
    return new Response(`Échec de la génération : ${String(err).slice(0, 200)}`, { status: 502 })
  }
}
