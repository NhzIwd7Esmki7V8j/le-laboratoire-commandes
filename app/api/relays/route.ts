// GET /api/relays?cp=75001&country=FR&city=Paris — points relais Mondial Relay près d'un CP.
// Endpoint PUBLIC (utilisé par le formulaire client pour choisir un point relais).
import { listRelayPoints } from "@/lib/boxtal"

export async function GET(req: Request) {
  const url = new URL(req.url)
  const cp = (url.searchParams.get("cp") ?? "").trim()
  const country = (url.searchParams.get("country") ?? "FR").toUpperCase() === "BE" ? "BE" : "FR"
  const city = (url.searchParams.get("city") ?? "").trim()

  // CP : 5 chiffres (FR) ou 4 (BE)
  if (!/^\d{4,5}$/.test(cp)) return Response.json({ points: [] })

  try {
    const points = await listRelayPoints(country, cp, city)
    return Response.json({ points: points.slice(0, 25) })
  } catch (err) {
    return new Response(`Recherche indisponible : ${String(err).slice(0, 120)}`, { status: 502 })
  }
}
