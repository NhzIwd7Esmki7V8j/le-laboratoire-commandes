// Session admin pour le back-office WEB (cookie signé HttpOnly).
// Distinct de l'auth Telegram (initData) : ici on protège l'accès navigateur par mot de passe.
// Le cookie contient une date d'expiration signée en HMAC-SHA256 (impossible à forger).
import crypto from "crypto"

// Secret de signature : dédié si fourni, sinon on réutilise le secret webhook (déjà présent).
const SECRET = process.env.ADMIN_SESSION_SECRET || process.env.TELEGRAM_WEBHOOK_SECRET || ""

export const SESSION_COOKIE = "admin_session"
export const SESSION_MAX_AGE = 7 * 24 * 60 * 60 // 7 jours (secondes)

function sign(data: string): string {
  return crypto.createHmac("sha256", SECRET).update(data).digest("hex")
}

// Crée un jeton de session "exp.signature".
export function createSession(): string {
  const exp = Date.now() + SESSION_MAX_AGE * 1000
  return `${exp}.${sign(String(exp))}`
}

// Vérifie un jeton (signature valide + non expiré).
export function verifySession(token: string | undefined | null): boolean {
  if (!token || !SECRET) return false
  const dot = token.indexOf(".")
  if (dot === -1) return false
  const exp = token.slice(0, dot)
  const sig = token.slice(dot + 1)
  const expected = sign(exp)
  if (sig.length !== expected.length) return false
  if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return false
  return Number(exp) > Date.now()
}

// Construit l'en-tête Set-Cookie (Secure uniquement en prod, pour marcher sur http://localhost).
export function sessionCookieHeader(token: string): string {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : ""
  return `${SESSION_COOKIE}=${token}; HttpOnly; Path=/; Max-Age=${SESSION_MAX_AGE}; SameSite=Lax${secure}`
}

export function clearCookieHeader(): string {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : ""
  return `${SESSION_COOKIE}=; HttpOnly; Path=/; Max-Age=0; SameSite=Lax${secure}`
}

export function parseCookies(header: string | null): Record<string, string> {
  const out: Record<string, string> = {}
  if (!header) return out
  for (const part of header.split(";")) {
    const i = part.indexOf("=")
    if (i === -1) continue
    out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim())
  }
  return out
}
