// Modèle de données « commande » + helpers de stockage (Upstash Redis).
// Une commande vit sous la clé `order:{ref}` (ex: order:CMD_123456) et sa ref est
// indexée dans le sorted set `orders` (score = createdAt) pour lister par date.
import { redis } from "./redis"

export type DeliveryMode = "domicile" | "relais"
export type Country = "FR" | "BE"

// Cycle de vie d'une commande :
//   pending          → nouvelle, en attente de validation admin
//   accepted         → acceptée, en attente de paiement ("À payer")
//   paid             → paiement reçu, prête à expédier ("À expédier")
//   generating       → génération du bordereau Boxtal en cours (lock)
//   label_generated  → bordereau généré (tracking + PDF dispo)
//   cancelled        → commande / bordereau annulé(e)
export type OrderStatus =
  | "pending"
  | "accepted"
  | "paid"
  | "generating"
  | "label_generated"
  | "cancelled"

export interface Order {
  ref: string
  status: OrderStatus
  createdAt: number // epoch ms

  // Client
  nom: string
  prenom: string
  telephone: string
  message?: string

  // Livraison
  deliveryMode: DeliveryMode
  pays: Country
  // domicile
  adresse?: string
  codePostal?: string
  ville?: string
  // point relais
  pointRelais?: string
  relayId?: string

  // Telegram (pour pouvoir éditer le message depuis le webhook ET la Mini App)
  telegramChatId?: number
  telegramMessageId?: number
  // Telegram du CLIENT (rempli s'il démarre le bot via le lien « Recevoir mon suivi »)
  customerChatId?: number

  // Boxtal (renseigné une fois le bordereau généré)
  shipmentId?: string
  trackingNumber?: string
  labelUrl?: string
}

const orderKey = (ref: string) => `order:${ref}`
const INDEX_KEY = "orders"

// Crée / écrase une commande et l'ajoute à l'index trié par date.
export async function saveOrder(order: Order): Promise<void> {
  await redis.set(orderKey(order.ref), order)
  await redis.zadd(INDEX_KEY, { score: order.createdAt, member: order.ref })
}

export async function getOrder(ref: string): Promise<Order | null> {
  return (await redis.get<Order>(orderKey(ref))) ?? null
}

// Met à jour partiellement une commande existante. Renvoie la version à jour (ou null si absente).
export async function updateOrder(
  ref: string,
  patch: Partial<Order>,
): Promise<Order | null> {
  const current = await getOrder(ref)
  if (!current) return null
  const next: Order = { ...current, ...patch }
  await redis.set(orderKey(ref), next)
  return next
}

// Supprime définitivement une commande (objet + entrée d'index).
export async function deleteOrder(ref: string): Promise<void> {
  await redis.del(orderKey(ref))
  await redis.zrem(INDEX_KEY, ref)
}

// Liste les commandes (plus récentes en premier), filtrable par statut.
export async function listOrders(status?: OrderStatus): Promise<Order[]> {
  const refs = await redis.zrange<string[]>(INDEX_KEY, 0, -1, { rev: true })
  if (!refs.length) return []
  const orders = await redis.mget<Order[]>(...refs.map(orderKey))
  const found = orders.filter((o): o is Order => !!o)
  return status ? found.filter((o) => o.status === status) : found
}
