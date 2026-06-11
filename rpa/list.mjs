// Liste les commandes en base (ref, statut, client, livraison) — lecture seule.
import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { dirname, join } from "node:path"

const __dirname = dirname(fileURLToPath(import.meta.url))
const txt = readFileSync(join(__dirname, "..", ".env.local"), "utf8")
const env = {}
for (const line of txt.split(/\r?\n/)) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/)
  if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, "")
}
const URL = env.UPSTASH_REDIS_REST_URL
const TOKEN = env.UPSTASH_REDIS_REST_TOKEN
const cmd = (arr) =>
  fetch(URL, { method: "POST", headers: { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json" }, body: JSON.stringify(arr) }).then((r) => r.json())

const refs = (await cmd(["ZRANGE", "orders", "0", "-1", "REV"]))?.result ?? []
if (!refs.length) {
  console.log("Aucune commande en base.")
  process.exit(0)
}
const vals = (await cmd(["MGET", ...refs.map((r) => `order:${r}`)]))?.result ?? []
for (let i = 0; i < refs.length; i++) {
  const o = typeof vals[i] === "string" ? JSON.parse(vals[i]) : vals[i]
  if (!o) continue
  const lieu = o.deliveryMode === "relais" ? `relais:${o.pointRelais ?? "?"}` : [o.adresse, o.codePostal, o.ville].filter(Boolean).join(", ")
  console.log(`${o.ref}  [${o.status}]  ${o.prenom} ${o.nom} (${o.pays})  ${o.deliveryMode}  → ${lieu}`)
}
