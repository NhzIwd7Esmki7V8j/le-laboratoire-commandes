// Bridge dev local : long-polling Telegram → POST /api/telegram-tracking.
// Permet de tester le bot de suivi (@labo_num_suivi_bot) sans webhook public.
//
// Usage :
//   NODE_TLS_REJECT_UNAUTHORIZED=0 node scripts/tracking-poll.mjs
//
// Le script :
//   1. lit TELEGRAM_TRACKING_BOT_TOKEN dans .env.local
//   2. delete tout webhook existant (sinon getUpdates refuse)
//   3. boucle getUpdates (long polling 25s) et POST chaque update au serveur local
import fs from "node:fs"

const BASE = process.env.BASE_URL ?? "http://localhost:3000"
const env = fs.readFileSync(new URL("../.env.local", import.meta.url), "utf8")
const TOKEN = env.match(/^TELEGRAM_TRACKING_BOT_TOKEN=(.+)$/m)?.[1]?.trim()
if (!TOKEN) throw new Error("TELEGRAM_TRACKING_BOT_TOKEN missing from .env.local")

const TG = `https://api.telegram.org/bot${TOKEN}`
const TARGET = `${BASE}/api/telegram-tracking`

// 1) Vire tout webhook existant pour pouvoir utiliser getUpdates.
const del = await fetch(`${TG}/deleteWebhook?drop_pending_updates=false`).then((r) => r.json())
console.log("deleteWebhook →", del?.description ?? del?.ok)

// 2) Récupère l'identité du bot pour confirmer qu'on est sur le bon
const me = await fetch(`${TG}/getMe`).then((r) => r.json())
if (!me?.ok) throw new Error(`getMe failed: ${JSON.stringify(me)}`)
console.log(`✓ Connecté à @${me.result.username} (${me.result.first_name})`)
console.log(`→ Forward updates vers ${TARGET}`)
console.log("Ctrl+C pour arrêter\n")

// 3) Long polling
let offset = 0
while (true) {
  try {
    const res = await fetch(`${TG}/getUpdates?offset=${offset}&timeout=25`)
    const data = await res.json()
    if (!data?.ok) {
      console.log("getUpdates error:", data)
      await new Promise((r) => setTimeout(r, 3000))
      continue
    }
    for (const update of data.result ?? []) {
      offset = update.update_id + 1
      const preview = update.message?.text ?? update.callback_query?.data ?? "(autre)"
      console.log(`← update ${update.update_id}: ${preview}`)
      const r = await fetch(TARGET, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(update),
      })
      console.log(`  → ${TARGET} ${r.status}`)
    }
  } catch (err) {
    console.log("loop error:", String(err).slice(0, 200))
    await new Promise((r) => setTimeout(r, 2000))
  }
}
