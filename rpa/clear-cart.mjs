// Vide le panier La Poste de façon fiable (profil Chromium .chromium connecté).
// Méthode : /panier → pour chaque colis « Supprimer » → confirmation « Oui, le retirer ».
import { chromium } from "playwright"
import { fileURLToPath } from "node:url"
import { dirname, join } from "node:path"

const __dirname = dirname(fileURLToPath(import.meta.url))
const ctx = await chromium.launchPersistentContext(join(__dirname, ".chromium"), {
  headless: process.env.RPA_HEADLESS === "1",
  viewport: { width: 1400, height: 950 },
})
const page = ctx.pages()[0] ?? (await ctx.newPage())

let cleared = false
for (let i = 0; i < 12; i++) {
  await page.goto("https://www.laposte.fr/colissimo-en-ligne/panier", { waitUntil: "domcontentloaded" }).catch(() => {})
  await page.waitForTimeout(2500)
  if (await page.locator(".panierEmpty").isVisible({ timeout: 2000 }).catch(() => false)) { cleared = true; break }
  const del = page.locator('button.tile__button:has-text("Supprimer")').first()
  const vis = await del.isVisible({ timeout: 3000 }).catch(() => false)
  console.log(`iter ${i} — Supprimer visible=${vis} @ ${page.url()}`)
  if (!vis) { cleared = true; break }
  await del.click().catch(() => {})
  await page.waitForTimeout(1200)
  await page.locator('button:has-text("Oui, le retirer")').first().click({ timeout: 4000 }).catch(() => {})
  await page.waitForTimeout(2500)
}
console.log(cleared ? "CART_CLEARED" : "CART_CLEAR_INCOMPLETE")
await ctx.close().catch(() => {})
process.exit(0)
