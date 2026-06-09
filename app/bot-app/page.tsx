"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { toast } from "sonner"
import {
  FlaskConical,
  Home,
  Package,
  Phone,
  User,
  MapPin,
  Copy,
  FileText,
  Loader2,
  RefreshCw,
  XCircle,
  CheckCircle2,
  CreditCard,
  Beaker,
} from "lucide-react"

// ── Types (sous-ensemble du modèle serveur) ─────────────────────────────────
type OrderStatus = "pending" | "accepted" | "paid" | "generating" | "label_generated" | "cancelled"
interface Order {
  ref: string
  status: OrderStatus
  createdAt: number
  nom: string
  prenom: string
  telephone: string
  message?: string
  deliveryMode: "domicile" | "relais"
  pays: "FR" | "BE"
  adresse?: string
  codePostal?: string
  ville?: string
  pointRelais?: string
  relayId?: string
  trackingNumber?: string
  labelUrl?: string
}

// ── Config statuts (libellé, couleurs, emoji) ───────────────────────────────
const STATUS: Record<OrderStatus, { label: string; emoji: string; cls: string }> = {
  pending: { label: "En attente", emoji: "⏳", cls: "bg-amber-100 text-amber-700 border-amber-200" },
  accepted: { label: "À payer", emoji: "💳", cls: "bg-violet-100 text-violet-700 border-violet-200" },
  paid: { label: "À expédier", emoji: "📦", cls: "bg-indigo-100 text-indigo-700 border-indigo-200" },
  generating: { label: "Génération…", emoji: "🟢", cls: "bg-sky-100 text-sky-700 border-sky-200" },
  label_generated: { label: "Expédiée", emoji: "🚀", cls: "bg-emerald-100 text-emerald-700 border-emerald-200" },
  cancelled: { label: "Annulée", emoji: "❌", cls: "bg-rose-100 text-rose-700 border-rose-200" },
}

// Onglets de filtre (status undefined = toutes).
const TABS: { key: string; label: string; status?: OrderStatus }[] = [
  { key: "all", label: "📋 Toutes" },
  { key: "pending", label: "⏳ En attente", status: "pending" },
  { key: "accepted", label: "💳 À payer", status: "accepted" },
  { key: "paid", label: "📦 À expédier", status: "paid" },
  { key: "label_generated", label: "🚀 Expédiées", status: "label_generated" },
]

const FLAG = { FR: "🇫🇷", BE: "🇧🇪" } as const

function fmtDate(ms: number): string {
  return new Date(ms).toLocaleString("fr-FR", {
    day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit",
  })
}

function addrSummary(o: Order): string {
  if (o.deliveryMode === "relais") {
    return o.pointRelais || `Point relais ${o.codePostal ?? ""} ${o.ville ?? ""}`.trim()
  }
  return [o.adresse, o.codePostal, o.ville].filter(Boolean).join(", ")
}

