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

// ── Capture post-paiement : l'étiquette téléchargée est transmise à l'app, qui la
// poste dans le canal (avec les infos en légende) + marque la commande expédiée. ──
const API = (env.APP_URL || "http://localhost:3000").replace(/\/+$/, "") + "/api/rpa/shipped"
const KEY = env.RPA_API_KEY

// Extrait le n° de suivi Colissimo du PDF (imprimé sous le code-barres).
async function extractTracking(filePath) {
  try {
    const pdf = (await import("pdf-parse")).default
    const data = await pdf(readFileSync(filePath))
    const text = data.text || ""
    // N° de suivi Colissimo = 1 chiffre + 1 lettre + 11 chiffres, imprimé AVEC des espaces
    // (ex. « 5Y 0058310049 4 »). On autorise les espaces entre les chiffres et on nettoie.
    // La version humaine apparaît avant les codes-barres → on prend la 1re occurrence.
    const matches = (text.match(/\d[A-Z](?:\s*\d){11}/g) || []).map((m) => m.replace(/\s+/g, ""))
    const candidates = [...new Set(matches)]
    console.log("🔢 Candidats n° suivi: " + (candidates.length ? candidates.join(", ") : "(aucun — vérifier le format)"))
    return candidates[0] || ""
  } catch (e) {
    console.log("⚠️ Parsing PDF échoué: " + (e?.message ?? e))
    return ""
  }
}

// Envoie le PDF + n° de suivi à l'app (multipart). L'app poste l'étiquette dans le
// canal avec les infos en légende, marque la commande expédiée et notifie le client.
async function uploadLabel(filePath, trackingNumber) {
  if (!KEY) {
    console.log(`⚠️ RPA_API_KEY absent de .env.local → étiquette NON transmise à l'app (suivi capté: ${trackingNumber || "?"}).`)
    return
  }
  try {
    const fd = new FormData()
    fd.append("ref", order.ref)
    fd.append("trackingNumber", trackingNumber || "")
    fd.append("file", new Blob([readFileSync(filePath)], { type: "application/pdf" }), `bordereau-${order.ref}.pdf`)
    const res = await fetch(API, { method: "POST", headers: { "x-robot-key": KEY }, body: fd })
    const j = await res.json().catch(() => ({}))
    console.log(res.ok ? `✅ Étiquette postée dans Telegram + commande EXPÉDIÉE (suivi: ${j.trackingNumber ?? (trackingNumber || "?")}) — client notifié.` : `⚠️ /api/rpa/shipped a répondu ${res.status}`)
  } catch (e) {
    console.log(`⚠️ Appel app échoué (${API}): ${e?.message ?? e} — l'app est-elle lancée ? (APP_URL)`)
  }
}

// Change le statut de la commande via l'app (ex. revert "paid" si fermé sans payer).
async function setStatus(status) {
  if (!KEY) return
  try {
    await fetch(API, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-robot-key": KEY },
      body: JSON.stringify({ ref: order.ref, status }),
    })
  } catch {
    /* best-effort */
  }
}

// Traite l'étiquette téléchargée : extraction du suivi + envoi à l'app.
let labelHandled = false
async function handleLabel(filePath) {
  if (labelHandled) return
  labelHandled = true
  const tn = await extractTracking(filePath)
  await uploadLabel(filePath, tn)
}

page.on("download", async (d) => {
  try {
    const p = join(__dirname, `bordereau-${order.ref}.pdf`)
    await d.saveAs(p)
    console.log("📄 Étiquette téléchargée: " + p)
    await handleLabel(p)
  } catch (e) {
    console.log("⚠️ Téléchargement étiquette: " + (e?.message ?? e))
  }
})
ctx.on("page", (pg) => pg.on("download", async (d) => {
  try { const p = join(__dirname, `bordereau-${order.ref}.pdf`); await d.saveAs(p); console.log("📄 Étiquette (onglet): " + p); await handleLabel(p) } catch {}
}))

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
    // Amène jusqu'à la page de PAIEMENT (saisie carte) : valide le panier.
    await maybe('button:has-text("Valider mon panier")', { timeout: 8000 })
    await page.waitForTimeout(4000)
    console.log("\n✅ Parcours rempli + panier validé. Tu es sur la page de PAIEMENT : saisis ta carte (+ 3-D Secure).")
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
// La fenêtre reste ouverte jusqu'à ce que l'utilisateur la ferme.
await new Promise((resolve) => ctx.on("close", resolve))
// Fermée sans avoir traité l'étiquette (pas payé / abandon) → on remet la commande
// en "paid" pour que le bouton « Générer le bordereau » réapparaisse dans Telegram.
if (!labelHandled) {
  console.log("ℹ️ Fenêtre fermée sans étiquette → commande remise en « à expédier ».")
  await setStatus("paid")
}
process.exit(0)
