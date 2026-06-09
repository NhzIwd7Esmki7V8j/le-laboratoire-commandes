// ─────────────────────────────────────────────────────────────────────────────
// Module Boxtal — génération de bordereaux d'expédition (server-only).
//
// Cible : API Boxtal V1 « EMC » (la mieux documentée, correspondant au compte Boxtal
// classique login/mot de passe). Auth HTTP Basic. Réponses en XML.
//   • Test (sandbox)  : https://test.envoimoinscher.com/
//   • Production       : https://www.envoimoinscher.com/
//
// ▶ PASSAGE EN PRODUCTION : mettre BOXTAL_ENV=prod dans les variables d'env (Netlify).
//   Rien d'autre à changer dans le code.
//
// ▶ POURQUOI une interface (getQuotes / createShipment / cancelShipment / generateLabel) ?
//   Toute l'incertitude API est isolée ICI. route.ts et la Mini App ne dépendent que de
//   cette interface. Si ton compte est en réalité sur la NOUVELLE API V3
//   (shipping.boxtal.com / shipping.boxtal.build, clés dédiées), seul l'intérieur de ce
//   fichier est à réécrire — le reste de l'app ne bouge pas.
//
// ⚠️ HYPOTHÈSES À VÉRIFIER LORS DU 1ᵉʳ APPEL SANDBOX (centralisées plus bas) :
//   1. Convention des params personnes : `shipper.*` / `recipient.*` en clés ANGLAISES
//      (country, zipcode, city, address, firstname, lastname, email, phone, type).
//   2. Params colis : `colis_0.poids|longueur|largeur|hauteur` (clés françaises).
//   3. Codes opérateurs : Colissimo = "POFR", Mondial Relay = "MONR" (cf. OPERATORS).
//   4. Param point relais : `retrait.pointrelais` = code relais Mondial Relay.
//   5. Endpoint d'étiquette PDF + champ tracking dans la réponse `order` (cf. plus bas).
//   6. Endpoint d'annulation.
// ─────────────────────────────────────────────────────────────────────────────

import { XMLParser } from "fast-xml-parser"
import type { Order } from "./orders"

// ── Configuration ────────────────────────────────────────────────────────────
const BASE = {
  test: "https://test.envoimoinscher.com",
  prod: "https://www.envoimoinscher.com",
}

function baseUrl(): string {
  return (process.env.BOXTAL_ENV ?? "test") === "prod" ? BASE.prod : BASE.test
}

function authHeader(): string {
  // L'API V1 utilise les identifiants login/mot de passe du compte Boxtal.
  const user = process.env.BOXTAL_V1_USER ?? ""
  const pass = process.env.BOXTAL_V1_PASS ?? ""
  return "Basic " + Buffer.from(`${user}:${pass}`).toString("base64")
}

// Codes opérateurs Boxtal ciblés selon le mode de livraison (HYPOTHÈSE #3).
const OPERATORS = {
  colissimo: ["POFR"], // Colissimo (La Poste) — livraison à domicile
  mondialRelay: ["MONR"], // Mondial Relay — point relais
}

const DEFAULT_WEIGHT = Number(process.env.DEFAULT_PARCEL_WEIGHT ?? "0.2") // kg
const DEFAULT_VALUE = Number(process.env.DEFAULT_PARCEL_VALUE ?? "15") // € (valeur déclarée)
// Dimensions par défaut d'un petit colis (cm) — ajustables au besoin.
const DEFAULT_DIMS = { longueur: 20, largeur: 15, hauteur: 5 }

const xml = new XMLParser({ ignoreAttributes: false, parseTagValue: true, trimValues: true })

// ── Types exposés ────────────────────────────────────────────────────────────
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
  weight: number // kg
  length: number // cm
  width: number
  height: number
  value: number // valeur déclarée €
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

// ── Helpers ──────────────────────────────────────────────────────────────────
async function boxtalGet(path: string, params: Record<string, string>): Promise<string> {
  const qs = new URLSearchParams(params).toString()
  const res = await fetch(`${baseUrl()}/${path}?${qs}`, {
    method: "GET",
    headers: { Authorization: authHeader(), Accept: "application/xml", "Api-Version": "1.3.7" },
  })
  const body = await res.text()
  if (!res.ok) throw new Error(`Boxtal GET ${path} → ${res.status} : ${body.slice(0, 300)}`)
  return body
}

