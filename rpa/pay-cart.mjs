// 💳 PAIEMENT GROUPÉ — paie TOUT le panier Colissimo en une seule fois, puis récupère
// l'étiquette de CHAQUE commande « in_cart » et la poste (Telegram + client).
//
// Déclenché par le bouton « Tout payer » (le veilleur lance : node pay-cart.mjs).
// Réutilise la logique éprouvée du robot mono-commande (CVV, espace client, vérification).
import { chromium } from "playwright"
import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { dirname, join } from "node:path"
import { uploadLabelToDrive } from "./drive.mjs"

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
const KEY = env.RPA_API_KEY
const APP = (env.APP_URL || "http://localhost:3000").replace(/\/+$/, "")
const log = (m) => console.log("  " + m)

// ── Liste les commandes actuellement « au panier » (via Upstash REST). ──
async function listInCart() {
  const base = env.UPSTASH_REDIS_REST_URL
  const token = env.UPSTASH_REDIS_REST_TOKEN
  if (!base || !token) throw new Error("UPSTASH_REDIS_REST_URL / _TOKEN absents de .env.local")
  const h = { Authorization: `Bearer ${token}` }
  const z = await (await fetch(`${base}/zrange/orders/0/-1`, { headers: h })).json().catch(() => ({}))
  const refs = z.result || []
  const orders = []
  for (const ref of refs) {
    const d = await (await fetch(`${base}/get/order:${ref}`, { headers: h })).json().catch(() => ({}))
    if (d.result == null) continue
    const o = typeof d.result === "string" ? JSON.parse(d.result) : d.result
    if (o && o.status === "in_cart") orders.push(o)
  }
  return orders
}

// ── Alerte Telegram courte (réutilise /api/rpa/alert). ──
async function sendAlert(errMsg, reset = false) {
  if (!KEY) return
  try {
    const fd = new FormData()
    fd.append("ref", "PANIER")
    fd.append("step", "paiement groupé")
    fd.append("error", String(errMsg || "").slice(0, 200))
    fd.append("reset", reset ? "1" : "0")
    await fetch(`${APP}/api/rpa/alert`, { method: "POST", headers: { "x-robot-key": KEY }, body: fd })
    console.log("  📨 Alerte Telegram envoyée.")
  } catch {
    /* best-effort */
  }
}

// ── Extraction du n° de suivi (formats FR imprimé + international/Belgique UPU). ──
async function extractTracking(filePath) {
  try {
    const pdf = (await import("pdf-parse")).default
    const text = (await pdf(readFileSync(filePath))).text || ""
    const human = text.match(/\d[A-Z]\s\d{10}\s\d(?!\d)/)
    if (human) return { tn: human[0].replace(/\s+/g, ""), text }
    const intl = text.match(/[A-Z]{2}(?:\s?\d){9}\s?[A-Z]{2}/)
    if (intl) return { tn: intl[0].replace(/\s+/g, ""), text }
    // Fallback : motif compact (avec espaces éventuels entre chiffres), comme colissimo.mjs.
    const compact = (text.match(/\d[A-Z](?:\s*\d){11}/g) || []).map((m) => m.replace(/\s+/g, ""))
    if (compact.length) return { tn: compact[0], text }
    return { tn: "", text }
  } catch {
    return { tn: "", text: "" }
  }
}

const norm = (s) => (s || "").toLowerCase().normalize("NFD").replace(/[^a-z0-9]/g, "")

// ── Poste l'étiquette d'une commande (→ expédiée + Telegram + client). ──
async function postShipped(order, filePath, tn) {
  const fd = new FormData()
  fd.append("ref", order.ref)
  if (tn) fd.append("trackingNumber", tn)
  fd.append("file", new Blob([readFileSync(filePath)], { type: "application/pdf" }), `bordereau-${order.ref}.pdf`)
  const r = await fetch(`${APP}/api/rpa/shipped`, { method: "POST", headers: { "x-robot-key": KEY }, body: fd })
  return r.ok
}

