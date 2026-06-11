// Robot Colissimo — remplit TOUT le parcours « Colissimo en ligne » à partir d'une
// commande, et s'arrête à la page de PAIEMENT (que tu valides : 3-D Secure bancaire).
//
// Tourne EN LOCAL, fenêtre Edge visible, session mémorisée dans .userdata.
//
// Usage :
//   npm run colissimo -- CMD_123456
//   RPA_TEST=1 → mode test : s'arrête après l'écran Options, sans rien mettre au panier.
//
// Réglages (../.env.local, optionnels) :
//   LAPOSTE_EMAIL, LAPOSTE_PASSWORD → connexion auto à l'étape paiement
//   SENDER_PHONE                    → ton tél expéditeur
//   DEFAULT_WEIGHT_KG               → poids par défaut (défaut 0.5)
import { chromium } from "playwright-core"
import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { dirname, join } from "node:path"

const __dirname = dirname(fileURLToPath(import.meta.url))

function loadEnv() {
  try {
    const txt = readFileSync(join(__dirname, "..", ".env.local"), "utf8")
    const env = {}
    for (const line of txt.split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/)
      if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, "")
    }
    return env
  } catch {
    return {}
  }
}
const env = loadEnv()
const TEST = process.env.RPA_TEST === "1"

async function fetchOrder(ref) {
  const url = env.UPSTASH_REDIS_REST_URL
  const token = env.UPSTASH_REDIS_REST_TOKEN
  if (!url || !token) throw new Error("UPSTASH_REDIS_REST_URL / _TOKEN absents de .env.local")
  const res = await fetch(`${url}/get/order:${ref}`, { headers: { Authorization: `Bearer ${token}` } })
  const data = await res.json().catch(() => ({}))
  if (!data || data.result == null) throw new Error(`Commande ${ref} introuvable`)
  return typeof data.result === "string" ? JSON.parse(data.result) : data.result
}

const ref = process.argv.find((a) => /^CMD_/i.test(a))
if (!ref) {
  console.error("Donne une réf : npm run colissimo -- CMD_123456")
  process.exit(1)
}
const order = await fetchOrder(ref)
console.log(`\n📦 ${order.ref} — ${order.prenom} ${order.nom} — ${order.deliveryMode} (${order.pays})${TEST ? "  [MODE TEST]" : ""}\n`)

const ctx = await chromium.launchPersistentContext(join(__dirname, ".userdata"), {
  channel: "msedge",
  headless: process.env.RPA_HEADLESS === "1",
  viewport: { width: 1400, height: 950 },
})
ctx.setDefaultTimeout(15000)
const page = ctx.pages()[0] ?? (await ctx.newPage())

