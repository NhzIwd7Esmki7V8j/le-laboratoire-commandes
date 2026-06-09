// ─────────────────────────────────────────────────────────────────────────────
// Module Boxtal — API V1 « EMC » (server-only).
//
// ✅ COTATION validée en réel le 2026-06-09 (HTTP 200, vrais tarifs).
//    Auth HTTP Basic (BOXTAL_V1_USER / BOXTAL_V1_PASS). Réponses XML. Endpoints en .xml.
//      • Cotation (GRATUITE)  : GET  /api/v1/cotation.xml
//      • Commande  (PAYANTE)  : POST /api/v1/order.xml
//    Base prod : www.envoimoinscher.com (pas de sandbox dispo → BOXTAL_ENV=prod).
//
// ⚠️ Les noms de paramètres sont en FRANÇAIS (expediteur/destinataire/colis_0, code_postal…),
//    contrairement à ce que la lib PHP « shipper/recipient » laissait croire.
//
// LOGISTIQUE choisie : « JE DÉPOSE » (l'expéditeur dépose le colis dans un point Mondial Relay).
//    • Livraison RELAIS    → MONR / CpourToi      (depot.pointrelais + retrait.pointrelais)
//    • Livraison DOMICILE  → MONR / DomicileFrance (depot.pointrelais)
//    SENDER_RELAY_ID = point de dépôt de l'expéditeur (ex: "MONR-13693").
//
// ▶ La création de commande (payante) sera CONFIRMÉE au 1er vrai bordereau ; les noms de
//   champs de l'ORDER sont basés sur les <mandatory_informations> de la cotation + l'API EMC.
//   Si un champ diffère, c'est ici (et seulement ici) qu'on l'ajuste.
// ─────────────────────────────────────────────────────────────────────────────

import { XMLParser } from "fast-xml-parser"
import type { Order } from "./orders"
import type { Sender } from "./senders"

const BASE = { test: "https://test.envoimoinscher.com", prod: "https://www.envoimoinscher.com" }
function baseUrl(): string {
  return (process.env.BOXTAL_ENV ?? "prod") === "test" ? BASE.test : BASE.prod
}
function authHeader(): string {
  const u = process.env.BOXTAL_V1_USER ?? ""
  const p = process.env.BOXTAL_V1_PASS ?? ""
  return "Basic " + Buffer.from(`${u}:${p}`).toString("base64")
}
const apiHeaders = () => ({
  Authorization: authHeader(),
  Accept: "application/xml",
  "Api-Version": "1.3.7",
})

// Service Mondial Relay selon le mode de livraison (mode « je dépose »).
const SERVICE = {
  domicile: { operator: "MONR", service: "DomicileFrance" },
  relais: { operator: "MONR", service: "CpourToi" },
}

const DEFAULT_WEIGHT = Number(process.env.DEFAULT_PARCEL_WEIGHT ?? "0.2") // kg
const DEFAULT_VALUE = Number(process.env.DEFAULT_PARCEL_VALUE ?? "15") // €
const DIMS = { longueur: 20, largeur: 15, hauteur: 5 } // cm (petit colis)
const CONTENT_CODE = process.env.BOXTAL_CONTENT_CODE ?? "10120"
const DESCRIPTION = process.env.BOXTAL_PARCEL_DESCRIPTION ?? "Produits"
const depotRelay = () => process.env.SENDER_RELAY_ID ?? ""

const xml = new XMLParser({ ignoreAttributes: false, parseTagValue: true, trimValues: true })

// ── Types exposés (interface stable) ─────────────────────────────────────────
export interface BoxtalAddress {
  country: string
  zipcode: string
  city: string
  address: string
  type: "company" | "individual"
  firstname: string
  lastname: string
  company?: string
  email: string
  phone: string
}
export interface BoxtalParcel {
  weight: number
  length: number
  width: number
  height: number
  value: number
}
export interface Quote {
  operatorCode: string
  operatorLabel: string
  serviceCode: string
  serviceLabel: string
  priceHT: number
  priceTTC: number
  currency: string
}
export interface ShipmentResult {
  shipmentId: string
  trackingNumber: string
  labelUrl: string
}
export interface RelayPoint {
  code: string
  name: string
  address: string
  zipcode: string
  city: string
}

