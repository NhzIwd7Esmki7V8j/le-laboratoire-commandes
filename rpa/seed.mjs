// Seed de commandes de TEST dans Redis (pour tester le robot sans passer commande).
// Usage : node seed.mjs        (crée/écrase les commandes de test)
//         node seed.mjs clean  (supprime les commandes de test)
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

async function cmd(arr) {
  const res = await fetch(URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify(arr),
  })
  return res.json()
}

const now = Date.now()
const ORDERS = [
  {
    ref: "CMD_900001", status: "paid", createdAt: now,
    prenom: "Jean", nom: "Dupont", telephone: "0612345678",
    deliveryMode: "domicile", pays: "FR",
    adresse: "10 rue de Rivoli", codePostal: "75001", ville: "Paris",
    message: "[TEST] domicile FR",
  },
  {
    ref: "CMD_900002", status: "paid", createdAt: now - 1000,
    prenom: "Marie", nom: "Martin", telephone: "0623456789",
    deliveryMode: "domicile", pays: "FR",
    adresse: "5 avenue des Champs-Élysées", codePostal: "75008", ville: "Paris",
    message: "[TEST] domicile FR 2",
  },
  {
    ref: "CMD_900003", status: "paid", createdAt: now - 2000,
    prenom: "Paul", nom: "Bernard", telephone: "0634567890",
    deliveryMode: "relais", pays: "FR",
    adresse: "20 rue d'Alsace Lorraine", codePostal: "31000", ville: "Toulouse",
    pointRelais: "Relais Test", relayId: "TEST31",
    message: "[TEST] point relais FR",
  },
  {
    ref: "CMD_900004", status: "paid", createdAt: now - 3000,
    prenom: "Luc", nom: "Dubois", telephone: "0645678901",
    deliveryMode: "domicile", pays: "BE",
    adresse: "Rue Neuve 1", codePostal: "1000", ville: "Bruxelles",
    message: "[TEST] domicile BE",
  },
]

const clean = process.argv.includes("clean")
for (const o of ORDERS) {
  if (clean) {
    await cmd(["DEL", `order:${o.ref}`])
    await cmd(["ZREM", "orders", o.ref])
    console.log("🗑️  supprimé", o.ref)
  } else {
    await cmd(["SET", `order:${o.ref}`, JSON.stringify(o)])
    await cmd(["ZADD", "orders", String(o.createdAt), o.ref])
    console.log("✅ seedé", o.ref, "—", o.deliveryMode, o.pays)
  }
}
console.log(clean ? "Nettoyage terminé." : "Seed terminé.")
