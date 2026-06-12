// Validation cryptographique du `initData` envoyé par la Telegram Mini App.
// Réf : https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app
//
// C'est la SEULE protection d'accès à l'API admin : chaque route admin doit appeler
// requireAdmin(req) et refuser si invalide ou si l'utilisateur n'est pas l'admin.
import crypto from "crypto"

export function validateInitData(
  initData: string,
  botToken: string,
): { valid: boolean; userId?: number } {
  if (!initData || !botToken) return { valid: false }

  const params = new URLSearchParams(initData)
  const hash = params.get("hash")
  if (!hash) return { valid: false }
  params.delete("hash")

  // data_check_string : "key=value" triés par ordre alphabétique, joints par \n.
  const dataCheckString = [...params.entries()]
    .map(([k, v]) => `${k}=${v}`)
    .sort()
    .join("\n")

  // secret_key = HMAC_SHA256(key="WebAppData", data=botToken)
  const secret = crypto.createHmac("sha256", "WebAppData").update(botToken).digest()
  const computed = crypto.createHmac("sha256", secret).update(dataCheckString).digest("hex")

  const a = Buffer.from(computed, "hex")
  const b = Buffer.from(hash, "hex")
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return { valid: false }

  let userId: number | undefined
  try {
    const user = JSON.parse(params.get("user") ?? "{}")
    if (typeof user?.id === "number") userId = user.id
  } catch {
    /* user absent ou malformé */
  }
  return { valid: true, userId }
}

export type AdminCheck =
  | { ok: true; userId?: number }
  | { ok: false; status: number; message: string }

// Garde à appeler en tête de CHAQUE route admin.
// L'init data est transmis par la Mini App dans le header X-Telegram-Init-Data.
export function requireAdmin(req: Request): AdminCheck {
  // Auth via l'initData signé envoyé par la Mini App Telegram (seule interface admin).
  const initData = req.headers.get("X-Telegram-Init-Data") ?? ""
  const botToken = process.env.TELEGRAM_BOT_TOKEN ?? ""
  const { valid, userId } = validateInitData(initData, botToken)
  if (valid) {
    const adminId = process.env.ADMIN_TELEGRAM_USER_ID
    if (adminId && String(userId) !== String(adminId)) {
      return { ok: false, status: 403, message: "accès réservé à l'admin" }
    }
    return { ok: true, userId }
  }

  return { ok: false, status: 401, message: "non autorisé" }
}
