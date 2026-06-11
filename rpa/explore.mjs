// Reco du parcours Colissimo. Joue une séquence d'ÉTAPES puis capture l'écran
// final (screenshot + champs + cliquables) pour construire la navigation auto.
//
// Édite le tableau STEPS ci-dessous, puis : node explore.mjs
// Types d'étapes :
//   { click: "texte ou sélecteur" }   { fill: "sélecteur", value: "x" }
//   { select: "sélecteur", value: "x" }   { wait: 2000 }   { goto: "url" }
import { chromium } from "playwright-core"
import { fileURLToPath } from "node:url"
import { dirname, join } from "node:path"

const __dirname = dirname(fileURLToPath(import.meta.url))

// ─── ÉTAPES À JOUER (on les ajoute au fur et à mesure) ───
const STEPS_OLD = [
  { fill: "#weightInput", value: "0.5" },
  { click: 'button:has-text("Envoyez votre colis")' },
  { wait: 5000 },
  { click: "text=Kilogrammes" },
  { click: 'button:has-text("Étape suivante")' },
  { wait: 4500 },
  // Étape Départ (expéditeur)
  { fill: "#phone", value: "0612345678" },
  { click: "text=Depuis un point de contact La Poste" },
  { click: 'button:has-text("Étape suivante")' },
  { wait: 4500 },
  // Étape Arrivée — adresse d'abord, PUIS point de retrait
  { click: "text=Renseigner une adresse" },
  { wait: 3000 },
  { check: "#sexaddressForm-MALE" },
  { fill: "#firstName", value: "Paul" },
  { fill: "#lastName", value: "Bernard" },
  { fill: "#zipCode-addressForm", value: "31000" },
  { fill: "#city-addressForm", value: "Toulouse" },
  { fill: "#streetName-addressForm", value: "20 rue d'Alsace Lorraine" },
  { click: 'button:has-text("Enregistrer")' },
  { wait: 3000 },
  { click: "text=Confirmer cette adresse" },
  { wait: 2500 },
  { clickForce: '#card-input-id-L_PR' },
  { wait: 2000 },
  { clickForce: 'label[for="card-input-id-L_PR"]' },
  { wait: 6000 },
  // → on inspecte la carte / liste des points relais
]

// Vider le panier : aller au panier et repérer les boutons Supprimer.
const STEPS = [
  { goto: "https://www.laposte.fr/colissimo-en-ligne" },
  { wait: 4500 },
  { clickNth: { sel: '.lp-dropdown__combobox:has-text("France")', n: 1 } },
  { wait: 1500 },
  { click: "text=Belgique" },
  { wait: 2500 },
]

const ctx = await chromium.launchPersistentContext(join(__dirname, ".userdata"), {
  channel: "msedge",
  headless: false,
  viewport: { width: 1400, height: 950 },
})
ctx.setDefaultTimeout(8000)
const page = ctx.pages()[0] ?? (await ctx.newPage())

await page.goto("https://www.laposte.fr/colissimo-en-ligne", { waitUntil: "domcontentloaded" }).catch(() => {})
for (const sel of [
  "#onetrust-accept-btn-handler",
  "#popin_tc_privacy_button_2",
  "#popin_tc_privacy_button_3",
  'button:has-text("Tout accepter")',
  'button:has-text("Accepter")',
  'button:has-text("J\'accepte")',
]) {
  try {
    const b = page.locator(sel).first()
    if (await b.isVisible({ timeout: 1500 }).catch(() => false)) { await b.click(); break }
  } catch {}
}
await page.waitForTimeout(2500)

