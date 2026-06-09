// Liste des adresses expéditeur (gérée dans le back-office, stockée en Redis).
// L'admin enregistre ses adresses fixes une fois, puis en choisit une au moment du bordereau.
import { redis } from "./redis"

export interface Sender {
  id: string
  firstname: string
  lastname: string
  company?: string
  street: string
  zipcode: string
  city: string
  country: string // "FR" | "BE"
  phone: string
  email: string
  isDefault?: boolean
}

const KEY = "settings:senders"

export async function listSenders(): Promise<Sender[]> {
  return (await redis.get<Sender[]>(KEY)) ?? []
}

export async function saveSenders(senders: Sender[]): Promise<void> {
  // Garantit qu'au plus une adresse est "par défaut" (la 1re si aucune).
  let seenDefault = false
  const cleaned = senders.map((s) => {
    const isDefault = !!s.isDefault && !seenDefault
    if (isDefault) seenDefault = true
    return { ...s, isDefault }
  })
  if (!seenDefault && cleaned.length) cleaned[0].isDefault = true
  await redis.set(KEY, cleaned)
}

export async function getSender(id: string): Promise<Sender | null> {
  return (await listSenders()).find((s) => s.id === id) ?? null
}

export async function getDefaultSender(): Promise<Sender | null> {
  const list = await listSenders()
  return list.find((s) => s.isDefault) ?? list[0] ?? null
}