export default function BotAppPage() {
  const [tg, setTg] = useState<any>(null)
  const initDataRef = useRef<string>("")
  const [orders, setOrders] = useState<Order[]>([])
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<string>("all")
  const [selected, setSelected] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  // Init SDK Telegram (le script se charge afterInteractive → on attend qu'il soit prêt).
  useEffect(() => {
    let tries = 0
    const id = setInterval(() => {
      const t = (window as any)?.Telegram?.WebApp
      if (t || tries++ > 25) {
        clearInterval(id)
        if (t) {
          t.ready()
          t.expand()
          initDataRef.current = t.initData ?? ""
          setTg(t)
        }
      }
    }, 80)
    return () => clearInterval(id)
  }, [])

  // Applique le thème Telegram (couleurs claires/sombres) au fond de page.
  const theme = tg?.themeParams ?? {}
  const bg = theme.secondary_bg_color ?? "#f5f5fa"
  const cardBg = theme.bg_color ?? "#ffffff"
  const text = theme.text_color ?? "#0f172a"
  const hint = theme.hint_color ?? "#64748b"

  const apiFetch = useCallback(async (path: string, init?: RequestInit) => {
    const res = await fetch(path, {
      ...init,
      headers: {
        ...(init?.headers ?? {}),
        "Content-Type": "application/json",
        "X-Telegram-Init-Data": initDataRef.current,
      },
    })
    if (!res.ok) throw new Error((await res.text()) || `Erreur ${res.status}`)
    return res.json()
  }, [])

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const { orders } = await apiFetch("/api/admin/orders")
      setOrders(orders ?? [])
    } catch (e) {
      toast.error("Chargement impossible", { description: String(e).slice(0, 120) })
    } finally {
      setLoading(false)
    }
  }, [apiFetch])

  // Charge dès que l'initData est dispo (ou en mode navigateur après le timeout).
  useEffect(() => {
    if (tg !== null) load()
    else {
      const t = setTimeout(() => load(), 2200)
      return () => clearTimeout(t)
    }
  }, [tg, load])

  // Refresh au RETOUR sur l'app (focus/visibilité) — pas de polling de fond.
  const busyRef = useRef(false)
  useEffect(() => {
    busyRef.current = busy
  }, [busy])
  useEffect(() => {
    const refresh = () => {
      if (!document.hidden && !busyRef.current) load()
    }
    window.addEventListener("focus", refresh)
    document.addEventListener("visibilitychange", refresh)
    return () => {
      window.removeEventListener("focus", refresh)
      document.removeEventListener("visibilitychange", refresh)
    }
  }, [load])

  // Mise à jour optimiste : remplace la commande modifiée localement (instantané).
  const applyUpdated = useCallback((u: Order | null | undefined) => {
    if (u) setOrders((prev) => prev.map((o) => (o.ref === u.ref ? u : o)))
  }, [])

  const counts = useMemo(() => {
    const toShip = orders.filter((o) => o.status === "accepted" || o.status === "paid").length
    const today = new Date().toDateString()
    const todayCount = orders.filter((o) => new Date(o.createdAt).toDateString() === today).length
    return { toShip, todayCount }
  }, [orders])

  const filtered = useMemo(() => {
    const status = TABS.find((t) => t.key === tab)?.status
    return status ? orders.filter((o) => o.status === status) : orders
  }, [orders, tab])

  const current = useMemo(() => orders.find((o) => o.ref === selected) ?? null, [orders, selected])

  // BackButton Telegram ↔ vue détail.
  useEffect(() => {
    if (!tg?.BackButton) return
    if (selected) {
      tg.BackButton.show()
      const onBack = () => setSelected(null)
      tg.BackButton.onClick(onBack)
      return () => tg.BackButton.offClick(onBack)
    }
    tg.BackButton.hide()
  }, [tg, selected])

  const doGenerate = useCallback(
    async (ref: string) => {
      setBusy(true)
      try {
        const { order } = await apiFetch(`/api/admin/orders/${ref}/generate`, { method: "POST" })
        applyUpdated(order)
        toast.success("Bordereau généré ✅", { description: "PDF envoyé dans le canal Telegram." })
      } catch (e) {
        toast.error("Échec de la génération", { description: String(e).slice(0, 140) })
      } finally {
        setBusy(false)
      }
    },
    [apiFetch, load],
  )

  // Annuler = SUPPRIMER : la commande disparaît du dashboard ET du canal Telegram.
  const doRemove = useCallback(
    async (ref: string) => {
      setBusy(true)
      try {
        await apiFetch(`/api/admin/orders/${ref}`, { method: "DELETE" })
        setOrders((prev) => prev.filter((o) => o.ref !== ref))
        setSelected(null)
        toast.success("Commande supprimée 🗑️")
      } catch (e) {
        toast.error("Échec de la suppression", { description: String(e).slice(0, 140) })
      } finally {
        setBusy(false)
      }
    },
    [apiFetch],
  )

  // Changement de statut manuel (Accepter / Refuser / Annuler) — sans Boxtal.
  const doSetStatus = useCallback(
    async (ref: string, status: OrderStatus, label: string) => {
      setBusy(true)
      try {
        const { order } = await apiFetch(`/api/admin/orders/${ref}`, {
          method: "PATCH",
          body: JSON.stringify({ status }),
        })
        applyUpdated(order)
        toast.success(label)
      } catch (e) {
        toast.error("Échec", { description: String(e).slice(0, 140) })
      } finally {
        setBusy(false)
      }
    },
    [apiFetch, load],
  )

  const downloadPdf = useCallback(
    async (ref: string) => {
      try {
        const res = await fetch(`/api/admin/orders/${ref}/label`, {
          headers: { "X-Telegram-Init-Data": initDataRef.current },
        })
        if (!res.ok) throw new Error(await res.text())
        const blob = await res.blob()
        const url = URL.createObjectURL(blob)
        if (tg?.openLink) tg.openLink(url)
        else window.open(url, "_blank")
      } catch (e) {
        toast.error("PDF indisponible", { description: "Le bordereau reste accessible dans le canal Telegram." })
      }
    },
    [tg],
  )

  const copy = (txt: string) => {
    navigator.clipboard?.writeText(txt).then(
      () => toast.success("Copié"),
      () => toast.error("Copie impossible"),
    )
  }

  return (
    <main style={{ background: bg, color: text, minHeight: "100vh" }} className="pb-10">
      {/* Header */}
      <header
        className="sticky top-0 z-10 px-4 py-3 shadow-sm"
        style={{ background: "linear-gradient(135deg,#6d28d9,#9333ea)", color: "#fff" }}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <FlaskConical className="h-5 w-5" />
            <span className="font-bold">Le Laboratoire — Commandes</span>
          </div>
          <button onClick={load} className="rounded-full p-1.5 hover:bg-white/15" aria-label="Rafraîchir">
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          </button>
        </div>
        <p className="mt-0.5 text-xs text-white/80">
          {counts.toShip} à traiter · {counts.todayCount} aujourd&apos;hui · {orders.length} au total
        </p>
      </header>

      {!current ? (
        <>
          {/* Onglets filtres */}
          <div className="flex gap-2 overflow-x-auto px-3 py-3 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {TABS.map((t) => {
              const active = tab === t.key
              const n = t.status ? orders.filter((o) => o.status === t.status).length : orders.length
              return (
                <button
                  key={t.key}
                  onClick={() => setTab(t.key)}
                  className={`whitespace-nowrap rounded-full border px-3 py-1.5 text-sm font-medium transition ${
                    active ? "border-violet-600 bg-violet-600 text-white" : "border-slate-200 bg-white text-slate-600"
                  }`}
                >
                  {t.label} <span className={active ? "text-white/80" : "text-slate-400"}>({n})</span>
                </button>
              )
            })}
          </div>

          {/* Liste */}
          <div className="space-y-2.5 px-3">
            {loading ? (
              [...Array(4)].map((_, i) => (
                <div key={i} className="h-24 animate-pulse rounded-xl bg-slate-200/60" />
              ))
            ) : filtered.length === 0 ? (
              <div className="py-16 text-center text-sm" style={{ color: hint }}>
                <Beaker className="mx-auto mb-2 h-8 w-8 opacity-40" />
                Aucune commande dans cette catégorie.
              </div>
            ) : (
              filtered.map((o) => (
                <button
                  key={o.ref}
                  onClick={() => setSelected(o.ref)}
                  style={{ background: cardBg }}
                  className="w-full rounded-xl border border-slate-200 p-3.5 text-left shadow-sm transition active:scale-[0.99]"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-xs font-semibold text-violet-600">{o.ref}</span>
                    <span className="text-[11px]" style={{ color: hint }}>{fmtDate(o.createdAt)}</span>
                  </div>
                  <div className="mt-1.5 flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate font-semibold">
                        {o.prenom} {o.nom} <span className="font-normal">{FLAG[o.pays]}</span>
                      </p>
                      <p className="mt-0.5 flex items-center gap-1 truncate text-xs" style={{ color: hint }}>
                        {o.deliveryMode === "relais" ? <Package className="h-3 w-3" /> : <Home className="h-3 w-3" />}
                        <span className="truncate">{addrSummary(o)}</span>
                      </p>
                    </div>
                    <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[11px] font-medium ${STATUS[o.status].cls}`}>
                      {STATUS[o.status].emoji} {STATUS[o.status].label}
                    </span>
                  </div>
                  {o.trackingNumber && (
                    <p className="mt-1.5 font-mono text-[11px] text-emerald-600">📦 {o.trackingNumber}</p>
                  )}
                </button>
              ))
            )}
          </div>
        </>
      ) : (
        /* ── Vue détail ─────────────────────────────────────────────── */
        <DetailView
          order={current}
          hint={hint}
          cardBg={cardBg}
          busy={busy}
          onBack={() => setSelected(null)}
          onGenerate={() => doGenerate(current.ref)}
          onRemove={() => doRemove(current.ref)}
          onSetStatus={(status, label) => doSetStatus(current.ref, status, label)}
          onDownload={() => downloadPdf(current.ref)}
          onCopy={copy}
        />
      )}
    </main>
  )
}

// ── Vue détail d'une commande ───────────────────────────────────────────────
function DetailView({
  order, hint, cardBg, busy, onBack, onGenerate, onRemove, onSetStatus, onDownload, onCopy,
}: {
  order: Order
  hint: string
  cardBg: string
  busy: boolean
  onBack: () => void
  onGenerate: () => void
  onRemove: () => void
  onSetStatus: (status: OrderStatus, label: string) => void
  onDownload: () => void
  onCopy: (t: string) => void
}) {
  const steps: { key: OrderStatus; label: string }[] = [
    { key: "pending", label: "Reçue" },
    { key: "paid", label: "Payée" },
    { key: "label_generated", label: "Expédiée" },
  ]
  const order_idx = ["pending", "accepted", "paid", "generating", "label_generated"].indexOf(order.status)

  return (
    <div className="px-3 py-4">
      <button onClick={onBack} className="mb-3 text-sm font-medium text-violet-600">← Retour</button>

      <div style={{ background: cardBg }} className="rounded-2xl border border-slate-200 p-4 shadow-sm">
        <div className="flex items-center justify-between">
          <span className="font-mono text-sm font-bold text-violet-600">{order.ref}</span>
          <span className={`rounded-full border px-2.5 py-1 text-xs font-medium ${STATUS[order.status].cls}`}>
            {STATUS[order.status].emoji} {STATUS[order.status].label}
          </span>
        </div>

        {/* Timeline */}
        {order.status !== "cancelled" && (
          <div className="my-4 flex items-center">
            {steps.map((s, i) => {
              const reached = order_idx >= ["pending", "accepted", "paid", "generating", "label_generated"].indexOf(s.key)
              return (
                <div key={s.key} className="flex flex-1 items-center last:flex-none">
                  <div className="flex flex-col items-center">
                    <div className={`h-3 w-3 rounded-full ${reached ? "bg-violet-600" : "bg-slate-300"}`} />
                    <span className="mt-1 text-[10px]" style={{ color: hint }}>{s.label}</span>
                  </div>
                  {i < steps.length - 1 && (
                    <div className={`mx-1 h-0.5 flex-1 ${order_idx > ["pending", "accepted", "paid", "generating", "label_generated"].indexOf(s.key) ? "bg-violet-600" : "bg-slate-300"}`} />
                  )}
                </div>
              )
            })}
          </div>
        )}

        {/* Infos client */}
        <div className="mt-3 space-y-2 text-sm">
          <Row icon={<User className="h-4 w-4" />} hint={hint}>{order.prenom} {order.nom} {FLAG[order.pays]}</Row>
          <Row icon={<Phone className="h-4 w-4" />} hint={hint}>
            <a href={`tel:${order.telephone}`} className="text-violet-600">{order.telephone}</a>
          </Row>
          <Row icon={order.deliveryMode === "relais" ? <Package className="h-4 w-4" /> : <Home className="h-4 w-4" />} hint={hint}>
            {order.deliveryMode === "relais" ? "Point relais" : "Livraison à domicile"}
          </Row>
          <Row icon={<MapPin className="h-4 w-4" />} hint={hint}>{addrSummary(order)}</Row>
          {order.relayId && <p className="pl-6 text-xs" style={{ color: hint }}>ID relais : {order.relayId}</p>}
          {order.message && (
            <p className="rounded-lg bg-slate-50 p-2.5 text-sm italic text-slate-600">« {order.message} »</p>
          )}
          {order.trackingNumber && (
            <button onClick={() => onCopy(order.trackingNumber!)} className="flex items-center gap-1.5 pl-6 font-mono text-xs text-emerald-600">
              📦 {order.trackingNumber} <Copy className="h-3 w-3" />
            </button>
          )}
        </div>

        {/* Actions */}
        <div className="mt-5 space-y-2">
          {order.status === "pending" && (
            <>
              <button
                onClick={() => onSetStatus("accepted", "Commande acceptée ✅")}
                disabled={busy}
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-violet-600 py-3 font-semibold text-white disabled:opacity-60"
              >
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                ✅ Accepter la commande
              </button>
              <button
                onClick={onRemove}
                disabled={busy}
                className="flex w-full items-center justify-center gap-2 rounded-xl border border-rose-200 bg-rose-50 py-2.5 font-medium text-rose-600 disabled:opacity-60"
              >
                <XCircle className="h-4 w-4" /> Refuser
              </button>
            </>
          )}
          {order.status === "accepted" && (
            <>
              <button
                onClick={() => onSetStatus("paid", "Paiement validé 💳")}
                disabled={busy}
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-violet-600 py-3 font-semibold text-white disabled:opacity-60"
              >
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <CreditCard className="h-4 w-4" />}
                💳 Payé !
              </button>
              <button
                onClick={onRemove}
                disabled={busy}
                className="flex w-full items-center justify-center gap-2 rounded-xl border border-rose-200 bg-rose-50 py-2.5 font-medium text-rose-600 disabled:opacity-60"
              >
                <XCircle className="h-4 w-4" /> Annuler la commande
              </button>
            </>
          )}
          {order.status === "paid" && (
            <>
              <button
                onClick={onGenerate}
                disabled={busy}
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-violet-600 py-3 font-semibold text-white disabled:opacity-60"
              >
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Beaker className="h-4 w-4" />}
                ⚗️ Générer le bordereau
              </button>
              <button
                onClick={onRemove}
                disabled={busy}
                className="flex w-full items-center justify-center gap-2 rounded-xl border border-rose-200 bg-rose-50 py-2.5 font-medium text-rose-600 disabled:opacity-60"
              >
                <XCircle className="h-4 w-4" /> Annuler la commande
              </button>
            </>
          )}
          {order.status === "generating" && (
            <div className="flex w-full items-center justify-center gap-2 rounded-xl bg-sky-50 py-3 text-sm font-medium text-sky-700">
              <Loader2 className="h-4 w-4 animate-spin" /> Génération en cours…
            </div>
          )}
          {order.status === "label_generated" && (
            <>
              <button onClick={onDownload} className="flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 py-3 font-semibold text-white">
                <FileText className="h-4 w-4" /> 📄 Télécharger le PDF
              </button>
              <button onClick={onRemove} disabled={busy} className="flex w-full items-center justify-center gap-2 rounded-xl border border-rose-200 bg-rose-50 py-2.5 font-medium text-rose-600 disabled:opacity-60">
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <XCircle className="h-4 w-4" />} Annuler le bordereau
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

function Row({ icon, hint, children }: { icon: React.ReactNode; hint: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2">
      <span style={{ color: hint }}>{icon}</span>
      <span>{children}</span>
    </div>
  )
}
