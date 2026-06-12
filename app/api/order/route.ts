// Route de CRÉATION DE COMMANDE, appelée en fetch() par le formulaire du site.
// On utilise une vraie route API (et non une Server Action) car les Server Actions sont
// peu fiables sur OpenNext/Cloudflare : l'action réussissait côté serveur mais la réponse
// ne revenait pas au navigateur → le client croyait à un échec et recommandait en double.
import { createOrder } from "@/lib/create-order"

export async function POST(req: Request) {
  let data
  try {
    data = await req.json()
  } catch {
    return Response.json({ success: false, error: "Requête invalide." }, { status: 400 })
  }
  const result = await createOrder(data)
  return Response.json(result)
}
