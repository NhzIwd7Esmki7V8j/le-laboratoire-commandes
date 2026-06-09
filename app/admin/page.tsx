"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { toast } from "sonner"
import {
  FlaskConical,
  RefreshCw,
  LogOut,
  Lock,
  Home,
  Package,
  Phone,
  User,
  MapPin,
  Copy,
  FileText,
  Loader2,
  XCircle,
  CheckCircle2,
  CreditCard,
  Beaker,
  ChevronRight,
  ChevronDown,
  Settings,
  Plus,
  Trash2,
  Star,
  ArrowLeft,
} from "lucide-react"

// ── Types ────────────────────────────────────────────────────────────────────
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

interface Sender {
  id: string
  firstname: string
  lastname: string
  company?: string
  street: string
  zipcode: string
  city: string
  country: string
  phone: string
  email: string
  isDefault?: boolean
}

const STATUS: Record<OrderStatus, { label: string; emoji: string; cls: string }> = {
  pending: { label: "En attente", emoji: "⏳", cls: "bg-amber-100 text-amber-700 border-amber-200" },
  accepted: { label: "À payer", emoji: "🟡", cls: "bg-violet-100 text-violet-700 border-violet-200" },
  paid: { label: "À expédier", emoji: "📦", cls: "bg-indigo-100 text-indigo-700 border-indigo-200" },
  generating: { label: "Génération…", emoji: "🟢", cls: "bg-sky-100 text-sky-700 border-sky-200" },
  label_generated: { label: "Expédiée", emoji: "🚀", cls: "bg-emerald-100 text-emerald-700 border-emerald-200" },
  cancelled: { label: "Annulée", emoji: "❌", cls: "bg-rose-100 text-rose-700 border-rose-200" },
}

const TABS: { key: string; label: string; status?: OrderStatus }[] = [
  { key: "all", label: "Toutes" },
  { key: "pending", label: "En attente", status: "pending" },
  { key: "accepted", label: "À payer", status: "accepted" },
  { key: "paid", label: "À expédier", status: "paid" },
  { key: "label_generated", label: "Expédiées", status: "label_generated" },
]

const FLAG = { FR: "🇫🇷", BE: "🇧🇪" } as const

function fmtDate(ms: number): string {
  return new Date(ms).toLocaleString("fr-FR", {
    day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit",
  })
}
function addrSummary(o: Order): string {
  if (o.deliveryMode === "relais") return o.pointRelais || `Point relais ${o.codePostal ?? ""} ${o.ville ?? ""}`.trim()
  return [o.adresse, o.codePostal, o.ville].filter(Boolean).join(", ")
}

