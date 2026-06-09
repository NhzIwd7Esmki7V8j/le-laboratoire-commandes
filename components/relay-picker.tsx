"use client"

import { useEffect, useRef, useState } from "react"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { MapPin, Loader2 } from "lucide-react"

// Code enseigne Mondial Relay. "BDTEST" = code de démo gratuit.
// À remplacer par le vrai code via NEXT_PUBLIC_MONDIAL_RELAY_BRAND une fois le compte créé.
const BRAND = process.env.NEXT_PUBLIC_MONDIAL_RELAY_BRAND || "BDTEST"

export type SelectedRelay = {
  id: string
  nom: string
  adresse: string
  cp: string
  ville: string
}

// --- Chargement des dépendances du widget (jQuery + Leaflet + plugin), une seule fois ---
let assetsPromise: Promise<void> | null = null

function loadScript(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    if (document.querySelector(`script[src="${src}"]`)) return resolve()
    const s = document.createElement("script")
    s.src = src
    s.async = false
    s.onload = () => resolve()
    s.onerror = () => reject(new Error(`Échec du chargement : ${src}`))
    document.body.appendChild(s)
  })
}

function loadCss(href: string) {
  if (document.querySelector(`link[href="${href}"]`)) return
  const l = document.createElement("link")
  l.rel = "stylesheet"
  l.href = href
  document.head.appendChild(l)
}

function loadMondialRelayAssets(): Promise<void> {
  if (assetsPromise) return assetsPromise
  assetsPromise = (async () => {
    loadCss("https://unpkg.com/leaflet@1.9.4/dist/leaflet.css")
    await loadScript("https://code.jquery.com/jquery-3.6.0.min.js")
    await loadScript("https://unpkg.com/leaflet@1.9.4/dist/leaflet.js")
    await loadScript(
      "https://widget.mondialrelay.com/parcelshop-picker/jquery.plugin.mondialrelay.parcelshoppicker.min.js",
    )
  })()
  return assetsPromise
}

export function RelayPicker({
  defaultPostCode,
  country = "FR",
  onSelect,
}: {
  defaultPostCode?: string
  country?: "FR" | "BE"
  onSelect: (relay: SelectedRelay) => void
}) {
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")

  // Refs pour ne pas réinitialiser le widget à chaque rendu
  const onSelectRef = useRef(onSelect)
  const postCodeRef = useRef(defaultPostCode)
  const countryRef = useRef(country)
  useEffect(() => {
    onSelectRef.current = onSelect
    postCodeRef.current = defaultPostCode
    countryRef.current = country
  }, [onSelect, defaultPostCode, country])

  useEffect(() => {
    if (!open) return
    let cancelled = false
    setLoading(true)
    setError("")

    loadMondialRelayAssets()
      .then(() => {
        if (cancelled) return
        const $ = (window as unknown as { $?: any }).$
        if (!$ || !$.fn || !$.fn.MR_ParcelShopPicker) {
          throw new Error("Widget indisponible")
        }
        // Léger délai : le conteneur de la modale (Radix) doit être visible
        setTimeout(() => {
          if (cancelled) return
          $("#mr-widget").MR_ParcelShopPicker({
            Target: "#mr-selected-id",
            Brand: BRAND,
            Country: countryRef.current || "FR",
            PostCode: postCodeRef.current || "",
            ColLivMod: "24R", // 24R = livraison en point relais
            NbResults: "7",
            ShowResultsOnMap: true,
            Responsive: true, // adapte la mise en page aux petits écrans
            OnParcelShopSelected: (data: Record<string, string>) => {
              const relay: SelectedRelay = {
                id: data?.ID ?? "",
                nom: data?.Nom ?? "",
                adresse: [data?.Adresse1, data?.Adresse2].filter(Boolean).join(" ").trim(),
                cp: data?.CP ?? "",
                ville: data?.Ville ?? "",
              }
              onSelectRef.current(relay)
              setOpen(false)
            },
          })
          setLoading(false)
        }, 250)
      })
      .catch(() => {
        if (cancelled) return
        setError(
          "Impossible de charger la carte des points relais. Vous pouvez réessayer ou saisir le point relais manuellement.",
        )
        setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [open])

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          type="button"
          variant="outline"
          className="gap-2 border-violet-300 text-violet-700 hover:bg-violet-50"
        >
          <MapPin className="h-4 w-4" />
          Choisir mon point relais sur la carte
        </Button>
      </DialogTrigger>
      <DialogContent className="w-[95vw] max-w-2xl max-h-[88vh] overflow-y-auto p-4 sm:p-6">
        <DialogHeader>
          <DialogTitle>Choisissez votre point relais</DialogTitle>
        </DialogHeader>

        {error ? (
          <p className="text-sm text-red-600 py-4">{error}</p>
        ) : (
          <>
            {loading && (
              <div className="flex items-center justify-center gap-2 py-6 text-slate-500">
                <Loader2 className="h-5 w-5 animate-spin" />
                Chargement de la carte...
              </div>
            )}
            <div id="mr-widget" className="w-full max-w-full overflow-x-hidden min-h-[440px]" />
            <input type="hidden" id="mr-selected-id" />
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
