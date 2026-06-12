// Ouvre le panier La Poste dans la session connectée (.userdata) pour gérer/vider
// les colis à la main. Ferme la fenêtre quand tu as fini.
import { chromium } from "playwright"
import { fileURLToPath } from "node:url"
import { dirname, join } from "node:path"

const __dirname = dirname(fileURLToPath(import.meta.url))
const url = process.argv[2] || "https://www.laposte.fr/checkout/recapitulatif"

const ctx = await chromium.launchPersistentContext(join(__dirname, ".chromium"), {
  headless: false,
  viewport: null,
  args: ["--start-maximized"],
})
const page = ctx.pages()[0] ?? (await ctx.newPage())
await page.goto(url, { waitUntil: "domcontentloaded" }).catch(() => {})
console.log("🛒 Panier La Poste ouvert. Supprime les colis de test, puis FERME la fenêtre.")
await new Promise((r) => ctx.on("close", r))
process.exit(0)
