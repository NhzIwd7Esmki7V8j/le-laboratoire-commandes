// Mode CAPTURE supervisée — mappe la sélection du point relais.
// Le robot remplit le parcours jusqu'à l'écran « Arrivée » (adresse saisie), puis
// ENREGISTRE tous tes clics (sélecteur exact) + les appels réseau « relais ».
// Toi : clique « En point de retrait », puis choisis un relais. Je lis le log.
import { chromium } from "playwright-core"
import { fileURLToPath } from "node:url"
import { dirname, join } from "node:path"

const __dirname = dirname(fileURLToPath(import.meta.url))

const ctx = await chromium.launchPersistentContext(join(__dirname, ".userdata"), {
  channel: "msedge",
  headless: false,
  viewport: { width: 1400, height: 950 },
})
ctx.setDefaultTimeout(15000)
const page = ctx.pages()[0] ?? (await ctx.newPage())

// ── Capture des clics utilisateur (sélecteur + texte) ───────────────────────
await page.exposeFunction("__cap", (d) => console.log("CLICK", JSON.stringify(d)))
await page.addInitScript(() => {
  const desc = (el) => {
    if (!el || !el.tagName) return null
    let idChain = []
    let p = el
    while (p && idChain.length < 6) {
      if (p.id) idChain.push("#" + p.id)
      p = p.parentElement
    }
    return {
      tag: el.tagName.toLowerCase(),
      id: el.id || "",
      cls: (el.className || "").toString().slice(0, 80),
      forAttr: el.getAttribute ? el.getAttribute("for") || "" : "",
      role: el.getAttribute ? el.getAttribute("role") || "" : "",
      text: (el.innerText || el.value || "").replace(/\s+/g, " ").trim().slice(0, 60),
      idChain,
    }
  }
  document.addEventListener(
    "click",
    (e) => {
      try {
        window.__cap && window.__cap(desc(e.target))
      } catch {}
    },
    true,
  )
})

// ── Capture réseau (recherche de relais) ────────────────────────────────────
const RELAY_RE = /relai|point|pudo|pickup|retrait|sls|geo|commerc|search|chronopost|so-?colissimo|deliver|deposit/i
page.on("request", (r) => {
  if (RELAY_RE.test(r.url())) console.log("➡️  REQ", r.method(), r.url().slice(0, 160))
})
page.on("response", async (r) => {
  if (!RELAY_RE.test(r.url())) return
  const ct = r.headers()["content-type"] || ""
  let body = ""
  if (ct.includes("json")) {
    try {
      body = JSON.stringify(await r.json()).slice(0, 2000)
    } catch {}
  }
  console.log("⬅️  RES", r.status(), r.url().slice(0, 130), body ? "  " + body : "")
})
page.on("framenavigated", (f) => {
  if (f === page.mainFrame()) console.log("🌐 NAV", f.url())
})

// ── Helpers de remplissage ──────────────────────────────────────────────────
const btn = (t) => page.locator(`button:has-text("${t}")`).first()
async function maybe(sel, t = 4000) {
  try {
    const loc = /[#.\[\]=>:]/.test(sel) ? page.locator(sel).first() : page.locator(`text=${sel}`).first()
    await loc.click({ timeout: t })
    return true
  } catch {
    return false
  }
}

console.log("⏳ Préparation du parcours (poids → départ → arrivée + adresse)…")
await page.goto("https://www.laposte.fr/colissimo-en-ligne", { waitUntil: "domcontentloaded" })
await maybe("#onetrust-accept-btn-handler", 2500)
await page.waitForTimeout(1500)
await page.locator("#weightInput").first().fill("0.5")
await btn("Envoyez votre colis").click()
await page.waitForTimeout(4000)
await maybe("text=Kilogrammes", 4000)
await btn("Étape suivante").click()
await page.waitForTimeout(4000)
// TEST : on choisit « Depuis votre boîte aux lettres » (D_BAL) au lieu du point de contact,
// pour voir si « En point de retrait » redevient actif.
await maybe('label[for="card-input-id-D_BAL"]', 5000)
await page.waitForTimeout(1500)
await btn("Étape suivante").click()
await page.waitForTimeout(4000)
// Adresse destinataire
await maybe("text=Renseigner une adresse", 6000)
await page.waitForTimeout(2500)
await page.locator("#sexaddressForm-MALE").first().check({ force: true })
await page.locator("#firstName").first().fill("Paul")
await page.locator("#lastName").first().fill("Bernard")
await page.locator("#zipCode-addressForm").first().fill("31000")
await page.locator("#city-addressForm").first().fill("Toulouse")
await page.locator("#streetName-addressForm").first().fill("20 rue d'Alsace Lorraine")
await btn("Enregistrer").click()
await page.waitForTimeout(2500)
await maybe("text=Confirmer cette adresse", 3500)
await page.waitForTimeout(2000)

// Réinjecte le listener sur la page courante (au cas où le parcours soit en SPA).
await page.evaluate(() => {
  if (window.__capArmed) return
  window.__capArmed = true
  const desc = (el) => {
    if (!el || !el.tagName) return null
    let idChain = [], p = el
    while (p && idChain.length < 6) { if (p.id) idChain.push("#" + p.id); p = p.parentElement }
    return {
      tag: el.tagName.toLowerCase(), id: el.id || "",
      cls: (el.className || "").toString().slice(0, 80),
      forAttr: el.getAttribute ? el.getAttribute("for") || "" : "",
      role: el.getAttribute ? el.getAttribute("role") || "" : "",
      text: (el.innerText || el.value || "").replace(/\s+/g, " ").trim().slice(0, 60),
      idChain,
    }
  }
  document.addEventListener("click", (e) => { try { window.__cap && window.__cap(desc(e.target)) } catch {} }, true)
})

// Vérifie l'état de la carte « En point de retrait » (activée ou non).
await page.waitForTimeout(2500)
const lpr = await page.evaluate(() => {
  const inp = document.querySelector("#card-input-id-L_PR")
  const card = document.querySelector("#L_PR")
  const tile = card ? card.closest(".lp-tile, .lp-card, [class*=tile], [class*=card]") : null
  return {
    found: !!inp,
    disabled: inp ? inp.disabled : null,
    inputClass: inp ? inp.className : "",
    cardClass: card ? card.className : "",
    tileClass: tile ? tile.className : "",
    ariaDisabled: card ? card.getAttribute("aria-disabled") : null,
  }
})
console.log("🔎 ÉTAT L_PR (avec dépôt boîte aux lettres) :", JSON.stringify(lpr))

console.log("\n========================================================")
console.log("✅ PRÊT. À TOI DE JOUER dans la fenêtre Edge :")
console.log("   1) Clique « En point de retrait »")
console.log("   2) Choisis un point relais dans la liste/carte")
console.log("   J'enregistre chaque clic + les appels réseau ci-dessus.")
console.log("   Laisse la fenêtre ouverte ; ferme-la quand tu as fini.")
console.log("========================================================\n")

await new Promise((resolve) => ctx.on("close", resolve))
process.exit(0)