function loc(page, s) {
  // si ça ressemble à un sélecteur CSS, on l'utilise tel quel ; sinon on cherche par texte
  return /[#.\[\]=>:]/.test(s) ? page.locator(s) : page.locator(`text=${s}`)
}

for (const step of STEPS) {
  try {
    if (step.goto) await page.goto(step.goto, { waitUntil: "domcontentloaded" })
    else if (step.wait) await page.waitForTimeout(step.wait)
    else if (step.click) { await loc(page, step.click).first().click(); await page.waitForTimeout(2500) }
    else if (step.check) await loc(page, step.check).first().check({ force: true })
    else if (step.clickForce) { await loc(page, step.clickForce).first().click({ force: true }); await page.waitForTimeout(2500) }
    else if (step.clickNth) { await page.locator(step.clickNth.sel).nth(step.clickNth.n).click(); await page.waitForTimeout(2500) }
    else if (step.fill) await loc(page, step.fill).first().fill(String(step.value))
    else if (step.select) await loc(page, step.select).first().selectOption(String(step.value))
    console.log("✓ étape :", JSON.stringify(step))
  } catch (e) {
    console.log("✗ étape ÉCHOUÉE :", JSON.stringify(step), "→", e.message.split("\n")[0])
  }
}

await page.waitForTimeout(1500)
const pages = ctx.pages()
console.log(`\n${pages.length} onglet(s) ouvert(s) :`)
for (let i = 0; i < pages.length; i++) {
  await pages[i].waitForLoadState("domcontentloaded").catch(() => {})
  console.log(`  [${i}] ${pages[i].url()}  —  ${await pages[i].title().catch(() => "?")}`)
  await pages[i].screenshot({ path: join(__dirname, `shot-${i}.png`), fullPage: true }).catch(() => {})
}
// On analyse l'onglet dont l'URL n'est PAS la page d'accueil (= l'assistant), sinon le dernier.
const target =
  pages.find((p) => !/colissimo-en-ligne\/?$/.test(p.url())) ?? pages[pages.length - 1]
console.log("\n→ Analyse de :", target.url())

const fields = await target.$$eval("input, select, textarea", (els) =>
  els
    .filter((e) => e.offsetParent !== null && e.type !== "hidden")
    .map((e) => ({
      tag: e.tagName.toLowerCase(),
      type: e.type || "",
      name: e.name || "",
      id: e.id || "",
      ph: e.placeholder || "",
      label: (e.labels && e.labels[0] && e.labels[0].innerText.replace(/\s+/g, " ").trim()) || "",
      opts: e.tagName === "SELECT" ? [...e.options].map((o) => o.text.trim()).slice(0, 8) : undefined,
    })),
)
console.log("\n=== CHAMPS ===")
for (const f of fields) console.log("  " + JSON.stringify(f))

// Widget Destination / comboboxes (custom, non natifs)
const combos = await target.$$eval(
  "[role=combobox], [aria-haspopup], [class*=select], [class*=Select], [class*=dropdown], [class*=combo]",
  (els) =>
    els
      .filter((e) => e.offsetParent !== null)
      .map((e) => ({
        tag: e.tagName.toLowerCase(),
        id: e.id || "",
        cls: (e.className || "").toString().slice(0, 60),
        role: e.getAttribute("role") || "",
        t: (e.innerText || "").replace(/\s+/g, " ").trim().slice(0, 50),
      }))
      .filter((x) => x.t || x.id),
)
console.log("\n=== COMBOS/SELECTEURS ===")
for (const c of combos) console.log("  " + JSON.stringify(c))

const clicks = await target.$$eval(
  "a, button, [role=button], [role=option], [role=radio], label, li, input[type=submit]",
  (els) =>
    els
      .filter((e) => e.offsetParent !== null)
      .map((e) => ({
        tag: e.tagName.toLowerCase(),
        role: e.getAttribute("role") || "",
        t: (e.innerText || e.value || "").replace(/\s+/g, " ").trim().slice(0, 70),
        id: e.id || "",
        for: e.getAttribute("for") || "",
      }))
      .filter((x) => x.t),
)
console.log("\n=== CLIQUABLES ===")
for (const c of clicks) console.log("  " + JSON.stringify(c))

await ctx.close().catch(() => {})
process.exit(0)
