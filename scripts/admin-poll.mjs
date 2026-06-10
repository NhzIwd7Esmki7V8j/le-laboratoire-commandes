// Bridge dev local : long-polling Telegram → POST /api/telegram (bot admin).
// Permet de tester les boutons Accepter/Payé/Générer du canal admin sans webhook public.
//
// ⚠️ EN ROUTANT EN LOCAL, ON SUPPRIME LE WEBHOOK PROD DU BOT ADMIN.
// Pour le rebrancher après ta session de dev :
//   curl -X POST "https://api.telegram.org/bot<TOKEN>/setWebhook" \
//     -H "Content-Type: application/json" \
//     -d '{"url":"https://formulaire-le-laboratoire.netlify.app/api/telegram","secret_token":"LaboSecret2026Marseille"}'
//
// Usage : NODE_TLS_REJECT_UNAUTHORIZED=0 node scripts/admin-poll.mjs
import fs from "node:fs"

const BASE = process.env.BASE_URL ?? "http://localhost:3000"
const env = fs.readFileSync(new URL("../.env.local", import.meta.url), "utf8")
const TOKEN = env.match(/^TELEGRAM_BOT_TOKEN=(.+)$/m)?.[1]?.trim()
const SECRET = env.match(/^TELEGRAM_WEBHOOK_SECRET=(.+)$/m)?.[1]?.trim()
if (!TOKEN) throw new Error("TELEGRAM_BOT_TOKEN missing from .env.local")

const TG = `https://api.telegram.org/bot${TOKEN}`
const TARGET = `${BASE}/api/telegram`

// 1) Vire tout webhook existant (sinon getUpdates refuse).
const del = await fetch(`${TG}/deleteWebhook?drop_pending_updates=false`).then((r) => r.json())
console.log("deleteWebhook →", del?.description ?? del?.ok)

// 2) Identité du bot
const me = await fetch(`${TG}/getMe`).then((r) => r.json())
if (!me?.ok) throw new Error(`getMe failed: ${JSON.stringify(me)}`)
console.log(`✓ Connecté à @${me.result.username} (${me.result.first_name})`)
console.log(`→ Forward updates vers ${TARGET}`)
console.log("Ctrl+C pour arrêter\n")

// 3) Long polling — forward chaque update au webhook local (avec le secret pour passer le check)
let offset = 0
while (true) {
  try {
    const res = await fetch(`${TG}/getUpdates?offset=${offset}&timeout=25&allowed_updates=${encodeURIComponent('["message","callback_query"]')}`)
    const data = await res.json()
    if (!data?.ok) {
      console.log("getUpdates error:", data)
      await new Promise((r) => setTimeout(r, 3000))
      continue
    }
    for (const update of data.result ?? []) {
      offset = update.update_id + 1
      const preview = update.callback_query?.data ?? update.message?.text ?? "(autre)"
      console.log(`← update ${update.update_id}: ${preview}`)
      const headers = { "Content-Type": "application/json" }
      if (SECRET) headers["x-telegram-bot-api-secret-token"] = SECRET
      const r = await fetch(TARGET, {
        method: "POST",
        headers,
        body: JSON.stringify(update),
      })
      console.log(`  → ${TARGET} ${r.status}`)
    }
  } catch (err) {
    console.log("loop error:", String(err).slice(0, 200))
    await new Promise((r) => setTimeout(r, 2000))
  }
}
