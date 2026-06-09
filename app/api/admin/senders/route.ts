// GET /api/admin/senders — liste des adresses expéditeur
// PUT /api/admin/senders — remplace la liste complète (le back-office l'édite puis la renvoie)
import { listSenders, saveSenders, type Sender } from "@/lib/senders"
import { requireAdmin } from "@/lib/telegram-auth"

export async function GET(req: Request) {
  const auth = requireAdmin(req)
  if (!auth.ok) return new Response(auth.message, { status: auth.status })
  return Response.json({ senders: await listSenders() })
}

export async function PUT(req: Request) {
  const auth = requireAdmin(req)
  if (!auth.ok) return new Response(auth.message, { status: auth.status })

  const body = await req.json().catch(() => ({}))
  const senders = Array.isArray(body?.senders) ? (body.senders as Sender[]) : null
  if (!senders) return new Response("Liste invalide", { status: 400 })

  for (const s of senders) {
    if (!s.id || !s.firstname || !s.lastname || !s.street || !s.zipcode || !s.city) {
      return new Response("Champs obligatoires manquants dans une adresse.", { status: 400 })
    }
  }

  await saveSenders(senders)
  return Response.json({ senders: await listSenders() })
}
