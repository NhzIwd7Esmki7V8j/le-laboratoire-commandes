// GET /api/admin/orders[?status=pending] — liste les commandes (Mini App).
import { listOrders, type OrderStatus } from "@/lib/orders"
import { requireAdmin } from "@/lib/telegram-auth"

const STATUSES: OrderStatus[] = [
  "pending",
  "accepted",
  "paid",
  "generating",
  "label_generated",
  "cancelled",
]

export async function GET(req: Request) {
  const auth = requireAdmin(req)
  if (!auth.ok) return new Response(auth.message, { status: auth.status })

  const status = new URL(req.url).searchParams.get("status")
  const filter = status && STATUSES.includes(status as OrderStatus) ? (status as OrderStatus) : undefined
  const orders = await listOrders(filter)
  return Response.json({ orders })
}
