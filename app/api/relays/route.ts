// GET /api/relays?cp=31000&city=Toulouse&address=20+rue...&country=FR
// Points de retrait COLISSIMO près d'une adresse (API publique pickup-stores de La Poste,
// le MÊME réseau que celui où le robot expédie → on peut choisir le relais EXACT).
// Endpoint PUBLIC (utilisé par le formulaire client).
const PICKUP_API =
  "https://www.laposte.fr/colis/occ/ecommerce/occ/v2/lpelPart/e-service/colis/pickup-stores"

export async function GET(req: Request) {
  const url = new URL(req.url)
  const cp = (url.searchParams.get("cp") ?? "").trim()
  const city = (url.searchParams.get("city") ?? "").trim()
  const address = (url.searchParams.get("address") ?? "").trim()
  const country = (url.searchParams.get("country") ?? "FR").toUpperCase() === "BE" ? "BE" : "FR"

  // pickup-stores exige une adresse complète (rue + CP + ville).
  if (!/^\d{4,5}$/.test(cp) || address.length < 3 || city.length < 2) {
    return Response.json({ points: [] })
  }

  try {
    const api = `${PICKUP_API}?address=${encodeURIComponent(address)}&postalCode=${encodeURIComponent(cp)}&town=${encodeURIComponent(city)}&country=${country}`
    const res = await fetch(api, { headers: { Accept: "application/json" } })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const data = (await res.json()) as { stores?: ColisStore[] }
    const points = (data.stores ?? [])
      .map((s) => ({
        code: s.name, // identifiant Colissimo du point (ex: "315550")
        name: s.displayName, // ex: "BUREAU DE POSTE TOULOUSE CAPITOLE"
        address: s.address?.line1 ?? "",
        zipcode: s.address?.postalCode ?? "",
        city: s.address?.town ?? "",
        latitude: s.geoPoint?.latitude ?? 0,
        longitude: s.geoPoint?.longitude ?? 0,
      }))
      .slice(0, 25)
    return Response.json({ points })
  } catch (err) {
    return new Response(`Recherche indisponible : ${String(err).slice(0, 120)}`, { status: 502 })
  }
}

type ColisStore = {
  name?: string
  displayName?: string
  address?: { line1?: string; postalCode?: string; town?: string }
  geoPoint?: { latitude?: number; longitude?: number }
}
