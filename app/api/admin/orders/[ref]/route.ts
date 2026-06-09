// GET    /api/admin/orders/:ref  — détails d'une commande
// PATCH  /api/admin/orders/:ref  — mise à jour manuelle du statut (+ refresh message Telegram)
import { getOrder, updateOrder, type OrderStatus } from "@/lib/orders"
import { refreshOrderMessage } from "@/lib/telegram"
import { requireAdmin } from "@/lib/telegram-auth"

const STATUSES: OrderStatus[] = [
  "pending",
  "accepted",
  "generating",
  "label_generated",
  "cancelled",
]

export async function GET(req: Request, { params }: { params: Promise<{ ref: string }> }) {
  const auth = requireAdmin(req)
  if (!auth.ok) return new Response(auth.message, { status: auth.status })

  const { ref } = await params
  const order = await getOrder(ref)
  if (!order) return new Response("Commande introuvable", { status: 404 })
  return Response.json({ order })
}

export async function PATCH(req: Request, { params }: { params: Promise<{ ref: string }> }) {
  const auth = requireAdmin(req)
  if (!auth.ok) return new Response(auth.message, { status: auth.status })

  const { ref } = await params
  const body = await req.json().catch(() => ({}))
  const status = body?.status as OrderStatus | undefined
  if (!status || !STATUSES.includes(status)) {
    return new Response("Statut invalide", { status: 400 })
  }

  const updated = await updateOrder(ref, { status })
  if (!updated) return new Response("Commande introuvable", { status: 404 })
  await refreshOrderMessage(updated)
  return Response.json({ order: updated })
}
