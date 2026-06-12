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
import { chromium } from "playwright"
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
// Mode RÉEL = vraie commande qui va jusqu'au paiement (ni TEST, ni audit, ni mapping).
// Seul ce mode déclenche les alertes Telegram en cas de blocage.
const REAL =
  !TEST &&
  process.env.RPA_AUDIT !== "1" &&
  process.env.RPA_MAP_PAYMENT !== "1" &&
  process.env.RPA_MAP_RELAY !== "1"
// Étape courante du parcours (pour situer un éventuel blocage dans l'alerte).
let step = "démarrage"
let hasPaid = false

async function fetchOrder(ref) {
  const url = env.UPSTASH_REDIS_REST_URL
  const token = env.UPSTASH_REDIS_REST_TOKEN
  if (!url || !token) throw new Error("UPSTASH_REDIS_REST_URL / _TOKEN absents de .env.local")
  const res = await fetch(`${url}/get/order:${ref}`, { headers: { Authorization: `Bearer ${token}` } })
  const data = await res.json().catch(() => ({}))
  if (!data || data.result == null) throw new Error(`Commande ${ref} introuvable`)
  return typeof data.result === "string" ? JSON.parse(data.result) : data.result
}

const ref = process.argv.find((a) => /^(CMD|AUD)_/i.test(a))
if (!ref) {
  console.error("Donne une réf : npm run colissimo -- CMD_123456")
  process.exit(1)
}
const order = await fetchOrder(ref)
console.log(`\n📦 ${order.ref} — ${order.prenom} ${order.nom} — ${order.deliveryMode} (${order.pays})${TEST ? "  [MODE TEST]" : ""}\n`)

const ctx = await chromium.launchPersistentContext(join(__dirname, ".chromium"), {
  headless: process.env.RPA_HEADLESS === "1",
  viewport: { width: 1400, height: 950 },
})
ctx.setDefaultTimeout(22000) // marge pour les chargements lents de laposte.fr (réduit la flakiness)
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
    // N° de suivi Colissimo = 1 chiffre + 1 lettre + 11 chiffres (ex. « 5Y00583102191 »).
    // PRIORITÉ au n° « humain » imprimé sur l'étiquette avec son espacement typique
    // « 5Y 0058310219 1 » (préfixe + 10 chiffres + chiffre de contrôle) : c'est LE bon numéro,
    // alors que les longues chaînes de codes-barres produisent de faux candidats.
    const human = text.match(/\d[A-Z]\s\d{10}\s\d(?!\d)/)
    if (human) {
      const tn = human[0].replace(/\s+/g, "")
      console.log("🔢 N° suivi (format imprimé): " + tn)
      return tn
    }
    // Fallback : 1re occurrence du motif compact (avec espaces éventuels entre chiffres).
    const matches = (text.match(/\d[A-Z](?:\s*\d){11}/g) || []).map((m) => m.replace(/\s+/g, ""))
    const candidates = [...new Set(matches)]
    console.log("🔢 Candidats n° suivi (fallback): " + (candidates.length ? candidates.join(", ") : "(aucun — vérifier le format)"))
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

