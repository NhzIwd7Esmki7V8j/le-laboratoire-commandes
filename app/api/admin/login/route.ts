// POST /api/admin/login — connexion au back-office web par mot de passe.
// Renvoie un cookie de session signé (HttpOnly) si le mot de passe est correct.
import crypto from "crypto"
import { createSession, sessionCookieHeader } from "@/lib/admin-session"

// Comparaison à temps constant (évite les attaques par mesure de temps).
function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a)
  const bb = Buffer.from(b)
  if (ab.length !== bb.length) return false
  return crypto.timingSafeEqual(ab, bb)
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}))
  const password = String(body?.password ?? "")
  const expected = process.env.ADMIN_PASSWORD ?? ""

  // Si ADMIN_PASSWORD n'est pas défini, on refuse tout par sécurité.
  if (!expected || !safeEqual(password, expected)) {
    return new Response(JSON.stringify({ ok: false, error: "Mot de passe incorrect" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    })
  }

  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: {
      "Content-Type": "application/json",
      "Set-Cookie": sessionCookieHeader(createSession()),
    },
  })
}
