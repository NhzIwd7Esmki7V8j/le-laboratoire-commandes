// Connexion initiale La Poste sur le SERVEUR (à faire 1 seule fois via l'écran déporté noVNC).
// Ouvre la page de connexion dans le profil persistant .chromium ; connecte-toi, va dans
// « Mes moyens de paiement » et MÉMORISE la carte, puis arrête le conteneur (Ctrl+C).
// La session + la carte restent ensuite dans le volume .chromium → le veilleur paie tout seul.
import { chromium } from "playwright"
import { fileURLToPath } from "node:url"
import { dirname, join } from "node:path"

const __dirname = dirname(fileURLToPath(import.meta.url))
const url = process.argv[2] || "https://www.laposte.fr/connexion"

const sandboxArgs = process.env.RPA_NO_SANDBOX === "1" ? ["--no-sandbox", "--disable-dev-shm-usage"] : []
const ctx = await chromium.launchPersistentContext(join(__dirname, ".chromium"), {
  headless: false,
  viewport: null,
  args: ["--start-maximized", ...sandboxArgs],
})
const page = ctx.pages()[0] ?? (await ctx.newPage())
await page.goto(url, { waitUntil: "domcontentloaded" }).catch(() => {})
console.log("🔐 Page de connexion La Poste ouverte dans l'écran déporté (noVNC).")
console.log("   1) Connecte-toi (email + mot de passe).")
console.log("   2) Va dans « Mes moyens de paiement » et MÉMORISE la carte bancaire.")
console.log("   3) Quand c'est fait, arrête le conteneur (Ctrl+C) — la session est gardée.")
await new Promise((r) => ctx.on("close", r))
process.exit(0)
