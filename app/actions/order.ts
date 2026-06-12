"use server"

// Conservée pour compatibilité, mais le formulaire passe désormais par la route /api/order
// (fetch), plus fiable sur Cloudflare. Toute la logique vit dans lib/create-order.
import { createOrder, type OrderInput } from "@/lib/create-order"

export async function submitOrder(data: OrderInput) {
  return createOrder(data)
}