// Filet de sécurité : prévient l'admin sur Telegram (via l'app) en cas de blocage du robot,
// avec une capture d'écran de l'écran fautif. `reset` = true si l'échec est AVANT le paiement
// (aucun argent dépensé → on réactive le bouton « Générer »). N'agit qu'en mode RÉEL.
async function sendAlert(atStep, errMsg, reset = true) {
  if (!REAL || !KEY) return
  const ALERT = (env.APP_URL || "http://localhost:3000").replace(/\/+$/, "") + "/api/rpa/alert"
  try {
    const shot = join(__dirname, `error-${order.ref}.png`)
    await page.screenshot({ path: shot, fullPage: true }).catch(() => {})
    const fd = new FormData()
    fd.append("ref", order.ref)
    fd.append("step", atStep || step || "")
    fd.append("error", String(errMsg || "").slice(0, 300))
    fd.append("reset", reset ? "1" : "0")
    try {
      fd.append("photo", new Blob([readFileSync(shot)], { type: "image/png" }), `error-${order.ref}.png`)
    } catch {
      /* pas de capture → alerte texte seule */
    }
    await fetch(ALERT, { method: "POST", headers: { "x-robot-key": KEY }, body: fd })
    console.log("  📨 Alerte Telegram envoyée à l'admin.")
  } catch (e) {
    console.log("  ⚠️ Alerte Telegram échouée: " + (e?.message ?? e))
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
  const loc = page.locator(sel).first()
  // Attend que le champ soit visible avant de remplir (l'hydratation du SPA peut être lente),
  // puis 1 retry si un re-render le détache au mauvais moment.
  for (let i = 0; i < 2; i++) {
    try {
      await loc.waitFor({ state: "visible", timeout: 18000 })
      await loc.fill(String(val), { timeout: 10000 })
      return
    } catch (e) {
      if (i === 1) throw e
      await page.waitForTimeout(1500)
    }
  }
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

// Attente de transition d'étape : on repart dès que l'URL de l'étape suivante est atteinte
// (beaucoup plus rapide ET plus fiable qu'un délai fixe), + un court délai de rendu du SPA.
// Si l'URL n'arrive pas (timeout), on continue quand même : l'action suivante auto-attend.
async function goStep(urlRe, { settle = 800, timeout = 12000 } = {}) {
  await page.waitForURL(urlRe, { timeout }).catch(() => {})
  if (settle) await page.waitForTimeout(settle)
}

// Clique « Étape suivante » et VÉRIFIE que la transition d'URL a lieu. Le SPA Colissimo
// ignore parfois un clic émis trop tôt (re-render) → on re-clique, mais UNIQUEMENT si on est
// encore sur l'étape de départ (jamais si on a déjà avancé, pour ne pas sauter une étape).
// Rapide (repart dès le changement d'URL) ET fiable (rattrape les clics ignorés).
async function clickNext(fromRe, toRe, { tries = 4, settle = 800 } = {}) {
  for (let i = 0; i < tries; i++) {
    if (toRe.test(page.url())) break // déjà arrivé
    if (i > 0 && !fromRe.test(page.url())) break // parti ailleurs → ne pas re-cliquer
    await btn("Étape suivante").click({ timeout: 8000 }).catch(() => {})
    try {
      await page.waitForURL(toRe, { timeout: 6000 })
      break
    } catch {
      await page.waitForTimeout(1000) // pas encore passé → on retente
    }
  }
  if (settle) await page.waitForTimeout(settle)
  return toRe.test(page.url())
}

// Connexion La Poste automatique : détecte le formulaire de connexion (champ #username
// OU URL moncompte) où qu'il apparaisse, le remplit et continue. Verrou atomique
// (loggingIn posé AVANT le 1er await) pour ne jamais se connecter deux fois en parallèle.
let loggingIn = false
async function loginIfNeeded() {
  if (loggingIn || !env.LAPOSTE_EMAIL || !env.LAPOSTE_PASSWORD) return false
  loggingIn = true
  try {
    const hasForm = await page.locator("#username").first().isVisible({ timeout: 2500 }).catch(() => false)
    if (!hasForm && !page.url().includes("moncompte.laposte.fr")) return false
    log("Connexion La Poste automatique…")
    await fill("#username", env.LAPOSTE_EMAIL)
    await fill("#password", env.LAPOSTE_PASSWORD)
    await maybe("#rememberMe", { timeout: 2000 }) // « Rester connecté »
    await maybe("#submit-button", { timeout: 6000 })
    await page.waitForTimeout(5000)
    return true
  } finally {
    loggingIn = false
  }
}

// Détecteur RÉACTIF : dès que la page navigue vers l'écran de connexion La Poste
// (à n'importe quel moment, même inattendu), le robot se connecte tout seul.
page.on("framenavigated", (frame) => {
  if (frame === page.mainFrame() && frame.url().includes("moncompte.laposte.fr")) {
    loginIfNeeded().catch(() => {})
  }
})

// Remplit le CVV (carte mémorisée) — il est dans une iframe du prestataire Scellius/Lyra.
async function fillCVV(cvv) {
  for (const fr of page.frames()) {
    if (!/scelliuspaiement|krypton|lyra/i.test(fr.url())) continue
    try {
      const inp = fr.locator('input[placeholder="CVV"]')
      if ((await inp.count()) > 0) {
        await inp.first().click().catch(() => {})
        // Vraies frappes clavier (le formulaire Scellius/Lyra valide à la saisie, pas via fill()).
        await inp.first().pressSequentially(String(cvv), { delay: 90 })
        await inp.first().press("Tab").catch(() => {}) // blur → valide → active « Payer »
        return true
      }
    } catch {
      /* iframe suivante */
    }
  }
  return false
}

// Vide le panier de façon fiable. Le panier (/panier → redirige vers /parcours/recapitulatif
// quand il contient des colis) liste chaque colis dans une tuile avec un bouton « Supprimer »,
// puis une confirmation « Oui, le retirer ». On supprime article par article jusqu'à vider.
// Renvoie true si le panier est vide à la fin.
async function clearCart() {
  for (let i = 0; i < 12; i++) {
    await page.goto("https://www.laposte.fr/colissimo-en-ligne/panier", { waitUntil: "domcontentloaded" }).catch(() => {})
    await page.waitForTimeout(2500)
    // Panier explicitement vide ?
    if (await page.locator(".panierEmpty").isVisible({ timeout: 2000 }).catch(() => false)) return true
    const del = page.locator('button.tile__button:has-text("Supprimer")').first()
    if (!(await del.isVisible({ timeout: 3000 }).catch(() => false))) return true // plus aucun colis
    await del.click().catch(() => {})
    await page.waitForTimeout(1200)
    // Confirmation inline : « Oui, le retirer »
    await page.locator('button:has-text("Oui, le retirer")').first().click({ timeout: 4000 }).catch(() => {})
    await page.waitForTimeout(2500)
  }
  return false
}

// Gère les DEUX modales d'adresse possibles après « Enregistrer » :
//  A) normalisation simple → bouton « Confirmer cette adresse »
//  B) « Étape 1 sur 2 » : CP/ville ambigus → liste de suggestions à choisir
// Boutons de validation des 2 modales (substring sans apostrophe pour éviter ' vs ').
const CONFIRM_BTNS =
  'button:has-text("Confirmer cette adresse"), button:has-text("adresse sélectionnée")'
async function confirmAddress() {
  await page.waitForTimeout(1500)
  // Une des 2 modales apparaît (jusqu'à ~10s) :
  //  A) normalisation → « Confirmer cette adresse »
  //  B) suggestions (voie/CP/ville ambigus) → liste de suggestions → « Utiliser l'adresse sélectionnée »
  // Pour (B), la suggestion n'est PAS toujours pré-cochée : si aucune ne l'est, on coche la 1re.
  // (Les radios de suggestion sont name="address" ; les cartes de mode sont name="card-name-delivery".)
  try {
    const sugg = page.locator('input.lp-radio__input[name="address"]')
    if (await sugg.first().isVisible({ timeout: 1500 }).catch(() => false)) {
      const anyChecked = await sugg.evaluateAll((els) => els.some((e) => e.checked)).catch(() => false)
      if (!anyChecked) {
        await sugg.first().check({ force: true }).catch(() => {})
        await page.waitForTimeout(500)
        log("Suggestion d'adresse : 1re proposition sélectionnée.")
      }
    }
  } catch {
    /* pas de suggestions */
  }
  try {
    await page.locator(CONFIRM_BTNS).first().click({ timeout: 10000 })
    await page.waitForTimeout(1500)
    // une 2e modale peut enchaîner (rare)
    await page.locator(CONFIRM_BTNS).first().click({ timeout: 2000 }).catch(() => {})
  } catch {
    /* pas de modale d'adresse à confirmer */
  }
}

// Remplit le panneau « adresse destinataire » (commun domicile + relais).
async function fillRecipient() {
  await txt("Renseigner une adresse").click()
  await page.waitForTimeout(2500)
  await page.locator("#sexaddressForm-MALE").first().check({ force: true }) // genre non stocké → défaut Monsieur
  await fill("#firstName", order.prenom)
  await fill("#lastName", order.nom)
  if (order.pays !== "FR") {
    // En international, le pays est déjà fixé (destination choisie à l'étape 1) et le select
    // est désactivé. On vérifie juste qu'il vaut bien le bon pays.
    const cur = await page.locator("#country-addressForm").evaluate((s) => s.value).catch(() => "")
    if (cur !== order.pays) log(`⚠️ Pays attendu ${order.pays}, trouvé « ${cur || "?"} » — à vérifier.`)
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
  step = "ouverture Colissimo"
  log("Ouverture de Colissimo en ligne…")
  await page.goto("https://www.laposte.fr/colissimo-en-ligne", { waitUntil: "domcontentloaded" })
  await maybe("#onetrust-accept-btn-handler", { timeout: 2500 })
  await page.waitForTimeout(1500)

  step = "caractéristiques (destination + poids)"
  // 1) Caractéristiques : destination (international) + poids
  // Pour l'étranger (Belgique), on règle la destination via le dropdown #arrival AVANT le poids :
  // cela bascule tout le parcours en mode international (offre + adresse + douane).
  if (order.pays !== "FR") {
    log(`Destination : ${order.pays} (envoi international)`)
    await page.locator("#arrival .lp-dropdown__combobox").click({ timeout: 8000 })
    await page.waitForTimeout(1000)
    const destLabel = order.pays === "BE" ? "Belgique" : order.pays
    await page.locator("input[id$=search]").first().fill(destLabel.slice(0, 5)).catch(() => {})
    await page.waitForTimeout(1200)
    await page.getByRole("option", { name: destLabel, exact: true }).first().click({ timeout: 6000 })
    await page.waitForTimeout(1500)
  }

  const weight = env.DEFAULT_WEIGHT_KG || "0.5"
  log(`Poids : ${weight} kg`)
  await fill("#weightInput", weight)
  await btn("Envoyez votre colis").click()
  await page.waitForTimeout(2000)
  if (order.pays !== "FR") {
    // International : choisir l'offre Standard (F_STD) qui apparaît après « Envoyez votre colis ».
    await maybe('label[for="card-input-id-F_STD"]', { timeout: 6000, force: true })
    await page.waitForTimeout(1500)
  } else {
    await maybe("text=Kilogrammes", { timeout: 4000 })
  }
  await clickNext(/parcours\/caracteristiques/, /parcours\/depart/)

  // 2) Départ (expéditeur)
  // Dépôt « en boîte aux lettres » (D_BAL) : c'est le seul mode qui garde TOUTES les
  // livraisons disponibles, dont « En point de retrait » (le point de contact la désactive).
  step = "départ (expéditeur)"
  // L'adresse expéditeur peut échouer à charger (erreur TRANSITOIRE de La Poste) → le dépôt
  // « boîte aux lettres » (D_BAL) devient alors indisponible/désactivé. On garde D_BAL coûte que
  // coûte car c'est le seul mode qui laisse le POINT RELAIS dispo (D_BP le désactive) — et on
  // peut quand même déposer au bureau de poste. Donc si D_BAL n'est pas sélectionnable, on
  // RECHARGE l'étape et on réessaie : l'erreur transitoire disparaît au refresh.
  let depOk = false
  for (let i = 0; i < 4 && !depOk; i++) {
    await page.locator('label[for="card-input-id-D_BAL"]').waitFor({ state: "visible", timeout: 15000 }).catch(() => {})
    const balDisabled = await page.locator("#card-input-id-D_BAL").isDisabled().catch(() => true)
    if (balDisabled) {
      log(`Adresse expéditeur / dépôt boîte aux lettres indisponible (tentative ${i + 1}/4) → rechargement…`)
      await page.reload({ waitUntil: "domcontentloaded" }).catch(() => {})
      await page.waitForTimeout(4500)
      continue
    }
    depOk = true
  }
  if (!depOk) throw new Error("Adresse d'expédition indisponible (erreur La Poste transitoire) — relance « Générer ».")
  // Tél expéditeur : best-effort (le compte La Poste l'a déjà) → ne doit jamais bloquer le run.
  if (env.SENDER_PHONE) await fill("#phone", env.SENDER_PHONE).catch(() => {})
  await maybe('label[for="card-input-id-D_BAL"]', { timeout: 6000, force: true })
  await page.waitForTimeout(700) // laisse la sélection du mode de dépôt se propager avant de valider
  await clickNext(/parcours\/depart/, /parcours\/arrivee/)

  // 3) Arrivée : mode de livraison + destinataire
  step = "arrivée (mode + adresse destinataire)"
  // ⚠️ L'international PASSE EN PREMIER : à l'étranger (Belgique), Colissimo ne propose QUE
  // « Avec signature » (L_CS) — AUCUN point relais hors de France. Donc qu'on ait demandé
  // relais ou domicile, une commande BE va forcément en livraison à domicile signée.
  if (order.pays !== "FR") {
    log(
      order.deliveryMode === "relais"
        ? `Mode : international — point relais indisponible en ${order.pays} → livraison à domicile (avec signature)`
        : "Mode : international (avec signature)",
    )
    await maybe('label[for="card-input-id-L_CS"]', { timeout: 6000, force: true })
    await page.waitForTimeout(1500)
    await fillRecipient()
    // International : tél + email destinataire OBLIGATOIRES (notification de livraison).
    const recMail =
      order.email ||
      `${order.prenom}.${order.nom}`.toLowerCase().normalize("NFD").replace(/[^a-z0-9.]/g, "") + "@gmail.com"
    await fill("#phone", order.telephone)
    await fill("#email", recMail)
    await page.waitForTimeout(800)
    log("Notification destinataire (tél + email) remplie.")
  } else if (order.deliveryMode === "relais") {
    log("Mode : point de retrait")
    await fillRecipient() // adresse d'abord (sinon la sélection du mode se réinitialise)
    // Sélectionne « En point de retrait » → La Poste assigne AUTO le relais le plus proche
    // de l'adresse du client (API pickup-stores). Pas besoin de piloter la carte.
    await maybe('label[for="card-input-id-L_PR"]', { timeout: 6000, force: true })
    await page.waitForTimeout(4500) // laisse pickup-stores assigner le relais le plus proche

    // Sélectionne le relais EXACT choisi par le client (même réseau Colissimo, via /api/relays).
    // ⚠️ On le fait AVANT de remplir tél/email : le widget « Livrer ici » re-render le formulaire
    // et effacerait des champs remplis trop tôt. Sinon (relais introuvable) on garde le plus proche.
    const relayName = (order.pointRelais || "").split(" — ")[0].trim()
    if (relayName.length > 2 && (await maybe("text=Choisir un autre point de retrait", { timeout: 6000 }))) {
      await page.waitForTimeout(4500) // laisse la liste des relais se charger
      try {
        const item = page
          .getByText(relayName, { exact: false })
          .first()
          .locator('xpath=ancestor::*[.//button[contains(normalize-space(.),"Livrer ici")]][1]')
        await item.locator('button:has-text("Livrer ici")').first().click({ timeout: 5000 })
        log(`Relais EXACT sélectionné : ${relayName}`)
        await page.waitForTimeout(2500)
      } catch {
        log(`Relais « ${relayName} » introuvable dans la liste → on garde le plus proche.`)
        await maybe('button:has-text("Fermer la fenêtre")', { timeout: 3000 })
        await page.waitForTimeout(1500)
      }
    }

    // Point de retrait : tél + email destinataire REQUIS (SMS/mail du code de retrait).
    // Rempli EN DERNIER (après la sélection du relais) pour qu'aucun re-render ne les efface.
    const recMail =
      order.email ||
      `${order.prenom}.${order.nom}`.toLowerCase().normalize("NFD").replace(/[^a-z0-9.]/g, "") + "@gmail.com"
    await fill("#phone", order.telephone)
    await fill("#email", recMail)
    await page.waitForTimeout(1000)
    log("Point de retrait : relais sélectionné + notif destinataire remplie.")
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
    step = "options"
    await maybe('button:has-text("Étape suivante")', { timeout: 5000 }) // domicile → écran Options
    await page.waitForTimeout(1500)
    step = "ajout au panier"
    await maybe('button:has-text("Ajouter au panier")', { timeout: 8000 })
    await page.waitForTimeout(2000)
    await maybe("text=Accéder au panier", { timeout: 8000 })
    await page.waitForTimeout(2000)
    step = "connexion La Poste"
    await loginIfNeeded() // une page de connexion peut apparaître ici
    // Amène jusqu'à la page de PAIEMENT (saisie carte) : valide le panier.
    step = "validation du panier"
    await maybe('button:has-text("Valider mon panier")', { timeout: 8000 })
    await goStep(/checkout\/paiement/, { settle: 1500, timeout: 12000 })
    await loginIfNeeded() // ou ici, selon le moment où La Poste redemande la connexion

    // ── MODE AUDIT : on doit être sur la page de paiement. On vérifie, on capture,
    // on VIDE le panier (Tout supprimer) et on quitte SANS jamais payer.
    // 🔒 SÉCURITÉ : ce mode vide le panier → STRICTEMENT réservé aux réfs de TEST (AUD_).
    // Sur une vraie commande client (CMD_), on refuse : jamais de suppression de colis réel.
    if (process.env.RPA_AUDIT === "1" && /^AUD_/i.test(order.ref)) {
      await page.waitForTimeout(1200)
      const onPay = /checkout\/paiement/i.test(page.url())
      await page.screenshot({ path: join(__dirname, `audit-${order.ref}.png`), fullPage: true }).catch(() => {})
      console.log(onPay ? `AUDIT_PASS ${order.ref}` : `AUDIT_FAIL ${order.ref} @ ${page.url()}`)
      console.log((await clearCart()) ? `AUDIT_CLEANED ${order.ref}` : `AUDIT_NOCLEAN ${order.ref}`)
      await ctx.close().catch(() => {})
      process.exit(0)
    }

    // Mode MAPPING paiement : relève les sélecteurs (toutes les frames) SANS payer, puis quitte.
    if (process.env.RPA_MAP_PAYMENT === "1") {
      await page.waitForTimeout(5000)
      await maybe('label[for="card-input-id-credit_card"]', { timeout: 5000 }) // sélectionne Carte Bancaire
      await page.waitForTimeout(5000) // laisse le formulaire carte (CVV) / l'iframe se charger
      console.log("URL paiement :", page.url())
      await page.screenshot({ path: join(__dirname, "pay.png"), fullPage: true }).catch(() => {})
      for (const fr of page.frames()) {
        try {
          const els = await fr.$$eval("input, select, button, [role=button], label, [type=checkbox]", (ns) =>
            ns
              .filter((e) => e.offsetParent !== null)
              .map((e) => ({
                tag: e.tagName.toLowerCase(),
                type: e.type || "",
                id: e.id || "",
                name: e.name || "",
                ph: e.placeholder || "",
                t: (e.innerText || e.value || "").replace(/\s+/g, " ").trim().slice(0, 45),
                for: (e.getAttribute && e.getAttribute("for")) || "",
              }))
              .filter((x) => x.t || x.id || x.name),
          )
          if (els.length) {
            console.log(`\n=== FRAME ${fr.url().slice(0, 90)} ===`)
            for (const e of els) console.log("  " + JSON.stringify(e))
          }
        } catch {
          /* frame inaccessible */
        }
      }
      await ctx.close().catch(() => {})
      process.exit(0)
    }

    // ── PAIEMENT AUTOMATIQUE (opt-in via RPA_AUTOPAY=1 + LAPOSTE_CVV) ──
    if (env.RPA_AUTOPAY === "1" && env.LAPOSTE_CVV) {
      step = "paiement (carte + CVV + cases)"
      log("Paiement automatique : carte mémorisée + CVV + cases…")
      await maybe('label[for="card-input-id-credit_card"]', { timeout: 6000 }) // sélectionne « Carte Bancaire »
      await page.waitForTimeout(4500) // laisse les iframes carte se charger
      const cvvOk = await fillCVV(env.LAPOSTE_CVV)
      log(cvvOk ? "  ✓ CVV saisi." : "  ✗ CVV introuvable — termine à la main.")
      // Coche les 2 cases en cliquant l'INPUT (pas le label : il contient un lien
      // « matières dangereuses » qu'on ne veut surtout pas ouvrir).
      await page.locator("#dangerousMaterial").check().catch(() => {})
      await page.locator("#cgv").check().catch(() => {})
      await page.waitForTimeout(2500) // laisse le formulaire valider carte + CVV + cases
      // Clique « Payer » — mais SEULEMENT si le montant ≈ 1 colis (anti-surfacturation).
      const payBtn = page.locator('button:has-text("Payer")').first()
      const payText = await payBtn.innerText().catch(() => "")
      const amount = parseFloat(((payText.match(/(\d+[.,]\d{2})/) || [])[1] || "0").replace(",", "."))
      let paid = false
      if (amount > 12) {
        console.log(`\n⛔ Panier à ${amount} € (plusieurs colis !) — auto-paiement ANNULÉ pour ne pas surpayer. Vide le panier puis relance.`)
        await sendAlert("paiement (anti-surfacturation)", `Panier à ${amount} € (plusieurs colis) — paiement annulé. Vide le panier et relance.`, true)
      } else {
        const st0 = await payBtn.isDisabled().catch(() => null)
        log(`  Bouton « Payer » (${amount} €) au départ : ${st0 === true ? "DÉSACTIVÉ" : st0 === false ? "actif" : "introuvable"}`)
        for (let i = 0; i < 12 && !paid; i++) {
          const dis = await payBtn.isDisabled().catch(() => true)
          if (dis) {
            await page.waitForTimeout(2000) // encore désactivé → on attend la validation
            continue
          }
          await payBtn.scrollIntoViewIfNeeded({ timeout: 2000 }).catch(() => {})
          // 1) clic forcé (ignore un overlay qui intercepterait), 2) sinon clic synthétique direct.
          try {
            await payBtn.click({ timeout: 3000, force: true })
            paid = true
          } catch {
            try {
              await payBtn.dispatchEvent("click")
              paid = true
              log("  (clic « Payer » via dispatchEvent)")
            } catch (e) {
              log(`  clic Payer raté: ${e?.message?.split("\n")[0]}`)
              await page.waitForTimeout(1500)
            }
          }
        }
        console.log(paid ? "\n💳 « Payer » cliqué. Valide la 3-D Secure sur ton tél si demandée…" : "\n⚠️ « Payer » pas déclenché (resté désactivé ?) — clique-le à la main, et copie-moi ces lignes.")
        hasPaid = paid // dès qu'on a cliqué Payer, un revert "paid" serait dangereux (risque de re-paiement)
        if (!paid) await sendAlert("paiement (bouton Payer)", "Le bouton « Payer » est resté inactif/non cliquable — paiement non déclenché.", true)
      }

      // ── Après paiement : récupérer l'étiquette dans l'ESPACE CLIENT ──
      // La page de confirmation post-paiement redirige souvent vers le panier (vide) → peu fiable.
      // On va donc DIRECTEMENT dans l'espace client (/espaceclient/) ouvrir le colis qu'on vient
      // de payer (identifié par le destinataire, sinon le plus récent) et télécharger son étiquette.
      if (paid) {
        step = "téléchargement étiquette (espace client)"
        await page.waitForTimeout(6000) // laisse La Poste finaliser le paiement + créer le colis
        const who = `${order.prenom} ${order.nom}`.replace(/\s+/g, " ").trim()
        let ok = false
        for (let i = 0; i < 6 && !ok; i++) {
          await page.goto("https://www.laposte.fr/espaceclient/", { waitUntil: "domcontentloaded" }).catch(() => {})
          await page.waitForTimeout(3500)
          // Ouvre le colis du bon destinataire ; repli sur le plus récent si non trouvé.
          let card = page.locator(`button:has-text("Colis - ${who}"), a:has-text("Colis - ${who}")`).first()
          if (!(await card.isVisible({ timeout: 3000 }).catch(() => false))) {
            card = page.locator('button:has-text("Colis -"), a:has-text("Colis -")').first()
          }
          if (!(await card.isVisible({ timeout: 3000 }).catch(() => false))) {
            await page.waitForTimeout(3000) // le colis n'est pas encore apparu → on réessaie
            continue
          }
          await card.click().catch(() => {})
          await page.waitForTimeout(3000)
          const dl = page.locator('button:has-text("Télécharger l"), a:has-text("Télécharger l")').first()
          if (await dl.isVisible({ timeout: 5000 }).catch(() => false)) {
            await dl.click().catch(() => {}) // déclenche l'event "download" → handleLabel
            ok = true
          }
        }
        log(ok ? "  ✓ Téléchargement déclenché — l'étiquette part dans Telegram." : "  ✗ Étiquette introuvable dans l'espace client.")
        // Échec APRÈS paiement → on n'annule PAS le paiement (reset=false), on signale juste.
        if (!ok) await sendAlert("téléchargement étiquette", "Paiement OK mais étiquette introuvable dans l'espace client — récupère-la à la main.", false)
        // Attend le traitement (extraction suivi + envoi Telegram + notif client) puis ferme.
        for (let i = 0; i < 40 && !labelHandled; i++) await page.waitForTimeout(1000)
        await page.waitForTimeout(1500)
        log(labelHandled ? "Terminé — étiquette traitée. Fermeture." : "Fermeture (étiquette à vérifier).")
        await ctx.close().catch(() => {})
        process.exit(0)
      }
    } else {
      console.log("\n✅ Parcours rempli + panier validé. Tu es sur la page de PAIEMENT : saisis ta carte (+ 3-D Secure).")
    }
  }
  console.log("   Ferme la fenêtre Edge quand tu as fini.\n")
} catch (e) {
  const msg = e?.message?.split("\n")[0]
  console.error(`\n⚠️ Arrêt sur un écran inattendu (étape : ${step}) :`, msg)
  await page.screenshot({ path: join(__dirname, `error-${order.ref}.png`), fullPage: true }).catch(() => {})
  // Alerte l'admin sur Telegram (capture + étape). reset = true si on n'a PAS encore payé.
  await sendAlert(step, msg, !hasPaid)
  // On ferme et on quitte proprement (l'admin a reçu l'alerte + peut relancer « Générer »).
  // Évite de laisser un navigateur zombie qui bloquerait le veilleur / les tests.
  await ctx.close().catch(() => {})
  process.exit(1)
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