// Change le statut d'une commande (JSON) — sert au verrou anti-re-paiement après paiement.
async function setStatus(ref, status) {
  await fetch(`${APP}/api/rpa/shipped`, {
    method: "POST",
    headers: { "x-robot-key": KEY, "Content-Type": "application/json" },
    body: JSON.stringify({ ref, status }),
  }).catch(() => {})
}

// ── CVV (iframe Scellius/Lyra : vraies frappes, pas fill()). ──
async function fillCVV(page, cvv) {
  for (const fr of page.frames()) {
    if (!/scelliuspaiement|krypton|lyra/i.test(fr.url())) continue
    try {
      const inp = fr.locator('input[placeholder="CVV"]')
      if ((await inp.count()) > 0) {
        await inp.first().click().catch(() => {})
        await inp.first().pressSequentially(String(cvv), { delay: 90 })
        await inp.first().press("Tab").catch(() => {})
        return true
      }
    } catch {
      /* iframe suivante */
    }
  }
  return false
}

// ── Connexion La Poste auto si l'écran de connexion apparaît. ──
async function loginIfNeeded(page) {
  if (!env.LAPOSTE_EMAIL || !env.LAPOSTE_PASSWORD) return
  const onLogin =
    (await page.locator("#username").first().isVisible({ timeout: 1500 }).catch(() => false)) ||
    page.url().includes("moncompte.laposte.fr")
  if (!onLogin) return
  for (let i = 0; i < 3; i++) {
    log(`Connexion La Poste… (tentative ${i + 1}/3)`)
    await page.locator("#username").fill(env.LAPOSTE_EMAIL).catch(() => {})
    await page.locator("#password").fill(env.LAPOSTE_PASSWORD).catch(() => {})
    await page.locator("#rememberMe").check({ timeout: 2000 }).catch(() => {})
    await page.locator("#submit-button").click({ timeout: 6000 }).catch(() => {})
    const ok = await page
      .waitForFunction(() => !location.href.includes("moncompte.laposte.fr") && !document.querySelector("#username"), null, { timeout: 15000 })
      .then(() => true)
      .catch(() => false)
    if (ok) {
      log("  ✓ Connecté.")
      await page.waitForTimeout(2000)
      return
    }
    await page.waitForTimeout(2500)
  }
}

// ════════════════════════════════════════════════════════════════════════════
const sandboxArgs = process.env.RPA_NO_SANDBOX === "1" ? ["--no-sandbox", "--disable-dev-shm-usage"] : []
const ctx = await chromium.launchPersistentContext(join(__dirname, ".chromium"), {
  headless: process.env.RPA_HEADLESS === "1",
  viewport: { width: 1400, height: 950 },
  args: sandboxArgs,
})
ctx.setDefaultTimeout(22000)
const page = ctx.pages()[0] || (await ctx.newPage())

// Garde-fou anti-blocage : sortie forcée au bout de 18 min (un lot prend plus de temps).
setTimeout(async () => {
  console.error("\n⏱️ Garde-fou : 18 min dépassées — sortie forcée.")
  await sendAlert("paiement groupé bloqué > 18 min", false).catch(() => {})
  await ctx.close().catch(() => {})
  process.exit(1)
}, 18 * 60 * 1000).unref()

