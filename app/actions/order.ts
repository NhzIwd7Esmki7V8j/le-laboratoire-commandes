"use server"

import { saveOrder, updateOrder, type Order, type Country, type DeliveryMode } from "@/lib/orders"
import { renderOrderMessage, orderButtons, tgJson } from "@/lib/telegram"

interface OrderInput {
  nom: string
  prenom: string
  telephone: string
  email?: string
  pays?: Country
  deliveryMode?: DeliveryMode
  // Livraison à domicile
  adresse?: string
  // Livraison en point relais (+ domicile : CP/ville)
  codePostal?: string
  ville?: string
  pointRelais?: string
  relayId?: string
  message?: string
}

export async function submitOrder(data: OrderInput) {
  const nom = (data.nom ?? "").trim()
  const prenom = (data.prenom ?? "").trim()
  const telephone = (data.telephone ?? "").trim()
  const email = (data.email ?? "").trim().toLowerCase()
  const pays: Country = data.pays === "BE" ? "BE" : "FR"
  const mode: DeliveryMode = data.deliveryMode === "relais" ? "relais" : "domicile"
  const message = (data.message ?? "").trim().slice(0, 1000)

  const adresse = (data.adresse ?? "").trim()
  const codePostal = (data.codePostal ?? "").trim()
  const ville = (data.ville ?? "").trim()
  const pointRelais = (data.pointRelais ?? "").trim()
  const relayId = (data.relayId ?? "").trim()

  const nameRegex = /^[A-Za-zÀ-ÿ' -]+$/
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  // Code postal selon le pays : FR = 5 chiffres, BE = 4 chiffres
  const cpRegex = pays === "BE" ? /^\d{4}$/ : /^\d{5}$/
  // Téléphone normalisé (sans espaces/ponctuation, +33/+32 → 0) puis validé strictement :
  // FR = 10 chiffres commençant par 0 (06/07 mobile recommandé) ; BE = 9-10 chiffres.
  const telDigits = telephone.replace(/[^\d+]/g, "").replace(/^\+33/, "0").replace(/^\+32/, "0")
  const phoneOk = pays === "BE" ? /^0\d{8,9}$/.test(telDigits) : /^0[1-9]\d{8}$/.test(telDigits)

  // Validation côté serveur (ne jamais faire confiance au client)
  if (!nom || !prenom || !telephone) {
    return { success: false, error: "Le nom, le prénom et le téléphone sont obligatoires." }
  }
  if (!nameRegex.test(nom) || !nameRegex.test(prenom)) {
    return { success: false, error: "Le nom et le prénom ne doivent contenir que des lettres." }
  }
  if (!phoneOk) {
    return {
      success: false,
      error:
        pays === "BE"
          ? "Numéro de téléphone belge invalide (ex : 0470 12 34 56)."
          : "Numéro de téléphone invalide (10 chiffres, ex : 06 12 34 56 78).",
    }
  }
  if (email && !emailRegex.test(email)) {
    return { success: false, error: "L'adresse email saisie n'est pas valide." }
  }
  if (message.length < 3) {
    return {
      success: false,
      error: "Merci de préciser votre commande (produits, quantités et prix).",
    }
  }

  if (mode === "domicile") {
    if (adresse.length < 5) {
      return { success: false, error: "L'adresse (n° et rue) est trop courte." }
    }
    if (!cpRegex.test(codePostal)) {
      const n = pays === "BE" ? "4" : "5"
      return { success: false, error: `Le code postal est invalide (${n} chiffres).` }
    }
    if (ville.length < 2) {
      return { success: false, error: "La ville est invalide." }
    }
  } else {
    // Point Retrait Colissimo : seul le relais est requis (le picker fournit déjà CP/ville).
    if (pointRelais.length < 3) {
      return { success: false, error: "Le Point Retrait Colissimo est obligatoire." }
    }
  }

  const token = process.env.TELEGRAM_BOT_TOKEN
  const chatId = process.env.TELEGRAM_CHAT_ID
  if (!token || !chatId) {
    console.log("[order] TELEGRAM_BOT_TOKEN ou TELEGRAM_CHAT_ID manquant")
    return {
      success: false,
      error: "Le service de commande n'est pas encore configuré. Réessayez plus tard.",
    }
  }

  // Numéro de commande : CMD_ + 6 chiffres au hasard
  const ref = `CMD_${Math.floor(100000 + Math.random() * 900000)}`

  const order: Order = {
    ref,
    status: "pending",
    createdAt: Date.now(),
    nom,
    prenom,
    telephone,
    email: email || undefined,
    message: message || undefined,
    deliveryMode: mode,
    pays,
    adresse: mode === "domicile" ? adresse : undefined,
    codePostal: codePostal || undefined,
    ville: ville || undefined,
    pointRelais: mode === "relais" ? pointRelais : undefined,
    relayId: relayId || undefined,
  }

  try {
    // 1) Stockage d'abord : la commande doit exister avant tout traitement Telegram/Boxtal.
    await saveOrder(order)
  } catch (err) {
    console.log("[order] Erreur stockage Redis:", err)
    return { success: false, error: "Le service de commande est momentanément indisponible." }
  }

  try {
    // 2) Envoi du message stylé dans le canal Commandes.
    const res = await tgJson("sendMessage", {
      chat_id: chatId,
      text: renderOrderMessage(order),
      parse_mode: "HTML",
      reply_markup: orderButtons(order),
    })

    if (!res.ok) {
      console.log("[order] Erreur Telegram:", res.description)
      return { success: false, error: "Échec de l'envoi. Réessayez plus tard." }
    }

    // 3) On garde le message_id pour pouvoir éditer ce message plus tard
    //    (webhook + Mini App) sans avoir à re-parser le texte.
    const messageId: number | undefined = res.result?.message_id
    if (messageId) {
      await updateOrder(ref, { telegramChatId: Number(chatId), telegramMessageId: messageId })
    }

    return { success: true, orderRef: ref }
  } catch (err) {
    console.log("[order] Erreur réseau Telegram:", err)
    return { success: false, error: "Erreur réseau. Réessayez plus tard." }
  }
}