async function boxtalPost(path: string, params: Record<string, string>): Promise<string> {
  const res = await fetch(`${baseUrl()}/${path}`, {
    method: "POST",
    headers: {
      Authorization: authHeader(),
      "Content-Type": "application/x-www-form-urlencoded",
      "Api-Version": "1.3.7",
    },
    body: new URLSearchParams(params).toString(),
  })
  const body = await res.text()
  if (!res.ok) throw new Error(`Boxtal POST ${path} → ${res.status} : ${body.slice(0, 300)}`)
  return body
}

// Recherche récursive de tous les nœuds portant une clé donnée (ex: "offer").
function collectNodes(obj: unknown, key: string, out: any[] = []): any[] {
  if (!obj || typeof obj !== "object") return out
  for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
    if (k === key) {
      if (Array.isArray(v)) out.push(...v)
      else out.push(v)
    }
    if (v && typeof v === "object") collectNodes(v, key, out)
  }
  return out
}

// Premier nœud trouvé pour l'une des clés (recherche récursive).
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

function num(v: unknown): number {
  const n = Number(String(v ?? "").replace(",", "."))
  return Number.isFinite(n) ? n : 0
}

// Params personne (expéditeur/destinataire) — HYPOTHÈSE #1 (clés anglaises préfixées).
function personParams(prefix: "shipper" | "recipient", a: BoxtalAddress): Record<string, string> {
  return {
    [`${prefix}.country`]: a.country,
    [`${prefix}.zipcode`]: a.zipcode,
    [`${prefix}.city`]: a.city,
    [`${prefix}.address`]: a.address,
    [`${prefix}.type`]: a.type,
    [`${prefix}.firstname`]: a.firstname,
    [`${prefix}.lastname`]: a.lastname,
    [`${prefix}.email`]: a.email,
    [`${prefix}.phone`]: a.phone,
    ...(a.company ? { [`${prefix}.company`]: a.company } : {}),
  }
}

// Params colis — HYPOTHÈSE #2.
function parcelParams(p: BoxtalParcel): Record<string, string> {
  return {
    "colis_0.poids": String(p.weight),
    "colis_0.longueur": String(p.length),
    "colis_0.largeur": String(p.width),
    "colis_0.hauteur": String(p.height),
    "colis_0.valeur": String(p.value),
  }
}

// ── 1) Cotation ──────────────────────────────────────────────────────────────
export async function getQuotes(
  sender: BoxtalAddress,
  recipient: BoxtalAddress,
  parcel: BoxtalParcel,
): Promise<Quote[]> {
  const body = await boxtalGet("api/v1/cotation", {
    "shipper.country": sender.country,
    "shipper.zipcode": sender.zipcode,
    "shipper.city": sender.city,
    "shipper.type": sender.type,
    "recipient.country": recipient.country,
    "recipient.zipcode": recipient.zipcode,
    "recipient.city": recipient.city,
    "recipient.type": recipient.type,
    ...parcelParams(parcel),
  })

  const parsed = xml.parse(body)
  const offers = collectNodes(parsed, "offer")
  return offers.map((o: any): Quote => ({
    operatorCode: String(o?.operator?.code ?? ""),
    operatorLabel: String(o?.operator?.label ?? o?.operator?.code ?? ""),
    serviceCode: String(o?.service?.code ?? ""),
    serviceLabel: String(o?.service?.label ?? o?.service?.code ?? ""),
    priceHT: num(o?.price?.["tax-exclusive"]),
    priceTTC: num(o?.price?.["tax-inclusive"]),
    currency: String(o?.price?.currency ?? "EUR"),
  }))
}

// Sélection automatique : Colissimo domicile (le moins cher) / Mondial Relay relais (le moins cher).
export function pickQuote(quotes: Quote[], mode: "domicile" | "relais"): Quote | null {
  const wanted = mode === "relais" ? OPERATORS.mondialRelay : OPERATORS.colissimo
  const matching = quotes.filter((q) => wanted.includes(q.operatorCode))
  const pool = matching.length ? matching : quotes // fallback : moins cher toutes offres
  if (!pool.length) return null
  return pool.slice().sort((a, b) => a.priceTTC - b.priceTTC)[0]
}

