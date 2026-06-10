// Wipe all orders via the admin API (cleans Redis + Telegram messages + Boxtal shipments).
// Hits the local dev server. Reuses ADMIN_PASSWORD from .env.local.
import fs from "node:fs"

const BASE = process.env.BASE_URL ?? "http://localhost:3000"

const env = fs.readFileSync(new URL("../.env.local", import.meta.url), "utf8")
const ADMIN_PASSWORD = env.match(/^ADMIN_PASSWORD=(.+)$/m)?.[1]?.trim()
if (!ADMIN_PASSWORD) throw new Error("ADMIN_PASSWORD missing from .env.local")

// Login → extract session cookie from Set-Cookie
const loginRes = await fetch(`${BASE}/api/admin/login`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ password: ADMIN_PASSWORD }),
})
if (!loginRes.ok) throw new Error(`Login failed: ${loginRes.status}`)
const cookie = loginRes.headers.getSetCookie?.()?.join("; ") ??
  loginRes.headers.get("set-cookie") ?? ""
if (!cookie) throw new Error("No session cookie returned by /api/admin/login")
console.log("✓ Logged in")

// List orders
const listRes = await fetch(`${BASE}/api/admin/orders`, { headers: { cookie } })
if (!listRes.ok) throw new Error(`List failed: ${listRes.status}`)
const { orders = [] } = await listRes.json()
console.log(`Found ${orders.length} order(s)`)

// Delete each
let ok = 0, ko = 0
for (const o of orders) {
  const res = await fetch(`${BASE}/api/admin/orders/${o.ref}`, {
    method: "DELETE",
    headers: { cookie },
  })
  if (res.ok) { ok++; console.log(`  ✓ ${o.ref}`) }
  else { ko++; console.log(`  ✗ ${o.ref} → ${res.status} ${await res.text().catch(()=>"")}`) }
}
console.log(`\nDone — deleted ${ok}/${orders.length}${ko ? `, ${ko} failed` : ""}`)
