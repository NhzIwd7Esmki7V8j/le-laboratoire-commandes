// POST /api/admin/logout — déconnexion du back-office web (efface le cookie de session).
import { clearCookieHeader } from "@/lib/admin-session"

export async function POST() {
  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { "Content-Type": "application/json", "Set-Cookie": clearCookieHeader() },
  })
}
