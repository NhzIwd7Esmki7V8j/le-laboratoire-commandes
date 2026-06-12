// Action « métier » partagée par le webhook Telegram ET la Mini App : annulation/suppression
// d'une commande. (La génération de bordereau se fait via le robot RPA + la commande /colis,
// plus par ici — l'ancien circuit Boxtal a été retiré.)
import { deleteOrder, type Order } from "./orders"
import { tg, refreshCustomerMessage } from "./telegram"

export type Answer = (text?: string, alert?: boolean) => Promise<unknown>

// Annuler = SUPPRIMER : efface le message Telegram de la commande, passe le suivi client en
// « annulé » (avant de perdre les IDs), puis supprime la commande de la base.
export async function cancelAndDelete(order: Order, answer?: Answer): Promise<void> {
  try {
    if (order.telegramChatId && order.telegramMessageId) {
      await tg("deleteMessage", { chat_id: order.telegramChatId, message_id: order.telegramMessageId })
    }
    await refreshCustomerMessage({ ...order, status: "cancelled" })
    await deleteOrder(order.ref)
    await answer?.("Commande supprimée 🗑️", true)
  } catch (err) {
    console.log("[order-actions] suppression échouée:", err)
    await answer?.("Échec de la suppression. Réessayez.", true)
    throw err
  }
}
