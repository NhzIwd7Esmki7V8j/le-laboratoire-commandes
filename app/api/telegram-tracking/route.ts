// Webhook du BOT DE SUIVI CLIENT (@labo_num_suivi_bot) — séparé du bot admin.
// Quand un client démarre ce bot via « Recevoir mon suivi » (/start CMD_xxx),
// on lie son chat à la commande pour lui envoyer son suivi à l'expédition.
import { getOrder, updateOrder } from "@/lib/orders"
import { tg } from "@/lib/telegram"

const SECRET = process.env.TELEGRAM_TRACKING_WEBHOOK_SECRET
const TRACKING_TOKEN = process.env.TELEGRAM_TRACKING_BOT_TOKEN

export async function POST(req: Request) {
  if (SECRET && req.headers.get("x-telegram-bot-api-secret-token") !== SECRET) {
    return new Response("forbidden", { status: 403 })
  }

  let update: any
  try {
    update = await req.json()
  } catch {
    return new Response("bad json", { status: 400 })
  }

  const msg = update?.message
  if (msg && typeof msg.text === "string" && msg.text.startsWith("/start")) {
    const chatId = msg.chat?.id
    const ref = String(msg.text).split(/\s+/)[1]?.trim()
    try {
      if (chatId && ref) {
        const order = await getOrder(ref)
        if (order) {
          await updateOrder(ref, { customerChatId: chatId })
          await tg(
            "sendMessage",
            {
              chat_id: chatId,
              text: `✅ C'est noté ! Tu recevras ton numéro de suivi ici dès que ta commande ${ref} sera expédiée. 📦`,
            },
            TRACKING_TOKEN,
          )
        } else {
          await tg(
            "sendMessage",
            { chat_id: chatId, text: "Commande introuvable — vérifie ton lien de suivi." },
            TRACKING_TOKEN,
          )
        }
      } else if (chatId) {
        await tg(
          "sendMessage",
          {
            chat_id: chatId,
            text: "👋 Bonjour ! Passe ta commande sur notre site, puis clique « Recevoir mon suivi » pour être notifié ici dès l'expédition.",
          },
          TRACKING_TOKEN,
        )
      }
    } catch {
      /* on ne bloque jamais le webhook */
    }
  }

  return new Response("ok", { status: 200 })
}

export async function GET() {
  return new Response("Tracking bot webhook OK")
}