// ── Helpers ──────────────────────────────────────────────────────────────────
function num(v: unknown): number {
  const n = Number(String(v ?? "").replace(",", "."))
  return Number.isFinite(n) ? n : 0
}
function frType(t: "company" | "individual"): string {
  return t === "company" ? "entreprise" : "particulier"
}
// Date de collecte = prochain jour ouvré (format ISO AAAA-MM-JJ exigé par l'API).
function nextBusinessDayISO(): string {
  const d = new Date()
  d.setDate(d.getDate() + 1)
  while (d.getDay() === 0 || d.getDay() === 6) d.setDate(d.getDate() + 1)
  return d.toISOString().slice(0, 10)
}
// Recherche récursive de tous les nœuds d'une clé (ex: "offer").
function collectNodes(obj: unknown, key: string, out: any[] = []): any[] {
  if (!obj || typeof obj !== "object") return out
  for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
    if (k === key) Array.isArray(v) ? out.push(...v) : out.push(v)
    if (v && typeof v === "object") collectNodes(v, key, out)
  }
  return out
}
// Premier nœud trouvé pour l'une des clés.
function findValue(obj: unknown, keys: string[]): string | undefined {
  if (!obj || typeof obj !== "object") return undefined
  for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
    if (keys.includes(k) && (typeof v === "string" || typeof v === "number")) return String(v)
    if (v && typeof v === "object") {
      const found = findValue(v, keys)
      if (found !== undefined) return found
    }
  }
  return undefined
}

// ── 1) Cotation (gratuite) ───────────────────────────────────────────────────
export async function getQuotes(
  sender: BoxtalAddress,
  recipient: BoxtalAddress,
  parcel: BoxtalParcel,
): Promise<Quote[]> {
  const params = new URLSearchParams({
    collecte: nextBusinessDayISO(),
    delai: "aucun",
    code_contenu: CONTENT_CODE,
    "expediteur.pays": sender.country,
    "expediteur.type": frType(sender.type),
    "expediteur.code_postal": sender.zipcode,
    "expediteur.ville": sender.city,
    "destinataire.pays": recipient.country,
    "destinataire.type": frType(recipient.type),
    "destinataire.code_postal": recipient.zipcode,
    "destinataire.ville": recipient.city,
    "colis_0.poids": String(parcel.weight),
    "colis_0.longueur": String(parcel.length),
    "colis_0.largeur": String(parcel.width),
    "colis_0.hauteur": String(parcel.height),
  })
  const res = await fetch(`${baseUrl()}/api/v1/cotation.xml?${params}`, { headers: apiHeaders() })
  const body = await res.text()
  if (!res.ok) throw new Error(`Cotation Boxtal ${res.status} : ${body.slice(0, 300)}`)

  return collectNodes(xml.parse(body), "offer").map((o: any): Quote => ({
    operatorCode: String(o?.operator?.code ?? ""),
    operatorLabel: String(o?.operator?.label ?? o?.operator?.code ?? ""),
    serviceCode: String(o?.service?.code ?? ""),
    serviceLabel: String(o?.service?.label ?? o?.service?.code ?? ""),
    priceHT: num(o?.price?.["tax-exclusive"]),
    priceTTC: num(o?.price?.["tax-inclusive"]),
    currency: String(o?.price?.currency ?? "EUR"),
  }))
}

// Sélection auto : le service Mondial Relay correspondant au mode (fallback = le moins cher MONR).
export function pickQuote(quotes: Quote[], mode: "domicile" | "relais"): Quote | null {
  const want = SERVICE[mode]
  const exact = quotes.find((q) => q.operatorCode === want.operator && q.serviceCode === want.service)
  if (exact) return exact
  const pool = quotes.filter((q) => q.operatorCode === want.operator)
  if (pool.length) return pool.slice().sort((a, b) => a.priceTTC - b.priceTTC)[0]
  return quotes.length ? quotes.slice().sort((a, b) => a.priceTTC - b.priceTTC)[0] : null
}