try {
  const orders = await listInCart()
  console.log(`\n🛒 Paiement groupé — ${orders.length} colis au panier.\n`)
  if (orders.length === 0) {
    console.log("Panier vide (aucune commande in_cart) — rien à payer.")
    await ctx.close().catch(() => {})
    process.exit(0)
  }


  // ── 1) Récapitulatif colis → « Accéder au panier » → (login) → « Valider mon panier » → paiement ──
  log("Ouverture du panier…")
  await page.goto("https://www.laposte.fr/colissimo-en-ligne/panier", { waitUntil: "domcontentloaded" })
  await page.locator("#onetrust-accept-btn-handler").click({ timeout: 2500 }).catch(() => {})
  await page.waitForTimeout(4000)
  // Le récapitulatif liste les colis : on clique « Accéder au panier » pour passer au checkout.
  await page.locator('button:has-text("Accéder au panier"), a:has-text("Accéder au panier")').first().click({ timeout: 10000 }).catch(() => {})
  await page.waitForTimeout(3500)
  await loginIfNeeded(page)
  await page.locator('button:has-text("Valider mon panier")').first().click({ timeout: 10000 }).catch(() => {})
  await page.waitForURL(/checkout\/paiement/, { timeout: 25000 }).catch(() => {})
  await loginIfNeeded(page)
  await page.waitForTimeout(2000)

  // ── 2) Paiement (carte mémorisée + CVV + cases) ──
  if (env.RPA_AUTOPAY !== "1" || !env.LAPOSTE_CVV) {
    console.log("⚠️ RPA_AUTOPAY≠1 ou CVV absent — paie à la main puis relance la récupération.")
    await sendAlert("auto-paiement non armé (CVV/RPA_AUTOPAY)", false)
    await ctx.close().catch(() => {})
    process.exit(1)
  }
  log("Paiement du panier : carte mémorisée + CVV + cases…")
  await page.locator('label[for="card-input-id-credit_card"]').click({ timeout: 6000 }).catch(() => {})
  await page.waitForTimeout(4500)
  const cvvOk = await fillCVV(page, env.LAPOSTE_CVV)
  log(cvvOk ? "  ✓ CVV saisi." : "  ✗ CVV introuvable.")
  await page.locator("#dangerousMaterial").check().catch(() => {})
  await page.locator("#cgv").check().catch(() => {})
  await page.waitForTimeout(2500)

  const payBtn = page.locator('button:has-text("Payer")').first()
  const payText = await payBtn.innerText().catch(() => "")
  const amount = parseFloat(((payText.match(/(\d+[.,]\d{2})/) || [])[1] || "0").replace(",", "."))
  // Garde anti-surfacturation adaptée au LOT : ≤ ~16 € par colis attendu + petite marge.
  const maxAmount = orders.length * 16 + 2
  if (amount > maxAmount) {
    console.log(`\n⛔ Panier à ${amount} € (> ${maxAmount} € attendu pour ${orders.length} colis) — paiement ANNULÉ.`)
    await sendAlert(`panier à ${amount} € (> ${maxAmount} € attendu pour ${orders.length} colis) — paiement annulé`, false)
    await ctx.close().catch(() => {})
    process.exit(1)
  }

  let paid = false
  for (let i = 0; i < 12 && !paid; i++) {
    if (await payBtn.isDisabled().catch(() => true)) {
      await page.waitForTimeout(2000)
      continue
    }
    await payBtn.scrollIntoViewIfNeeded({ timeout: 2000 }).catch(() => {})
    try {
      await payBtn.click({ timeout: 3000, force: true })
      paid = true
    } catch {
      await payBtn.dispatchEvent("click").then(() => (paid = true)).catch(() => {})
      await page.waitForTimeout(1500)
    }
  }
  if (!paid) {
    console.log("\n⚠️ Bouton « Payer » non déclenché.")
    await sendAlert("bouton Payer du panier resté inactif", false)
    await ctx.close().catch(() => {})
    process.exit(1)
  }
  console.log(`\n💳 Panier payé (${amount} €). Valide la 3-D Secure si demandée…`)
  // 🔒 ANTI-RE-PAIEMENT : dès que le panier est payé, on sort les commandes de « in_cart »
  // (→ generating). Ainsi, si pay-cart plante ensuite et qu'on relance « pay », listInCart()
  // est vide → AUCUN nouveau paiement. Le téléchargement des étiquettes suit juste après.
  for (const o of orders) await setStatus(o.ref, "generating")
  await page.waitForTimeout(9000) // laisse La Poste finaliser + créer les colis

  // ── 3) Récupérer les N étiquettes (= les N colis les PLUS RÉCENTS de l'espace client, ceux
  //        qu'on vient de payer), lire chaque PDF, et relier chacun à SA commande par le
  //        TÉLÉPHONE du client (présent sur l'étiquette, unique même pour 2 colis au même relais)
  //        + le nom. → plus aucun risque de mélange d'étiquettes.
  let okCount = 0
  const N = orders.length
  const unmatched = new Map(orders.map((o) => [o.ref, o])) // commandes pas encore appariées
  // « 0612345678 » → « 612345678 » (sans l'indicatif 0) ; sur l'étiquette le tél s'affiche
  // « +33612345678 » → ses chiffres contiennent « 612345678 ».
  const phoneTail = (s) => (s || "").replace(/\D/g, "").replace(/^0/, "")

  for (let i = 0; i < N && unmatched.size; i++) {
    const pdfPath = join(__dirname, `batch-${i}.pdf`)
    let downloaded = false
    const onDl = async (d) => {
      try {
        await d.saveAs(pdfPath)
        downloaded = true
      } catch {
        /* ignore */
      }
    }
    page.on("download", onDl)
    for (let t = 0; t < 6 && !downloaded; t++) {
      await page.goto("https://www.laposte.fr/espaceclient/", { waitUntil: "domcontentloaded" }).catch(() => {})
      await page.waitForTimeout(3500)
      const card = page.locator('button:has-text("Colis - "), a:has-text("Colis - ")').nth(i)
      if (!(await card.isVisible({ timeout: 3000 }).catch(() => false))) {
        await page.waitForTimeout(4000)
        continue
      }
      await card.click().catch(() => {})
      await page.waitForTimeout(3000)
      const dl = page.locator('button:has-text("Télécharger l"), a:has-text("Télécharger l")').first()
      if (await dl.isVisible({ timeout: 5000 }).catch(() => false)) {
        await dl.click().catch(() => {})
        await page.waitForTimeout(4000)
      }
    }
    page.off("download", onDl)
    if (!downloaded) {
      console.log(`  ✗ colis #${i + 1} : téléchargement impossible.`)
      continue
    }

    // Lit le PDF et le relie au BON ordre : téléphone (clé unique) + nom.
    const { tn, text } = await extractTracking(pdfPath)
    const digits = (text || "").replace(/\D/g, "")
    let match = null
    for (const o of unmatched.values()) {
      const tail = phoneTail(o.telephone)
      if (tail.length >= 6 && digits.includes(tail) && (!o.nom || norm(text).includes(norm(o.nom)))) {
        match = o
        break
      }
    }
    // Repli (étiquette sans tél lisible) : nom + CP en domicile, nom seul en relais.
    if (!match) {
      for (const o of unmatched.values()) {
        const nomOk = norm(text).includes(norm(o.nom)) && norm(text).includes(norm(o.prenom))
        const cpOk = o.deliveryMode === "relais" || !o.codePostal || text.replace(/\s+/g, "").includes(o.codePostal)
        if (nomOk && cpOk) {
          match = o
          break
        }
      }
    }
    if (!match) {
      console.log(`  ⚠️ colis #${i + 1} (suivi ${tn || "?"}) : non associé à une commande.`)
      await sendAlert(`une étiquette du lot (suivi ${tn || "?"}) n'a pas pu être reliée à une commande — vérifie à la main`, false)
      continue
    }
    const posted = await postShipped(match, pdfPath, tn)
    console.log(posted ? `  ✓ ${match.ref} — ${match.prenom} ${match.nom} (suivi: ${tn || "?"})` : `  ⚠️ ${match.ref} — /shipped a échoué`)
    if (posted) {
      okCount++
      await uploadLabelToDrive(match, pdfPath, tn) // ☁️ dépôt Drive + ligne Sheet (best-effort)
    }
    unmatched.delete(match.ref)
  }

  // Commandes payées mais dont l'étiquette n'a pas été récupérée → on alerte.
  for (const o of unmatched.values()) {
    console.log(`  ✗ ${o.ref} : étiquette non récupérée.`)
    await sendAlert(`${o.ref} payé mais étiquette non récupérée — récupère-la à la main`, false)
  }
  console.log(`\n✅ Paiement groupé terminé : ${okCount}/${orders.length} étiquettes postées.`)
  await ctx.close().catch(() => {})
  process.exit(0)
} catch (e) {
  const msg = e?.message?.split("\n")[0]
  console.error("\n⚠️ Paiement groupé interrompu :", msg)
  await sendAlert(`paiement groupé interrompu : ${msg}`, false)
  await ctx.close().catch(() => {})
  process.exit(1)
}
