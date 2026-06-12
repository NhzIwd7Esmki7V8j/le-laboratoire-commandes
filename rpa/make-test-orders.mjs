// Crée 4 commandes de test (FR domicile, FR relais, BE domicile, BE relais) dans Redis,
// chacune postée dans le canal admin Telegram (pour recevoir l'étiquette). Affiche les réfs.
import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { dirname, join } from "node:path"
const __dirname = dirname(fileURLToPath(import.meta.url))
const env = {}
for (const l of readFileSync(join(__dirname, "..", ".env.local"), "utf8").split(/\r?\n/)) {
  const m = l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/)
  if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, "")
}
const redis = (a) => fetch(env.UPSTASH_REDIS_REST_URL, { method: "POST", headers: { Authorization: `Bearer ${env.UPSTASH_REDIS_REST_TOKEN}`, "Content-Type": "application/json" }, body: JSON.stringify(a) }).then((r) => r.json())
const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")

const base = [
  { tag: "FR-DOMICILE", prenom: "Camille", nom: "Roussel", telephone: "0612345678", email: "test.labo.fr1@gmail.com",
    deliveryMode: "domicile", pays: "FR", adresse: "10 rue de Rivoli", codePostal: "75001", ville: "Paris" },
  { tag: "FR-RELAIS", prenom: "Karim", nom: "Benali", telephone: "0744556677", email: "test.labo.fr2@gmail.com",
    deliveryMode: "relais", pays: "FR", adresse: "20 rue d'Alsace Lorraine", codePostal: "31000", ville: "Toulouse",
    pointRelais: "RETIK 243 MULTISERVICES — 14 B RUE MAURICE FONVIEILLE, 31000 TOULOUSE", relayId: "434507" },
  { tag: "BE-DOMICILE", prenom: "Tom", nom: "Janssens", telephone: "0470123456", email: "test.labo.be1@gmail.com",
    deliveryMode: "domicile", pays: "BE", adresse: "Rue Neuve 1", codePostal: "1000", ville: "Bruxelles" },
  { tag: "BE-RELAIS", prenom: "Lucas", nom: "Maes", telephone: "0471234567", email: "test.labo.be2@gmail.com",
    deliveryMode: "relais", pays: "BE", adresse: "Rue Léopold 10", codePostal: "4000", ville: "Liège",
    pointRelais: "Relais Test BE", relayId: "BE1" },
]

const now = Date.now()
const refs = []
for (let i = 0; i < base.length; i++) {
  const o = { ...base[i], ref: `CMD_${Math.floor(100000 + Math.random() * 900000)}`, status: "generating", createdAt: now + i }
  const flag = o.pays === "BE" ? "🇧🇪" : "🇫🇷"
  const txt = `🧪 <b>TEST ${o.tag}</b> — <b>${o.ref}</b>\n👤 ${esc(o.prenom)} ${esc(o.nom)} ${flag}\n🚚 ${o.deliveryMode}${o.pointRelais ? " · " + esc(o.pointRelais) : ""}\n🟢 Robot en cours…`
  const res = await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: env.TELEGRAM_CHAT_ID, text: txt, parse_mode: "HTML" }),
  }).then((r) => r.json())
  if (res?.result?.message_id) { o.telegramChatId = Number(env.TELEGRAM_CHAT_ID); o.telegramMessageId = res.result.message_id }
  await redis(["SET", `order:${o.ref}`, JSON.stringify(o)])
  await redis(["ZADD", "orders", String(o.createdAt), o.ref])
  refs.push(`${o.ref} ${o.tag}`)
}
console.log("REFS:")
for (const r of refs) console.log(r)
