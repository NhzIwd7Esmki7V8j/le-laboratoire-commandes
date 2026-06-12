"use client"

import { useEffect, useRef, useState } from "react"
import { MapPin, Loader2, Search, Check, AlertCircle, Pencil } from "lucide-react"
import "leaflet/dist/leaflet.css"

export type SelectedRelay = {
  id: string
  nom: string
  adresse: string
  cp: string
  ville: string
}

type Point = {
  code: string
  name: string
  address: string
  zipcode: string
  city: string
  latitude: number
  longitude: number
}

// Icône "pin" en SVG inline (pas d'asset image → compatible bundler/Workers).
function pinIcon(L: any, active: boolean) {
  const color = active ? "#7c3aed" : "#475569"
  return L.divIcon({
    className: "",
    html: `<svg width="30" height="30" viewBox="0 0 24 24" fill="${color}" stroke="white" stroke-width="1.2" style="filter:drop-shadow(0 1px 2px rgba(0,0,0,.4))"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5a2.5 2.5 0 110-5 2.5 2.5 0 010 5z"/></svg>`,
    iconSize: [30, 30],
    iconAnchor: [15, 30],
    tooltipAnchor: [0, -26],
  })
}

// Sélecteur de Point Retrait Colissimo — carte interactive + liste (API Boxtal via /api/relays).
export function RelayPicker({
  defaultPostCode,
  address = "",
  city = "",
  country = "FR",
  onSelect,
}: {
  defaultPostCode?: string
  address?: string
  city?: string
  country?: "FR" | "BE"
  onSelect: (relay: SelectedRelay) => void
}) {
  const [cp, setCp] = useState(defaultPostCode ?? "")
  const [points, setPoints] = useState<Point[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")
  const [searched, setSearched] = useState(false)
  const [selectedCode, setSelectedCode] = useState("")
  // Une fois un point choisi, on replie la carte/liste et le bouton devient « Modifier ».
  const [collapsed, setCollapsed] = useState(false)

  const mapEl = useRef<HTMLDivElement>(null)
  const mapRef = useRef<any>(null)
  const LRef = useRef<any>(null)
  const markersRef = useRef<Record<string, any>>({})
  // Ref pour éviter les closures périmées dans les handlers Leaflet.
  const pickRef = useRef<(p: Point) => void>(() => {})

  const maxLen = country === "BE" ? 4 : 5

  const pick = (p: Point) => {
    setSelectedCode(p.code)
    setCollapsed(true) // ferme la carte + la liste, affiche le récap + bouton « Modifier »
    onSelect({ id: p.code, nom: p.name, adresse: p.address, cp: p.zipcode, ville: p.city })
  }
  pickRef.current = pick

  const selectedPoint = points.find((p) => p.code === selectedCode)

  const search = async () => {
    const code = cp.trim()
    const ok = country === "BE" ? /^\d{4}$/.test(code) : /^\d{5}$/.test(code)
    if (!ok) {
      setError(`Entre un code postal valide (${maxLen} chiffres).`)
      return
    }
    if (address.trim().length < 3 || city.trim().length < 2) {
      setError("Renseigne d'abord ton adresse (rue + ville) au-dessus.")
      return
    }
    setLoading(true)
    setError("")
    setSearched(true)
    setSelectedCode("")
    setCollapsed(false)
    setPoints([])
    try {
      const res = await fetch(
        `/api/relays?cp=${encodeURIComponent(code)}&city=${encodeURIComponent(city)}&address=${encodeURIComponent(address)}&country=${country}`,
      )
      if (!res.ok) throw new Error(await res.text())
      const data = await res.json()
      setPoints(Array.isArray(data.points) ? data.points : [])
    } catch {
      setError("Recherche indisponible pour le moment. Réessaie.")
    } finally {
      setLoading(false)
    }
  }

  // (Ré)affiche la carte + les markers quand la liste de points change.
  useEffect(() => {
    const withCoords = points.filter((p) => p.latitude && p.longitude)
    if (withCoords.length === 0) return
    let cancelled = false
    ;(async () => {
      const L = LRef.current ?? (await import("leaflet")).default
      if (cancelled || !mapEl.current) return
      LRef.current = L

      if (!mapRef.current) {
        mapRef.current = L.map(mapEl.current, { scrollWheelZoom: false })
        L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
          attribution: "&copy; OpenStreetMap",
          maxZoom: 19,
        }).addTo(mapRef.current)
      }
      const map = mapRef.current

      Object.values(markersRef.current).forEach((m: any) => m.remove())
      markersRef.current = {}

      withCoords.forEach((p) => {
        const marker = L.marker([p.latitude, p.longitude], { icon: pinIcon(L, false) })
          .addTo(map)
          .bindTooltip(p.name, { direction: "top" })
        marker.on("click", () => pickRef.current(p))
        markersRef.current[p.code] = marker
      })

      if (withCoords.length === 1) {
        map.setView([withCoords[0].latitude, withCoords[0].longitude], 15)
      } else {
        map.fitBounds(L.featureGroup(Object.values(markersRef.current)).getBounds().pad(0.2))
      }
      // Leaflet a besoin d'un recalcul après le rendu du conteneur.
      setTimeout(() => map.invalidateSize(), 80)
    })()
    return () => {
      cancelled = true
    }
  }, [points])

  // Met en évidence le marker sélectionné + recentre dessus.
  useEffect(() => {
    const L = LRef.current
    if (!L) return
    Object.entries(markersRef.current).forEach(([code, m]: [string, any]) => {
      m.setIcon(pinIcon(L, code === selectedCode))
      if (code === selectedCode) m.setZIndexOffset(1000)
      else m.setZIndexOffset(0)
    })
    const m = markersRef.current[selectedCode]
    if (m && mapRef.current) mapRef.current.panTo(m.getLatLng())
  }, [selectedCode])

  // Quand on ré-ouvre (« Modifier »), la carte était masquée → recalcul de taille.
  useEffect(() => {
    if (!collapsed && mapRef.current) {
      setTimeout(() => mapRef.current?.invalidateSize(), 80)
    }
  }, [collapsed])

  // Nettoyage à la destruction du composant.
  useEffect(
    () => () => {
      if (mapRef.current) {
        mapRef.current.remove()
        mapRef.current = null
      }
    },
    [],
  )

  const hasMap = points.some((p) => p.latitude && p.longitude)

  return (
    <div className="space-y-3">
      {collapsed && selectedPoint ? (
        // Replié : le point choisi remplit le champ, le bouton devient « Modifier »
        <div className="flex gap-2">
          <div className="flex min-w-0 flex-1 flex-col justify-center rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-2">
            <span className="truncate text-sm font-medium text-emerald-800">{selectedPoint.name}</span>
            <span className="truncate text-xs text-emerald-700">
              {selectedPoint.address}, {selectedPoint.zipcode} {selectedPoint.city}
            </span>
          </div>
          <button
            type="button"
            onClick={() => setCollapsed(false)}
            className="flex shrink-0 items-center gap-2 rounded-lg border border-violet-300 bg-white px-4 py-2.5 font-medium text-violet-700 transition hover:bg-violet-50"
          >
            <Pencil className="h-4 w-4" />
            Modifier
          </button>
        </div>
      ) : (
        <div className="flex gap-2">
          <input
            value={cp}
            onChange={(e) => setCp(e.target.value.replace(/[^0-9]/g, "").slice(0, maxLen))}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault()
                search()
              }
            }}
            inputMode="numeric"
            placeholder={`Code postal (${maxLen} chiffres)`}
            className="flex-1 rounded-lg border border-slate-300 px-3 py-2.5 outline-none focus-visible:ring-2 focus-visible:ring-violet-500"
          />
          <button
            type="button"
            onClick={search}
            disabled={loading}
            className="flex shrink-0 items-center gap-2 rounded-lg bg-violet-600 px-4 py-2.5 font-medium text-white transition hover:bg-violet-700 disabled:opacity-60"
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
            Rechercher
          </button>
        </div>
      )}

      {!collapsed && error && (
        <p className="flex items-center gap-1 text-sm text-red-600">
          <AlertCircle className="h-3.5 w-3.5" /> {error}
        </p>
      )}

      {!collapsed && searched && !loading && !error && points.length === 0 && (
        <p className="text-sm text-slate-500">
          Aucun Point Retrait Colissimo trouvé pour ce code postal. Vérifie le code ou essaie une commune proche.
        </p>
      )}

      {/* Carte interactive : clique un point pour le choisir */}
      <div
        ref={mapEl}
        className={`${hasMap && !collapsed ? "block" : "hidden"} h-64 w-full overflow-hidden rounded-lg border border-slate-200`}
        style={{ zIndex: 0 }}
      />

      {!collapsed && points.length > 0 && (
        <div className="max-h-72 space-y-2 overflow-auto rounded-lg border border-slate-100 p-1">
          {points.map((p) => {
            const active = selectedCode === p.code
            return (
              <button
                type="button"
                key={p.code}
                onClick={() => pick(p)}
                className={`flex w-full items-start gap-2 rounded-lg border p-3 text-left transition ${
                  active
                    ? "border-violet-500 bg-violet-50"
                    : "border-slate-200 hover:border-violet-300 hover:bg-slate-50"
                }`}
              >
                <MapPin className={`mt-0.5 h-4 w-4 shrink-0 ${active ? "text-violet-600" : "text-slate-400"}`} />
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-slate-800">{p.name}</p>
                  <p className="truncate text-xs text-slate-500">
                    {p.address}, {p.zipcode} {p.city}
                  </p>
                </div>
                {active && <Check className="h-4 w-4 shrink-0 text-violet-600" />}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