export default function AdminPage() {
  const [authed, setAuthed] = useState<boolean | null>(null)
  const [password, setPassword] = useState("")
  const [loginBusy, setLoginBusy] = useState(false)
  const [loginError, setLoginError] = useState("")

  const [orders, setOrders] = useState<Order[]>([])
  const [loading, setLoading] = useState(false)
  const [tab, setTab] = useState("all")
  const [filterOpen, setFilterOpen] = useState(false)
  const [selected, setSelected] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [busyKey, setBusyKey] = useState<string | null>(null)
  const [senders, setSenders] = useState<Sender[]>([])
  const [view, setView] = useState<"orders" | "senders">("orders")
  const busyRef = useRef(false)
  useEffect(() => { busyRef.current = busy }, [busy])

  const apiFetch = useCallback(async (path: string, init?: RequestInit) => {
    const res = await fetch(path, {
      ...init,
      credentials: "include",
      headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
    })
    if (res.status === 401) throw new Error("__unauth__")
    if (!res.ok) throw new Error((await res.text()) || `Erreur ${res.status}`)
    return res.json()
  }, [])

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const { orders } = await apiFetch("/api/admin/orders")
      setOrders(orders ?? [])
      setAuthed(true)
      try {
        const { senders } = await apiFetch("/api/admin/senders")
        setSenders(senders ?? [])
      } catch {
        /* non bloquant */
      }
    } catch (e) {
      if (String(e).includes("__unauth__")) setAuthed(false)
      else {
        toast.error("Chargement impossible", { description: String(e).slice(0, 120) })
        // Évite un chargement infini si le 1er appel échoue → on montre l'écran de connexion.
        setAuthed((a) => (a === null ? false : a))
      }
    } finally {
      setLoading(false)
    }
  }, [apiFetch])

  // Au montage : on tente de charger (le cookie décide si on est connecté).
  useEffect(() => { load() }, [load])

  // Refresh au RETOUR sur l'onglet/la fenêtre (pas de polling de fond).
  useEffect(() => {
    if (!authed) return
    const refresh = () => { if (!document.hidden && !busyRef.current) load() }
    window.addEventListener("focus", refresh)
    document.addEventListener("visibilitychange", refresh)
    return () => {
      window.removeEventListener("focus", refresh)
      document.removeEventListener("visibilitychange", refresh)
    }
  }, [authed, load])

  const doLogin = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    // Lit le mot de passe DIRECTEMENT depuis le champ (robuste si l'autofill mobile
    // n'a pas déclenché le onChange React et laissé l'état vide).
    const pwd = (new FormData(e.currentTarget).get("password")?.toString() || password || "").trim()
    setLoginBusy(true)
    setLoginError("")
    try {
      const res = await fetch("/api/admin/login", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: pwd }),
      })
      if (!res.ok) {
        setLoginError("Mot de passe incorrect.")
        return
      }
      setPassword("")
      await load()
    } catch {
      setLoginError("Erreur de connexion. Réessayez.")
    } finally {
      setLoginBusy(false)
    }
  }

  const logout = async () => {
    await fetch("/api/admin/logout", { method: "POST", credentials: "include" }).catch(() => {})
    setAuthed(false)
    setOrders([])
    setSelected(null)
  }

  // Mise à jour optimiste : on remplace la commande modifiée localement (instantané).
  const applyUpdated = (u: Order | null | undefined) => {
    if (!u) return
    setOrders((prev) => prev.map((o) => (o.ref === u.ref ? u : o)))
  }

  // Annuler = SUPPRIMER la commande (Boxtal + Telegram + base) → disparaît de la liste.
  const remove = async (ref: string) => {
    setBusy(true)
    setBusyKey("remove")
    try {
      await apiFetch(`/api/admin/orders/${ref}`, { method: "DELETE" })
      setOrders((prev) => prev.filter((o) => o.ref !== ref))
      setSelected(null)
      toast.success("Commande supprimée 🗑️")
    } catch (e) {
      toast.error("Échec de la suppression", { description: String(e).slice(0, 140) })
    } finally {
      setBusy(false)
      setBusyKey(null)
    }
  }

  // Génère le bordereau avec l'expéditeur choisi.
  const generate = async (ref: string, senderId: string) => {
    setBusy(true)
    setBusyKey("generate")
    try {
      const { order } = await apiFetch(`/api/admin/orders/${ref}/generate`, {
        method: "POST",
        body: JSON.stringify({ senderId }),
      })
      applyUpdated(order)
      toast.success("Bordereau généré ✅", { description: "PDF envoyé dans le canal Telegram." })
    } catch (e) {
      toast.error("Échec de la génération", { description: String(e).slice(0, 140) })
    } finally {
      setBusy(false)
      setBusyKey(null)
    }
  }

  // Enregistre la liste d'expéditeurs (remplace la liste complète côté serveur).
  const persistSenders = async (list: Sender[]) => {
    const { senders } = await apiFetch("/api/admin/senders", {
      method: "PUT",
      body: JSON.stringify({ senders: list }),
    })
    setSenders(senders ?? [])
  }

  const setStatus = async (ref: string, status: OrderStatus, label: string, key = "status") => {
    setBusy(true)
    setBusyKey(key)
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
      setBusyKey(null)
    }
  }

  const downloadPdf = async (ref: string) => {
    try {
      const res = await fetch(`/api/admin/orders/${ref}/label`, { credentials: "include" })
      if (!res.ok) throw new Error(await res.text())
      const url = URL.createObjectURL(await res.blob())
      window.open(url, "_blank")
    } catch {
      toast.error("PDF indisponible", { description: "Le bordereau reste dans le canal Telegram." })
    }
  }

  const copy = (txt: string) =>
    navigator.clipboard?.writeText(txt).then(() => toast.success("Copié"), () => {})

  const counts = useMemo(() => {
    const m: Record<string, number> = { all: orders.length }
    for (const t of TABS) if (t.status) m[t.key] = orders.filter((o) => o.status === t.status).length
    return m
  }, [orders])

  const filtered = useMemo(() => {
    const status = TABS.find((t) => t.key === tab)?.status
    return status ? orders.filter((o) => o.status === status) : orders
  }, [orders, tab])

  const current = useMemo(() => orders.find((o) => o.ref === selected) ?? null, [orders, selected])

  // ── Écran de connexion (par défaut tant qu'on n'est pas authentifié) ────────
  // On l'affiche immédiatement pour `null` (vérification en cours) ET `false`,
  // pour ne JAMAIS rester bloqué sur un écran de chargement (cold start lent).
  if (authed !== true) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-slate-100 to-violet-100 p-4">
        <form
          onSubmit={doLogin}
          className="w-full max-w-sm rounded-2xl border border-violet-200 bg-white p-8 shadow-xl"
        >
          <div className="mb-6 text-center">
            <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-violet-600 to-fuchsia-600">
              <FlaskConical className="h-7 w-7 text-white" />
            </div>
            <h1 className="text-xl font-bold text-slate-900">Le Laboratoire</h1>
            <p className="text-sm text-slate-500">Back-office — espace réservé</p>
          </div>
          <label className="mb-1.5 flex items-center gap-1.5 text-sm font-medium text-slate-700">
            <Lock className="h-4 w-4 text-violet-500" /> Mot de passe
          </label>
          <input
            type="password"
            name="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full rounded-lg border border-slate-300 px-3 py-2.5 outline-none focus:border-violet-500 focus:ring-2 focus:ring-violet-200"
            placeholder="••••••••"
          />
          {loginError && <p className="mt-2 text-sm text-rose-600">{loginError}</p>}
          <button
            type="submit"
            disabled={loginBusy}
            className="mt-5 flex w-full items-center justify-center gap-2 rounded-lg bg-violet-600 py-2.5 font-semibold text-white transition hover:bg-violet-700 disabled:opacity-60"
          >
            {loginBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Lock className="h-4 w-4" />}
            Se connecter
          </button>
        </form>
      </div>
    )
  }

  // ── Back-office ─────────────────────────────────────────────────────────────
  return (
    <div className="flex min-h-screen flex-col bg-slate-100 text-slate-800">
      {/* Header */}
      <header className="flex items-center justify-between gap-2 bg-gradient-to-r from-violet-700 to-fuchsia-700 px-4 py-3 text-white shadow sm:px-5">
        <div className="flex min-w-0 items-center gap-2">
          <FlaskConical className="h-5 w-5 shrink-0" />
          <span className="truncate font-bold">
            Le Laboratoire<span className="hidden sm:inline"> — Back-office</span>
          </span>
        </div>
        <div className="flex shrink-0 items-center gap-1 sm:gap-2">
          <button
            onClick={() => setView((v) => (v === "orders" ? "senders" : "orders"))}
            className="flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-sm hover:bg-white/15 sm:px-3"
            title="Expéditeurs"
          >
            <Settings className="h-4 w-4" />
            <span className="hidden sm:inline">Expéditeurs</span>
          </button>
          <button onClick={load} className="rounded-lg p-2 hover:bg-white/15" title="Rafraîchir">
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          </button>
          <button
            onClick={logout}
            className="flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-sm hover:bg-white/15 sm:px-3"
          >
            <LogOut className="h-4 w-4" />
            <span className="hidden sm:inline">Déconnexion</span>
          </button>
        </div>
      </header>

      {view === "senders" && (
        <SendersEditor
          senders={senders}
          busy={busy}
          onSave={persistSenders}
          onBack={() => setView("orders")}
        />
      )}
      {view === "orders" && (
      <>
      {/* (corps commandes ci-dessous) */}

      {/* Filtre — menu déroulant (mobile) */}
      <div className="relative z-30 border-b border-slate-200 bg-white px-3 py-2 md:hidden">
        <button
          onClick={() => setFilterOpen((o) => !o)}
          className="flex w-full items-center justify-between rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700"
        >
          <span>
            {TABS.find((t) => t.key === tab)?.label}{" "}
            <span className="text-slate-400">
              ({tab === "all" ? orders.length : counts[tab] ?? 0})
            </span>
          </span>
          <ChevronDown className={`h-4 w-4 text-slate-400 transition ${filterOpen ? "rotate-180" : ""}`} />
        </button>
        {filterOpen && (
          <div className="absolute left-3 right-3 mt-1 overflow-hidden rounded-lg border border-slate-200 bg-white shadow-lg">
            {TABS.map((t) => {
              const n = t.status ? counts[t.key] ?? 0 : orders.length
              const active = tab === t.key
              return (
                <button
                  key={t.key}
                  onClick={() => {
                    setTab(t.key)
                    setFilterOpen(false)
                  }}
                  className={`flex w-full items-center justify-between px-3 py-2.5 text-sm ${
                    active ? "bg-violet-50 font-semibold text-violet-700" : "text-slate-600 hover:bg-slate-50"
                  }`}
                >
                  <span>{t.label}</span>
                  <span className="text-slate-400">{n}</span>
                </button>
              )
            })}
          </div>
        )}
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar filtres (desktop) */}
        <aside className="hidden w-48 shrink-0 border-r border-slate-200 bg-white p-3 md:block">
          <nav className="space-y-1">
            {TABS.map((t) => {
              const n = t.status ? counts[t.key] ?? 0 : orders.length
              const active = tab === t.key
              return (
                <button
                  key={t.key}
                  onClick={() => setTab(t.key)}
                  className={`flex w-full items-center justify-between rounded-lg px-3 py-2 text-sm transition ${
                    active ? "bg-violet-600 font-semibold text-white" : "text-slate-600 hover:bg-slate-100"
                  }`}
                >
                  <span>{t.label}</span>
                  <span className={active ? "text-white/80" : "text-slate-400"}>{n}</span>
                </button>
              )
            })}
          </nav>
        </aside>

        {/* Liste */}
        <main className="flex-1 overflow-auto">
          {/* Tableau (desktop) */}
          <table className="hidden w-full border-collapse text-sm md:table">
            <thead className="sticky top-0 bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-2.5 font-medium">Réf</th>
                <th className="px-4 py-2.5 font-medium">Client</th>
                <th className="px-4 py-2.5 font-medium">Livraison</th>
                <th className="px-4 py-2.5 font-medium">Date</th>
                <th className="px-4 py-2.5 font-medium">Statut</th>
                <th className="px-2 py-2.5"></th>
              </tr>
            </thead>
            <tbody>
              {loading && orders.length === 0 ? (
                <tr><td colSpan={6} className="px-4 py-10 text-center text-slate-400">Chargement…</td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan={6} className="px-4 py-16 text-center text-slate-400">
                  <Beaker className="mx-auto mb-2 h-8 w-8 opacity-40" />
                  Aucune commande dans cette catégorie.
                </td></tr>
              ) : (
                filtered.map((o) => (
                  <tr
                    key={o.ref}
                    onClick={() => setSelected(o.ref)}
                    className={`cursor-pointer border-b border-slate-100 transition hover:bg-violet-50 ${
                      selected === o.ref ? "bg-violet-50" : "bg-white"
                    }`}
                  >
                    <td className="px-4 py-3 font-mono text-xs font-semibold text-violet-600">{o.ref}</td>
                    <td className="px-4 py-3">
                      <span className="font-medium">{o.prenom} {o.nom}</span> {FLAG[o.pays]}
                    </td>
                    <td className="px-4 py-3 text-slate-500">
                      <span className="inline-flex items-center gap-1">
                        {o.deliveryMode === "relais" ? <Package className="h-3.5 w-3.5" /> : <Home className="h-3.5 w-3.5" />}
                        <span className="max-w-[220px] truncate">{addrSummary(o)}</span>
                      </span>
                    </td>
                    <td className="px-4 py-3 text-slate-400">{fmtDate(o.createdAt)}</td>
                    <td className="px-4 py-3">
                      <span className={`rounded-full border px-2 py-0.5 text-xs font-medium ${STATUS[o.status].cls}`}>
                        {STATUS[o.status].emoji} {STATUS[o.status].label}
                      </span>
                    </td>
                    <td className="px-2 py-3 text-slate-300"><ChevronRight className="h-4 w-4" /></td>
                  </tr>
                ))
              )}
            </tbody>
          </table>

          {/* Cartes (mobile) */}
          <div className="space-y-2.5 p-3 md:hidden">
            {loading && orders.length === 0 ? (
              <p className="py-10 text-center text-slate-400">Chargement…</p>
            ) : filtered.length === 0 ? (
              <div className="py-16 text-center text-slate-400">
                <Beaker className="mx-auto mb-2 h-8 w-8 opacity-40" />
                Aucune commande dans cette catégorie.
              </div>
            ) : (
              filtered.map((o) => (
                <button
                  key={o.ref}
                  onClick={() => setSelected(o.ref)}
                  className="w-full rounded-xl border border-slate-200 bg-white p-3.5 text-left shadow-sm transition active:scale-[0.99]"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-xs font-semibold text-violet-600">{o.ref}</span>
                    <span className="text-[11px] text-slate-400">{fmtDate(o.createdAt)}</span>
                  </div>
                  <div className="mt-1.5 flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate font-semibold">{o.prenom} {o.nom} {FLAG[o.pays]}</p>
                      <p className="mt-0.5 flex items-center gap-1 truncate text-xs text-slate-500">
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
        </main>

        {/* Panneau détail */}
        {current && (
          <DetailPanel
            order={current}
            senders={senders}
            busy={busy}
            busyKey={busyKey}
            onClose={() => setSelected(null)}
            onAccept={() => setStatus(current.ref, "accepted", "Commande acceptée ✅", "accept")}
            onPaid={() => setStatus(current.ref, "paid", "Paiement validé 💳", "paid")}
            onGenerate={(senderId) => generate(current.ref, senderId)}
            onRemove={() => remove(current.ref)}
            onDownload={() => downloadPdf(current.ref)}
            onCopy={copy}
          />
        )}
      </div>
      </>
      )}
    </div>
  )
}

// ── Panneau détail (droite) ──────────────────────────────────────────────────
function DetailPanel({
  order, senders, busy, busyKey, onClose, onAccept, onPaid, onGenerate, onRemove, onDownload, onCopy,
}: {
  order: Order
  senders: Sender[]
  busy: boolean
  busyKey: string | null
  onClose: () => void
  onAccept: () => void
  onPaid: () => void
  onGenerate: (senderId: string) => void
  onRemove: () => void
  onDownload: () => void
  onCopy: (t: string) => void
}) {
  const defaultSenderId = senders.find((s) => s.isDefault)?.id ?? senders[0]?.id ?? ""
  const [genSender, setGenSender] = useState(defaultSenderId)
  useEffect(() => {
    if (!senders.find((s) => s.id === genSender)) setGenSender(defaultSenderId)
  }, [senders, genSender, defaultSenderId])
  const STEPS: OrderStatus[] = ["pending", "accepted", "paid", "generating", "label_generated"]
  const idx = STEPS.indexOf(order.status)
  const timeline = [
    { key: "pending", label: "Reçue" },
    { key: "paid", label: "Payée" },
    { key: "label_generated", label: "Expédiée" },
  ]

  return (
    <aside className="fixed inset-0 z-50 flex w-full flex-col bg-white md:relative md:inset-auto md:z-auto md:w-[380px] md:border-l md:border-slate-200">
      <div className="flex shrink-0 items-center justify-between border-b border-slate-100 px-4 py-3">
        <span className="font-mono text-sm font-bold text-violet-600">{order.ref}</span>
        <button
          onClick={onClose}
          className="flex items-center gap-1 rounded-lg px-2 py-1.5 text-sm font-medium text-slate-500 hover:bg-slate-100"
        >
          Fermer <XCircle className="h-5 w-5" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 pb-12">
        <span className={`inline-block rounded-full border px-2.5 py-1 text-xs font-medium ${STATUS[order.status].cls}`}>
          {STATUS[order.status].emoji} {STATUS[order.status].label}
        </span>

        {order.status !== "cancelled" && (
          <div className="my-4 flex items-center">
            {timeline.map((s, i) => {
              const reached = idx >= STEPS.indexOf(s.key as OrderStatus)
              return (
                <div key={s.key} className="flex flex-1 items-center last:flex-none">
                  <div className="flex flex-col items-center">
                    <div className={`h-3 w-3 rounded-full ${reached ? "bg-violet-600" : "bg-slate-300"}`} />
                    <span className="mt-1 text-[10px] text-slate-400">{s.label}</span>
                  </div>
                  {i < timeline.length - 1 && (
                    <div className={`mx-1 h-0.5 flex-1 ${idx > STEPS.indexOf(s.key as OrderStatus) ? "bg-violet-600" : "bg-slate-300"}`} />
                  )}
                </div>
              )
            })}
          </div>
        )}

        <div className="mt-3 space-y-2 text-sm">
          <Row icon={<User className="h-4 w-4" />}>{order.prenom} {order.nom} {FLAG[order.pays]}</Row>
          <Row icon={<Phone className="h-4 w-4" />}>
            <a href={`tel:${order.telephone}`} className="text-violet-600">{order.telephone}</a>
          </Row>
          <Row icon={order.deliveryMode === "relais" ? <Package className="h-4 w-4" /> : <Home className="h-4 w-4" />}>
            {order.deliveryMode === "relais" ? "Point relais" : "Livraison à domicile"}
          </Row>
          <Row icon={<MapPin className="h-4 w-4" />}>{addrSummary(order)}</Row>
          {order.relayId && <p className="pl-6 text-xs text-slate-400">ID relais : {order.relayId}</p>}
          {order.message && (
            <div className="rounded-lg bg-slate-50 p-2.5 text-sm">
              <p className="mb-0.5 text-xs font-medium text-slate-400">Commande & prix</p>
              <p className="italic text-slate-700">{order.message}</p>
            </div>
          )}
          {order.trackingNumber && (
            <button onClick={() => onCopy(order.trackingNumber!)} className="flex items-center gap-1.5 pl-6 font-mono text-xs text-emerald-600">
              📦 {order.trackingNumber} <Copy className="h-3 w-3" />
            </button>
          )}
        </div>

        <div className="mt-5 space-y-2">
          {order.status === "pending" && (
            <>
              <ActionBtn onClick={onAccept} disabled={busy} loading={busyKey === "accept"} primary icon={<CheckCircle2 className="h-4 w-4" />}>Accepter la commande</ActionBtn>
              <ActionBtn onClick={onRemove} disabled={busy} loading={busyKey === "remove"} danger icon={<Trash2 className="h-4 w-4" />}>Refuser</ActionBtn>
            </>
          )}
          {order.status === "accepted" && (
            <>
              <ActionBtn onClick={onPaid} disabled={busy} loading={busyKey === "paid"} primary icon={<CreditCard className="h-4 w-4" />}>Payé !</ActionBtn>
              <ActionBtn onClick={onRemove} disabled={busy} loading={busyKey === "remove"} danger icon={<Trash2 className="h-4 w-4" />}>Annuler la commande</ActionBtn>
            </>
          )}
          {order.status === "paid" &&
            (senders.length === 0 ? (
              <p className="rounded-lg bg-amber-50 p-3 text-center text-sm text-amber-700">
                Ajoute d'abord une adresse expéditeur (bouton « Expéditeurs » en haut).
              </p>
            ) : (
              <>
                <label className="block text-xs font-medium text-slate-500">Expédier depuis</label>
                <select
                  value={genSender}
                  onChange={(e) => setGenSender(e.target.value)}
                  className="mb-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                >
                  {senders.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.city} — {s.firstname} {s.lastname}
                      {s.isDefault ? " (défaut)" : ""}
                    </option>
                  ))}
                </select>
                <ActionBtn onClick={() => onGenerate(genSender)} disabled={busy} loading={busyKey === "generate"} primary icon={<Beaker className="h-4 w-4" />}>
                  Générer le bordereau
                </ActionBtn>
                <ActionBtn onClick={onRemove} disabled={busy} loading={busyKey === "remove"} danger icon={<Trash2 className="h-4 w-4" />}>
                  Annuler la commande
                </ActionBtn>
              </>
            ))}
          {order.status === "generating" && (
            <div className="flex items-center justify-center gap-2 rounded-lg bg-sky-50 py-3 text-sm font-medium text-sky-700">
              <Loader2 className="h-4 w-4 animate-spin" /> Génération en cours…
            </div>
          )}
          {order.status === "label_generated" && (
            <>
              <ActionBtn onClick={onDownload} success icon={<FileText className="h-4 w-4" />}>Télécharger le PDF</ActionBtn>
              <ActionBtn onClick={onRemove} disabled={busy} loading={busyKey === "remove"} danger icon={<Trash2 className="h-4 w-4" />}>Annuler le bordereau</ActionBtn>
            </>
          )}
        </div>
      </div>
    </aside>
  )
}