// ── Helpers ───────────────────────────────────────────────────────────────────
const log = (m) => console.log("  " + m)
const txt = (t) => page.locator(`text=${t}`).first()
const btn = (t) => page.locator(`button:has-text("${t}")`).first()
async function fill(sel, val) {
  if (val == null || val === "") return
  await page.locator(sel).first().fill(String(val))
}
async function maybe(locOrText, { timeout = 4000, force = false } = {}) {
  try {
    const loc = typeof locOrText === "string" && /[#.\[\]=>:]/.test(locOrText)
      ? page.locator(locOrText).first()
      : typeof locOrText === "string"
        ? page.locator(`text=${locOrText}`).first()
        : locOrText
    await loc.click({ timeout, force })
    return true
  } catch {
    return false
  }
}

// Gère les DEUX modales d'adresse possibles après « Enregistrer » :
//  A) normalisation simple → bouton « Confirmer cette adresse »
//  B) « Étape 1 sur 2 » : CP/ville ambigus → liste de suggestions à choisir
async function confirmAddress() {
  await page.waitForTimeout(2500)
  // Cas A : confirmation directe
  if (await maybe("Confirmer cette adresse", { timeout: 3500 })) {
    await page.waitForTimeout(1500)
    // parfois une 2e confirmation enchaîne
    await maybe("Confirmer cette adresse", { timeout: 2000 })
    return
  }
  // Cas B : suggestions → on choisit celle qui contient le CP de la commande
  const cp = order.codePostal
  if (cp && (await maybe(`text=${cp}`, { timeout: 3000 }))) {
    await page.waitForTimeout(1500)
    for (const b of ["Confirmer cette adresse", "Valider", "Confirmer"]) {
      if (await maybe(b, { timeout: 2000 })) break
    }
    return
  }
  // Cas B sans correspondance : 1re suggestion proposée
  if (await maybe("text=Suggestion", { timeout: 2500 })) {
    await page.waitForTimeout(1500)
    for (const b of ["Confirmer cette adresse", "Valider", "Confirmer"]) {
      if (await maybe(b, { timeout: 2000 })) break
    }
  }
}

// Remplit le panneau « adresse destinataire » (commun domicile + relais).
async function fillRecipient() {
  await txt("Renseigner une adresse").click()
  await page.waitForTimeout(2500)
  await page.locator("#sexaddressForm-MALE").first().check({ force: true }) // genre non stocké → défaut Monsieur
  await fill("#firstName", order.prenom)
  await fill("#lastName", order.nom)
  if (order.pays === "BE") {
    // Pays par défaut = France ; pour la Belgique on change le select.
    try {
      await page.locator("#country-addressForm").selectOption({ label: "Belgique" })
    } catch {
      log("⚠️ Pays Belgique non sélectionné automatiquement — à vérifier à la main.")
    }
  }
  await fill("#zipCode-addressForm", order.codePostal)
  await fill("#city-addressForm", order.ville)
  await fill("#streetName-addressForm", order.adresse)
  await btn("Enregistrer").click()
  await confirmAddress()
  await page.waitForTimeout(1500)
}

// ── Parcours ────────────────────────────────────────────────────────────────
try {
  log("Ouverture de Colissimo en ligne…")
  await page.goto("https://www.laposte.fr/colissimo-en-ligne", { waitUntil: "domcontentloaded" })
  await maybe("#onetrust-accept-btn-handler", { timeout: 2500 })
  await page.waitForTimeout(1500)

  // 1) Caractéristiques : poids
  const weight = env.DEFAULT_WEIGHT_KG || "0.5"
  log(`Poids : ${weight} kg`)
  await fill("#weightInput", weight)
  await btn("Envoyez votre colis").click()
  await page.waitForTimeout(4000)
  await maybe("text=Kilogrammes", { timeout: 4000 })
  await btn("Étape suivante").click()
  await page.waitForTimeout(4000)

  // 2) Départ (expéditeur)
  // Dépôt « en boîte aux lettres » (D_BAL) : c'est le seul mode qui garde TOUTES les
  // livraisons disponibles, dont « En point de retrait » (le point de contact la désactive).
  if (env.SENDER_PHONE) await fill("#phone", env.SENDER_PHONE)
  await maybe('label[for="card-input-id-D_BAL"]', { timeout: 5000, force: true })
  await btn("Étape suivante").click()
  await page.waitForTimeout(4000)

  // 3) Arrivée : mode de livraison + destinataire
  if (order.deliveryMode === "relais") {
    log("Mode : point de retrait")
    await fillRecipient() // adresse d'abord (sinon la sélection du mode se réinitialise)
    // Sélectionne « En point de retrait » → La Poste assigne AUTO le relais le plus proche
    // de l'adresse du client (API pickup-stores). Pas besoin de piloter la carte.
    await maybe('label[for="card-input-id-L_PR"]', { timeout: 6000, force: true })
    await page.waitForTimeout(4500) // laisse pickup-stores assigner le relais le plus proche
    log("Point de retrait : relais le plus proche de l'adresse assigné automatiquement.")
  } else {
    log("Mode : domicile (en boîte aux lettres)")
    await maybe('label[for="card-input-id-L_BAL"]', { timeout: 6000, force: true })
    await fillRecipient()
  }

  if (TEST) {
    log(`MODE TEST — arrêt à : ${page.url()}`)
    await page.screenshot({ path: join(__dirname, `test-${order.ref}.png`), fullPage: true }).catch(() => {})
    console.log(`\n✅ [TEST] ${order.ref} rempli jusqu'à : ${page.url()}\n`)
  } else {
    // Suite commune (domicile ET relais) : étape suivante → options → panier → connexion → paiement
    await maybe('button:has-text("Étape suivante")', { timeout: 5000 }) // domicile → écran Options
    await page.waitForTimeout(2500)
    await maybe('button:has-text("Ajouter au panier")', { timeout: 8000 })
    await page.waitForTimeout(4500)
    await maybe("text=Accéder au panier", { timeout: 8000 })
    await page.waitForTimeout(4000)
    if (page.url().includes("moncompte.laposte.fr") && env.LAPOSTE_EMAIL && env.LAPOSTE_PASSWORD) {
      log("Connexion automatique…")
      await fill("#username", env.LAPOSTE_EMAIL)
      await fill("#password", env.LAPOSTE_PASSWORD)
      await maybe("#rememberMe", { timeout: 2000 })
      await maybe("#submit-button", { timeout: 5000 })
      await page.waitForTimeout(5000)
    }
    console.log("\n✅ Parcours rempli. Vérifie le récap, va au PAIEMENT et valide ta carte (3-D Secure sur ton tél).")
  }
  console.log("   Ferme la fenêtre Edge quand tu as fini.\n")
} catch (e) {
  console.error("\n⚠️ Arrêt sur un écran inattendu :", e?.message?.split("\n")[0])
  console.error("   La fenêtre reste ouverte : termine à la main.\n")
  await page.screenshot({ path: join(__dirname, `error-${order.ref}.png`), fullPage: true }).catch(() => {})
}

if (TEST) {
  await ctx.close().catch(() => {})
  process.exit(0)
}
await new Promise((resolve) => ctx.on("close", resolve))
process.exit(0)
