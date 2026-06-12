// Veilleur — tourne en local, surveille la file Redis « robot:queue ».
// Quand tu cliques « ⚗️ Générer le bordereau » dans Telegram, le webhook y pousse la
// réf de commande ; le veilleur la récupère et lance le robot Colissimo (Edge s'ouvre
// sur ton écran, tu paies). Un seul robot à la fois (séquentiel).
//
// Lancer : double-clic Veilleur.bat  (ou : npm run watch)
import { readFileSync } from "node:fs"
import { spawn } from "node:child_process"
import { fileURLToPath } from "node:url"
import { dirname, join } from "node:path"

const __dirname = dirname(fileURLToPath(import.meta.url))

const env = {}
try {
  const txt = readFileSync(join(__dirname, "..", ".env.local"), "utf8")
  for (const l of txt.split(/\r?\n/)) {
    const m = l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/)
    if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, "")
  }
} catch {
  /* pas de .env.local */
}
const URL = env.UPSTASH_REDIS_REST_URL
const TOKEN = env.UPSTASH_REDIS_REST_TOKEN
if (!URL || !TOKEN) {
  console.error("❌ UPSTASH_REDIS_REST_URL / _TOKEN absents de .env.local")
  process.exit(1)
}
const cmd = (arr) =>
  fetch(URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify(arr),
  }).then((r) => r.json())

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

// Lance le bon script selon le job reçu :
//   "cart:CMD_xxx" → ajoute le colis au panier (sans payer)   [colissimo.mjs + RPA_CART_ONLY=1]
//   "pay"          → paie TOUT le panier + récupère les étiquettes   [pay-cart.mjs]
//   "CMD_xxx"      → ancien mode : remplit + paie un seul colis  [colissimo.mjs]
function runRobot(job) {
  return new Promise((resolve) => {
    let script, args, env, label
    if (job === "pay") {
      script = "pay-cart.mjs"
      args = []
      env = { ...process.env }
      label = "paiement groupé du panier"
    } else if (job.startsWith("cart:")) {
      const ref = job.slice(5)
      script = "colissimo.mjs"
      args = [ref]
      env = { ...process.env, RPA_CART_ONLY: "1" }
      label = `ajout au panier ${ref}`
    } else {
      script = "colissimo.mjs"
      args = [job]
      env = { ...process.env }
      label = `génération ${job}`
    }
    console.log(`▶️  Robot lancé — ${label}`)
    const p = spawn(process.execPath, [script, ...args], { cwd: __dirname, stdio: "inherit", env })
    p.on("exit", (code) => {
      console.log(`◀️  Robot terminé — ${label} (code ${code}).\n`)
      resolve()
    })
    p.on("error", (e) => {
      console.log(`⚠️ Lancement du robot échoué: ${e.message}\n`)
      resolve()
    })
  })
}

console.log("👁️  Veilleur démarré. En attente des « Générer le bordereau » depuis Telegram…")
console.log("    (Garde cette fenêtre ouverte. Ctrl+C pour arrêter.)\n")

while (true) {
  let job = null
  try {
    // BLPOP : attente bloquante (jusqu'à 10 s) → on récupère le job DÈS qu'il arrive
    // (latence quasi nulle après le clic), sans marteler Redis.
    const res = (await cmd(["BLPOP", "robot:queue", 10]))?.result
    job = Array.isArray(res) ? res[1] : null // BLPOP renvoie [clé, valeur] ou null (timeout)
  } catch (e) {
    console.log("⚠️ Redis indisponible: " + (e?.message ?? e))
    await sleep(2000) // back-off si Redis est momentanément KO
  }
  if (job) {
    console.log(`📥 Job reçu : ${job}`)
    await runRobot(job) // séquentiel : on attend la fin du robot avant le job suivant
  }
}