function Row({ icon, children }: { icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-slate-400">{icon}</span>
      <span>{children}</span>
    </div>
  )
}

function ActionBtn({
  onClick, disabled, loading, primary, danger, success, icon, children,
}: {
  onClick: () => void
  disabled?: boolean
  loading?: boolean
  primary?: boolean
  danger?: boolean
  success?: boolean
  icon: React.ReactNode
  children: React.ReactNode
}) {
  const cls = primary
    ? "bg-violet-600 text-white hover:bg-violet-700"
    : success
    ? "bg-emerald-600 text-white hover:bg-emerald-700"
    : danger
    ? "border border-rose-200 bg-rose-50 text-rose-600 hover:bg-rose-100"
    : "border border-slate-200 text-slate-700 hover:bg-slate-50"
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`flex w-full items-center justify-center gap-2 rounded-lg py-2.5 text-sm font-medium transition disabled:opacity-60 ${cls}`}
    >
      {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : icon}
      {children}
    </button>
  )
}

// ── Éditeur des adresses expéditeur ──────────────────────────────────────────
function SendersEditor({
  senders, busy, onSave, onBack,
}: {
  senders: Sender[]
  busy: boolean
  onSave: (list: Sender[]) => Promise<void>
  onBack: () => void
}) {
  const [list, setList] = useState<Sender[]>(senders)
  const [saving, setSaving] = useState(false)
  useEffect(() => { setList(senders) }, [senders])

  const blank = (): Sender => ({
    id: typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : `s_${Date.now()}`,
    firstname: "", lastname: "", company: "Le Laboratoire", street: "",
    zipcode: "", city: "", country: "FR", phone: "", email: "",
    isDefault: list.length === 0,
  })
  const update = (id: string, patch: Partial<Sender>) =>
    setList((l) => l.map((s) => (s.id === id ? { ...s, ...patch } : s)))
  const remove = (id: string) => setList((l) => l.filter((s) => s.id !== id))
  const setDefault = (id: string) => setList((l) => l.map((s) => ({ ...s, isDefault: s.id === id })))
  const add = () => setList((l) => [...l, blank()])

  const save = async () => {
    if (!list.every((s) => s.firstname && s.lastname && s.street && s.zipcode && s.city)) {
      toast.error("Complète chaque adresse (prénom, nom, rue, CP, ville).")
      return
    }
    setSaving(true)
    try {
      await onSave(list)
      toast.success("Expéditeurs enregistrés ✅")
    } catch (e) {
      toast.error("Échec de l'enregistrement", { description: String(e).slice(0, 140) })
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="flex-1 overflow-auto p-4">
      <div className="mx-auto max-w-2xl">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-bold">Mes adresses expéditeur</h2>
          <button onClick={onBack} className="flex items-center gap-1 text-sm text-violet-600">
            <ArrowLeft className="h-4 w-4" /> Commandes
          </button>
        </div>
        <p className="mb-4 text-sm text-slate-500">
          Enregistre tes adresses fixes ; tu choisiras laquelle au moment de générer un bordereau.
          L'adresse <Star className="inline h-3 w-3 fill-amber-400 text-amber-400" /> sert par défaut (Telegram).
        </p>

        <div className="space-y-3">
          {list.map((s) => (
            <div key={s.id} className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
              <div className="mb-2 flex items-center justify-between">
                <button onClick={() => setDefault(s.id)} className="flex items-center gap-1 text-xs font-medium text-slate-600">
                  <Star className={`h-4 w-4 ${s.isDefault ? "fill-amber-400 text-amber-400" : "text-slate-300"}`} />
                  {s.isDefault ? "Par défaut" : "Définir par défaut"}
                </button>
                <button onClick={() => remove(s.id)} className="text-rose-400 hover:text-rose-600">
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <Field label="Prénom" value={s.firstname} onChange={(v) => update(s.id, { firstname: v })} />
                <Field label="Nom" value={s.lastname} onChange={(v) => update(s.id, { lastname: v })} />
                <Field label="Société" value={s.company ?? ""} onChange={(v) => update(s.id, { company: v })} />
                <Field label="Téléphone" value={s.phone} onChange={(v) => update(s.id, { phone: v })} />
                <div className="col-span-2">
                  <Field label="Rue (n° + voie)" value={s.street} onChange={(v) => update(s.id, { street: v })} />
                </div>
                <Field label="Code postal" value={s.zipcode} onChange={(v) => update(s.id, { zipcode: v })} />
                <Field label="Ville" value={s.city} onChange={(v) => update(s.id, { city: v })} />
                <div className="col-span-2">
                  <Field label="Email" value={s.email} onChange={(v) => update(s.id, { email: v })} />
                </div>
              </div>
            </div>
          ))}
          {list.length === 0 && (
            <p className="rounded-xl border border-dashed border-slate-300 p-6 text-center text-sm text-slate-400">
              Aucune adresse. Ajoute ta première adresse expéditeur.
            </p>
          )}
        </div>

        <div className="mt-3 flex gap-2">
          <button onClick={add} className="flex items-center gap-1.5 rounded-lg border border-violet-300 px-3 py-2 text-sm font-medium text-violet-700 hover:bg-violet-50">
            <Plus className="h-4 w-4" /> Ajouter une adresse
          </button>
          <button onClick={save} disabled={saving || busy} className="ml-auto flex items-center gap-1.5 rounded-lg bg-violet-600 px-4 py-2 text-sm font-semibold text-white hover:bg-violet-700 disabled:opacity-60">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Enregistrer
          </button>
        </div>
      </div>
    </div>
  )
}

function Field({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label className="block">
      <span className="mb-0.5 block text-[11px] font-medium text-slate-500">{label}</span>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-lg border border-slate-300 px-2.5 py-1.5 text-sm outline-none focus:border-violet-500 focus:ring-1 focus:ring-violet-200"
      />
    </label>
  )
}