// ── 2) Commande / génération du bordereau (PAYANTE) ──────────────────────────
export async function createShipment(
  quote: Quote,
  sender: BoxtalAddress,
  recipient: BoxtalAddress,
  parcel: BoxtalParcel,
  opts: { relayCode?: string; description?: string; depotRelay?: string } = {},
): Promise<ShipmentResult> {
  const body = new URLSearchParams({
    collecte: nextBusinessDayISO(),
    delai: "aucun",
    code_contenu: CONTENT_CODE,
    operator: quote.operatorCode,
    service: quote.serviceCode,
    // Expéditeur (complet)
    "expediteur.pays": sender.country,
    "expediteur.type": frType(sender.type),
    "expediteur.civilite": "M",
    "expediteur.prenom": sender.firstname,
    "expediteur.nom": sender.lastname,
    "expediteur.societe": sender.company ?? "",
    "expediteur.adresse": sender.address,
    "expediteur.code_postal": sender.zipcode,
    "expediteur.ville": sender.city,
    "expediteur.email": sender.email,
    "expediteur.tel": sender.phone,
    // Destinataire (complet)
    "destinataire.pays": recipient.country,
    "destinataire.type": frType(recipient.type),
    "destinataire.civilite": "M",
    "destinataire.prenom": recipient.firstname,
    "destinataire.nom": recipient.lastname,
    "destinataire.adresse": recipient.address,
    "destinataire.code_postal": recipient.zipcode,
    "destinataire.ville": recipient.city,
    "destinataire.email": recipient.email,
    "destinataire.tel": recipient.phone,
    // Colis
    "colis_0.poids": String(parcel.weight),
    "colis_0.longueur": String(parcel.length),
    "colis_0.largeur": String(parcel.width),
    "colis_0.hauteur": String(parcel.height),
    "colis.description": opts.description ?? DESCRIPTION,
    "colis.valeur": String(parcel.value),
    // Point de dépôt de l'expéditeur (mode « je dépose ») — résolu auto, ou fallback env
    "depot.pointrelais": opts.depotRelay || depotRelay(),
    // Pas d'assurance complémentaire
    "assurance.selection": "non",
  })
  // Point relais de RETRAIT (livraison relais Mondial Relay uniquement)
  if (opts.relayCode) body.set("retrait.pointrelais", opts.relayCode)

  const res = await fetch(`${baseUrl()}/api/v1/order.xml`, {
    method: "POST",
    headers: { ...apiHeaders(), "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  })
  const text = await res.text()
  if (!res.ok) throw new Error(`Commande Boxtal ${res.status} : ${text.slice(0, 400)}`)

  const parsed = xml.parse(text)
  const ref = findValue(parsed, ["ref", "reference", "order_ref"]) ?? ""
  const tracking =
    findValue(parsed, ["tracking", "numero_suivi", "suivi", "number"]) ?? ref
  const labelUrl =
    findValue(parsed, ["etiquette", "bordereau", "label", "url"]) ?? labelEndpoint(ref)
  if (!ref) throw new Error(`Réponse commande sans référence : ${text.slice(0, 400)}`)

  return { shipmentId: ref, trackingNumber: tracking, labelUrl }
}

// Endpoint d'étiquette (fallback si la réponse ne fournit pas d'URL directe).
function labelEndpoint(ref: string): string {
  return `${baseUrl()}/api/v1/order/${encodeURIComponent(ref)}/labels.pdf`
}

// Télécharge le PDF de l'étiquette (avec auth) — pour sendDocument Telegram.
export async function fetchLabelPdf(shipmentIdOrUrl: string): Promise<Uint8Array> {
  const url = shipmentIdOrUrl.startsWith("http") ? shipmentIdOrUrl : labelEndpoint(shipmentIdOrUrl)
  const res = await fetch(url, { headers: { Authorization: authHeader() } })
  if (!res.ok) throw new Error(`Téléchargement étiquette → ${res.status}`)
  return new Uint8Array(await res.arrayBuffer())
}

// ── 3) Annulation ────────────────────────────────────────────────────────────
export async function cancelShipment(shipmentId: string): Promise<void> {
  await fetch(`${baseUrl()}/api/v1/order/${encodeURIComponent(shipmentId)}/cancel.xml`, {
    method: "POST",
    headers: apiHeaders(),
  })
}

// ── Point d'entrée réutilisable : Order + expéditeur → bordereau complet ──────
function senderToAddress(s: Sender): BoxtalAddress {
  return {
    country: s.country || "FR",
    zipcode: s.zipcode,
    city: s.city,
    address: s.street,
    type: "company",
    firstname: s.firstname,
    lastname: s.lastname,
    company: s.company || "Le Laboratoire",
    email: s.email,
    phone: s.phone,
  }
}

// Trouve un point de dépôt Mondial Relay près de l'expéditeur (l'API en exige un ;
// l'utilisateur peut de toute façon déposer dans n'importe quel point Mondial Relay).
async function resolveDepotRelay(zipcode: string, city: string): Promise<string> {
  try {
    const params = new URLSearchParams({ srv: "MONR", pays: "FR", cp: zipcode, ville: city })
    const res = await fetch(`${baseUrl()}/api/v1/listpoints.xml?${params}`, { headers: apiHeaders() })
    if (!res.ok) return depotRelay()
    const parsed = xml.parse(await res.text())
    const monr = collectNodes(parsed, "carrier").find((c: any) => String(c?.operator) === "MONR")
    const code = collectNodes(monr, "point")[0]?.code
    return code ? String(code) : depotRelay()
  } catch {
    return depotRelay()
  }
}

// Liste publique des points relais Mondial Relay près d'un code postal (formulaire client).
export async function listRelayPoints(
  country: string,
  zipcode: string,
  city: string,
): Promise<RelayPoint[]> {
  const params = new URLSearchParams({ srv: "MONR", pays: country || "FR", cp: zipcode, ville: city || "" })
  const res = await fetch(`${baseUrl()}/api/v1/listpoints.xml?${params}`, { headers: apiHeaders() })
  if (!res.ok) throw new Error(`Boxtal listpoints ${res.status}`)
  const monr = collectNodes(xml.parse(await res.text()), "carrier").find(
    (c: any) => String(c?.operator) === "MONR",
  )
  return collectNodes(monr, "point")
    .map((p: any): RelayPoint => ({
      code: String(p?.code ?? ""),
      name: String(p?.name ?? ""),
      address: String(p?.address ?? ""),
      zipcode: String(p?.zipcode ?? ""),
      city: String(p?.city ?? ""),
    }))
    .filter((p) => p.code)
}

function recipientFromOrder(order: Order): BoxtalAddress {
  return {
    country: order.pays,
    zipcode: order.codePostal ?? "",
    city: order.ville ?? "",
    address: order.adresse ?? order.pointRelais ?? "",
    type: "individual",
    firstname: order.prenom,
    lastname: order.nom,
    // On ne collecte pas l'email client → fallback expéditeur (Boxtal l'exige).
    // La notif de retrait Mondial Relay se fait par SMS via le téléphone.
    email: process.env.SENDER_EMAIL ?? "",
    phone: order.telephone,
  }
}

export async function generateLabel(
  order: Order,
  senderInput: Sender,
): Promise<ShipmentResult & { pdf: Uint8Array }> {
  const sender = senderToAddress(senderInput)
  const recipient = recipientFromOrder(order)
  const parcel: BoxtalParcel = {
    weight: DEFAULT_WEIGHT,
    length: DIMS.longueur,
    width: DIMS.largeur,
    height: DIMS.hauteur,
    value: DEFAULT_VALUE,
  }

  const depot = await resolveDepotRelay(sender.zipcode, sender.city)
  const quotes = await getQuotes(sender, recipient, parcel)
  const quote = pickQuote(quotes, order.deliveryMode)
  if (!quote) throw new Error("Aucune offre transporteur disponible pour cette commande.")

  const shipment = await createShipment(quote, sender, recipient, parcel, {
    relayCode: order.deliveryMode === "relais" ? order.relayId : undefined,
    depotRelay: depot,
  })
  const pdf = await fetchLabelPdf(shipment.labelUrl || shipment.shipmentId)
  return { ...shipment, pdf }
}
