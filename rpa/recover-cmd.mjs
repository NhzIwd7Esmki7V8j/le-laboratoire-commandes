// Récupère l'étiquette d'un colis précis (par URL détail) et la poste pour une réf donnée,
// APRÈS avoir vérifié qu'elle contient un mot attendu (ville/rue) → évite la mauvaise étiquette.
// Usage: node recover-cmd.mjs <colisId> <ref> <motAttendu>
import { chromium } from "playwright"
import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { dirname, join } from "node:path"
const __dirname = dirname(fileURLToPath(import.meta.url))
const [colisId, ref, expect] = process.argv.slice(2)
const env = {}
for (const l of readFileSync(join(__dirname, "..", ".env.local"), "utf8").split(/\r?\n/)) { const m = l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/); if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, "") }

const ctx = await chromium.launchPersistentContext(join(__dirname, ".chromium"), { headless: false, viewport: { width: 1400, height: 950 } })
const page = ctx.pages()[0] || (await ctx.newPage())
const pdfPath = join(__dirname, `recover-${ref}.pdf`)
page.on("download", async (d) => { try { await d.saveAs(pdfPath); console.log("📄 téléchargé") } catch {} })
await page.goto(`https://www.laposte.fr/espaceclient/achat/detail/colis/${colisId}/0`, { waitUntil: "domcontentloaded" })
await page.locator("#onetrust-accept-btn-handler").click({ timeout: 2500 }).catch(() => {})
await page.waitForTimeout(3000)
await page.locator('button:has-text("Télécharger l"), a:has-text("Télécharger l")').first().click({ timeout: 8000 }).catch((e) => console.log("dl KO", e.message))
await page.waitForTimeout(5000)
await ctx.close().catch(() => {})

// Vérif + post
const pdf = (await import("pdf-parse")).default
const text = (await pdf(readFileSync(pdfPath))).text || ""
const ok = !expect || text.toUpperCase().includes(expect.toUpperCase())
const suivi = ((text.match(/\d[A-Z]\s\d{10}\s\d(?!\d)/) || [])[0] || "").replace(/\s+/g, "")
console.log(`Vérif "${expect}": ${ok ? "OK" : "ÉCHEC"} | suivi: ${suivi}`)
if (!ok) { console.log("⛔ Étiquette ne correspond pas — PAS postée."); process.exit(1) }
const API = (env.APP_URL || "http://localhost:3000").replace(/\/+$/, "") + "/api/rpa/shipped"
const fd = new FormData()
fd.append("ref", ref); fd.append("trackingNumber", suivi)
fd.append("file", new Blob([readFileSync(pdfPath)], { type: "application/pdf" }), `bordereau-${ref}.pdf`)
const r = await fetch(API, { method: "POST", headers: { "x-robot-key": env.RPA_API_KEY }, body: fd })
console.log(`shipped → ${r.status}: ${await r.text()}`)
process.exit(0)
