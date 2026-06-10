"use client"

import { useState } from "react"
import { MapPin, Loader2, Search, Check, AlertCircle } from "lucide-react"

export type SelectedRelay = {
  id: string
  nom: string
  adresse: string
  cp: string
  ville: string
}

type Point = { code: string; name: string; address: string; zipcode: string; city: string }

// Sélecteur de Point Retrait Colissimo — basé sur l'API Boxtal (via /api/relays).
// Le client saisit son code postal, on liste les Points Retrait autour, il en choisit un.
export function RelayPicker({
  defaultPostCode,
  country = "FR",
  onSelect,
}: {
  defaultPostCode?: string
  country?: "FR" | "BE"
  onSelect: (relay: SelectedRelay) => void
}) {
  const [cp, setCp] = useState(defaultPostCode ?? "")
  const [points, setPoints] = useState<Point[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")
  const [searched, setSearched] = useState(false)
  const [selectedCode, setSelectedCode] = useState("")

  const maxLen = country === "BE" ? 4 : 5

  const search = async () => {
    const code = cp.trim()
    const ok = country === "BE" ? /^\d{4}$/.test(code) : /^\d{5}$/.test(code)
    if (!ok) {
      setError(`Entre un code postal valide (${maxLen} chiffres).`)
      return
    }
    setLoading(true)
    setError("")
    setSearched(true)
    setPoints([])
    try {
      const res = await fetch(`/api/relays?cp=${encodeURIComponent(code)}&country=${country}`)
      if (!res.ok) throw new Error(await res.text())
      const data = await res.json()
      setPoints(Array.isArray(data.points) ? data.points : [])
    } catch {
      setError("Recherche indisponible pour le moment. Réessaie.")
    } finally {
      setLoading(false)
    }
  }

  const pick = (p: Point) => {
    setSelectedCode(p.code)
    onSelect({ id: p.code, nom: p.name, adresse: p.address, cp: p.zipcode, ville: p.city })
  }

  return (
    <div className="space-y-3">
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

      {error && (
        <p className="flex items-center gap-1 text-sm text-red-600">
          <AlertCircle className="h-3.5 w-3.5" /> {error}
        </p>
      )}

      {searched && !loading && !error && points.length === 0 && (
        <p className="text-sm text-slate-500">
          Aucun Point Retrait Colissimo trouvé pour ce code postal. Vérifie le code ou essaie une commune proche.
        </p>
      )}

      {points.length > 0 && (
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