// ── 2) Commande / génération du bordereau ────────────────────────────────────
export async function createShipment(
  quote: Quote,
  sender: BoxtalAddress,
  recipient: BoxtalAddress,
  parcel: BoxtalParcel,
  opts: { relayCode?: string } = {},
): Promise<ShipmentResult> {
  const params: Record<string, string> = {
    ...personParams("shipper", sender),
    ...personParams("recipient", recipient),
    ...parcelParams(parcel),
    operator: quote.operatorCode,
    service: quote.serviceCode,
    "assurance.selection": "0",
    // Point relais de retrait (HYPOTHÈSE #4) — uniquement pour Mondial Relay.
    ...(opts.relayCode ? { "retrait.pointrelais": opts.relayCode } : {}),
  }

  const body = await boxtalPost("api/v1/order", params)
  const parsed = xml.parse(body)

  // Réf de commande Boxtal, tracking et URL d'étiquette (HYPOTHÈSE #5 — chemins défensifs).
  const ref = findValue(parsed, ["ref", "reference", "order_ref"]) ?? ""
  const tracking =
    findValue(parsed, ["tracking", "tracking_number", "number", "numero_suivi"]) ?? ref
  const labelUrl =
    findValue(parsed, ["url", "label_url", "etiquette", "waybill"]) ?? labelEndpoint(ref)

  if (!ref) throw new Error(`Réponse Boxtal sans référence de commande : ${body.slice(0, 300)}`)
  return { shipmentId: ref, trackingNumber: tracking, labelUrl }
}

// Endpoint d'étiquette (HYPOTHÈSE #5). Sert de fallback si la réponse ne fournit pas d'URL.
function labelEndpoint(ref: string): string {
  return `${baseUrl()}/api/v1/order/${encodeURIComponent(ref)}/document?type=waybill`
}

// Télécharge le PDF de l'étiquette (avec auth) — nécessaire pour sendDocument Telegram.
export async function fetchLabelPdf(shipmentIdOrUrl: string): Promise<Uint8Array> {
  const url = shipmentIdOrUrl.startsWith("http") ? shipmentIdOrUrl : labelEndpoint(shipmentIdOrUrl)
  const res = await fetch(url, { headers: { Authorization: authHeader() } })
  if (!res.ok) throw new Error(`Téléchargement étiquette → ${res.status}`)
  return new Uint8Array(await res.arrayBuffer())
}

// ── 3) Annulation ────────────────────────────────────────────────────────────
export async function cancelShipment(shipmentId: string): Promise<void> {
  // HYPOTHÈSE #6 — endpoint d'annulation à confirmer en sandbox.
  await boxtalPost(`api/v1/order/${encodeURIComponent(shipmentId)}/cancel`, {})
}

// ── Point d'entrée réutilisable : commande Order → bordereau complet ──────────
// Utilisé à l'identique par le webhook (clic « Paiement reçu ») ET l'API admin.
function senderFromEnv(): BoxtalAddress {
  return {
    country: process.env.SENDER_COUNTRY ?? "FR",
    zipcode: process.env.SENDER_POSTCODE ?? "",
    city: process.env.SENDER_CITY ?? "",
    address: process.env.SENDER_STREET ?? "",
    type: "company",
    firstname: process.env.SENDER_FIRSTNAME ?? "",
    lastname: process.env.SENDER_LASTNAME ?? "",
    company: process.env.SENDER_COMPANY ?? "Le Laboratoire",
    email: process.env.SENDER_EMAIL ?? "",
    phone: process.env.SENDER_PHONE ?? "",
  }
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
    email: process.env.SENDER_EMAIL ?? "", // Boxtal exige un email destinataire ; on n'en collecte pas → fallback expéditeur
    phone: order.telephone,
  }
}

export async function generateLabel(
  order: Order,
): Promise<ShipmentResult & { pdf: Uint8Array }> {
  const sender = senderFromEnv()
  const recipient = recipientFromOrder(order)
  const parcel: BoxtalParcel = {
    weight: DEFAULT_WEIGHT,
    length: DEFAULT_DIMS.longueur,
    width: DEFAULT_DIMS.largeur,
    height: DEFAULT_DIMS.hauteur,
    value: DEFAULT_VALUE,
  }

  const quotes = await getQuotes(sender, recipient, parcel)
  const quote = pickQuote(quotes, order.deliveryMode)
  if (!quote) throw new Error("Aucune offre transporteur disponible pour cette commande.")

  const shipment = await createShipment(quote, sender, recipient, parcel, {
    relayCode: order.deliveryMode === "relais" ? order.relayId : undefined,
  })
  const pdf = await fetchLabelPdf(shipment.labelUrl || shipment.shipmentId)
  return { ...shipment, pdf }
}
