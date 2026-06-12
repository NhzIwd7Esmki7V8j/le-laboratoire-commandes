// Envoie une VRAIE commande dans le canal admin (rendu + boutons identiques au formulaire du
// site), pour la voir/cliquer sur Telegram. Sauve aussi la commande dans Redis → les boutons
// Accepter / Payé / Générer fonctionnent. Usage : node send-order.mjs [relais]
import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { dirname, join } from "node:path"

const __dirname = dirname(fileURLToPath(import.meta.url))
const env = {}
for (const l of readFileSync(join(__dirname, "..", ".env.local"), "utf8").split(/\r?\n/)) {
  const m = l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/)
  if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, "")
}
const redis = (arr) =>
  fetch(env.UPSTASH_REDIS_REST_URL, { method: "POST", headers: { Authorization: `Bearer ${env.UPSTASH_REDIS_REST_TOKEN}`, "Content-Type": "application/json" }, body: JSON.stringify(arr) }).then((r) => r.json())

const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
const SEP = "━━━━━━━━━━━━"
const FLAG = { FR: "🇫🇷", BE: "🇧🇪" }

const relais = process.argv.includes("relais")
const ref = `CMD_${Math.floor(100000 + Math.random() * 900000)}`
const order = relais
  ? { ref, status: "pending", createdAt: Date.now(), prenom: "Camille", nom: "Roussel", telephone: "0744556677",
      deliveryMode: "relais", pays: "FR", adresse: "20 rue d'Alsace Lorraine", codePostal: "31000", ville: "Toulouse",
      pointRelais: "RETIK 243 MULTISERVICES — 14 B RUE MAURICE FONVIEILLE, 31000 TOULOUSE", relayId: "434507",
      message: "2x BPC-157 5mg + 1x TB-500 2mg" }
  : { ref, status: "pending", createdAt: Date.now(), prenom: "Camille", nom: "Roussel", telephone: "0744556677",
      deliveryMode: "domicile", pays: "FR", adresse: "12 rue Victor Hugo", codePostal: "69003", ville: "Lyon",
      message: "2x BPC-157 5mg + 1x TB-500 2mg" }

const deliveryLine = order.deliveryMode === "relais"
  ? `🚚 <i>Colissimo · Point Retrait</i>\n📦 ${esc(order.pointRelais)} ${FLAG[order.pays]} <i>(#${esc(order.relayId)})</i>`
  : `🚚 <i>Colissimo · Domicile</i>\n🏠 ${esc(order.adresse)}, ${esc(order.codePostal)}, ${esc(order.ville)} ${FLAG[order.pays]}`

const date = new Date(order.createdAt).toLocaleString("fr-FR", { timeZone: "Europe/Paris", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })
const text =
  `🧪 <b>LE LABORATOIRE</b> · Commande\n${SEP}\n` +
  `📋 <b>${esc(ref)}</b>\n👤 ${esc(order.prenom)} ${esc(order.nom)}\n📞 ${esc(order.telephone)}\n` +
  `${deliveryLine}\n💬 <i>${esc(order.message)}</i>\n🕐 ${date}\n${SEP}\n⏳ En attente de validation`

const buttons = { inline_keyboard: [[{ text: "✅ Accepter", callback_data: `acc:${ref}` }, { text: "❌ Refuser", callback_data: `ref:${ref}` }]] }

await redis(["SET", `order:${ref}`, JSON.stringify(order)])
await redis(["ZADD", "orders", String(order.createdAt), ref])
const res = await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
  method: "POST", headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ chat_id: env.TELEGRAM_CHAT_ID, text, parse_mode: "HTML", reply_markup: buttons }),
}).then((r) => r.json())
const mid = res?.result?.message_id
if (mid) await redis(["SET", `order:${ref}`, JSON.stringify({ ...order, telegramChatId: Number(env.TELEGRAM_CHAT_ID), telegramMessageId: mid })])
console.log(res?.ok ? `✅ Commande ${ref} envoyée dans le canal (${order.deliveryMode}, msg ${mid}).` : `❌ Échec: ${JSON.stringify(res)}`)
