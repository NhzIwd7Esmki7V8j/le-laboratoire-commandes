// Webhook du BOT DE SUIVI CLIENT (@labo_num_suivi_bot) — séparé du bot admin.
// Le client peut entrer via deep link "/start CMD_xxx" (bouton « Recevoir mon suivi »)
// ou via /start simple puis saisie manuelle de sa référence.
// On lui envoie un message de suivi qui sera ÉDITÉ en place à chaque changement de statut.
import { getOrder, updateOrder } from "@/lib/orders"
import { tg, sendCustomerMessage } from "@/lib/telegram"

const SECRET = process.env.TELEGRAM_TRACKING_WEBHOOK_SECRET
const TRACKING_TOKEN = process.env.TELEGRAM_TRACKING_BOT_TOKEN
const SITE_URL = process.env.SITE_URL ?? "https://commande.le-laboratoire.workers.dev"

// Format des références : CMD_ suivi de chiffres (l'action de soumission génère CMD_XXXXXX)
const REF_REGEX = /\bCMD_\d{4,}\b/i

type InlineKb = { inline_keyboard: { text: string; url?: string }[][] }

// Bouton "Passer commande" qui ouvre le site dans le navigateur du téléphone du client.
const ORDER_BUTTON: InlineKb = {
  inline_keyboard: [[{ text: "🧪 Passer ma commande sur le site", url: SITE_URL }]],
}

// Liaison ref ↔ chat client : envoie le message de suivi, sauvegarde les IDs.
async function linkAndSend(chatId: number, ref: string): Promise<boolean> {
  const order = await getOrder(ref.toUpperCase())
  if (!order) return false
  const messageId = await sendCustomerMessage(order, chatId)
  if (messageId) {
    await updateOrder(order.ref, { customerChatId: chatId, customerMessageId: messageId })
  } else {
    await updateOrder(order.ref, { customerChatId: chatId })
  }
  return true
}

async function send(chatId: number, text: string, reply_markup?: InlineKb): Promise<void> {
  await tg(
    "sendMessage",
    { chat_id: chatId, text, parse_mode: "HTML", reply_markup, disable_web_page_preview: true },
    TRACKING_TOKEN,
  )
}

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
  const chatId = msg?.chat?.id
  const text = typeof msg?.text === "string" ? msg.text.trim() : ""
  if (!chatId || !text) return new Response("ok", { status: 200 })

  try {
    // 1) Deep link /start CMD_xxx (bouton « Recevoir mon suivi » du site)
    if (text.startsWith("/start")) {
      const refFromStart = text.split(/\s+/)[1]?.trim()
      if (refFromStart) {
        const ok = await linkAndSend(chatId, refFromStart)
        if (!ok) {
          await send(
            chatId,
            `❓ Hmm, je ne trouve pas cette commande dans notre système.\n\n` +
              `Tape ton numéro de commande au format <b>CMD_XXXXXX</b>, ou passe une nouvelle commande sur le site 👇`,
            ORDER_BUTTON,
          )
        }
        return new Response("ok", { status: 200 })
      }
      // 2) /start simple → écran d'accueil avec bouton site
      await send(
        chatId,
        `👋 <b>Bienvenue chez Le Laboratoire !</b>\n\n` +
          `Je suis ton assistant de suivi. Voici comment ça marche :\n\n` +
          `1️⃣ Passe ta commande sur notre site (bouton ci-dessous).\n` +
          `2️⃣ Sur l'écran de confirmation, clique sur <b>« Recevoir mon suivi sur Telegram »</b>.\n` +
          `3️⃣ Reviens ici, je t'enverrai en temps réel le statut de ta commande, jusqu'à la livraison 🚚.\n\n` +
          `Tu as déjà un numéro de commande ? Tape-le directement (format <b>CMD_XXXXXX</b>).`,
        ORDER_BUTTON,
      )
      return new Response("ok", { status: 200 })
    }

    // 3) /help — même écran que /start
    if (text === "/help" || text === "/aide") {
      await send(
        chatId,
        `🧪 <b>Le Laboratoire — Bot de suivi</b>\n\n` +
          `Commandes disponibles :\n` +
          `• Tape ton numéro de commande (<b>CMD_XXXXXX</b>) pour recevoir ton suivi\n` +
          `• /start — écran d'accueil\n` +
          `• /help — cette aide\n\n` +
          `Tu n'as pas encore commandé ? 👇`,
        ORDER_BUTTON,
      )
      return new Response("ok", { status: 200 })
    }

    // 4) L'utilisateur tape une ref directement (ex: CMD_123456)
    const match = text.match(REF_REGEX)
    if (match) {
      const ok = await linkAndSend(chatId, match[0])
      if (!ok) {
        await send(
          chatId,
          `❓ Je ne trouve pas la commande <b>${match[0].toUpperCase()}</b> dans notre système.\n\n` +
            `Vérifie que tu as bien copié le numéro depuis l'écran de confirmation, ou passe une nouvelle commande 👇`,
          ORDER_BUTTON,
        )
      }
      return new Response("ok", { status: 200 })
    }

    // 5) Texte libre : message d'aide chaleureux + bouton site
    await send(
      chatId,
      `🤔 Je n'ai pas reconnu un numéro de commande dans ton message.\n\n` +
        `Tape ta référence au format <b>CMD_XXXXXX</b>, ou clique sur le bouton ci-dessous pour passer commande 👇`,
      ORDER_BUTTON,
    )
  } catch {
    /* on ne bloque jamais le webhook */
  }

  return new Response("ok", { status: 200 })
}

export async function GET() {
  return new Response("Tracking bot webhook OK")
}
