// Client Upstash Redis (REST) — utilisé côté serveur uniquement.
// Stocke les commandes pour pouvoir reconstruire un payload Boxtal et alimenter la Mini App.
// Variables d'env (configurées sur Netlify + .env.local en local) :
//   UPSTASH_REDIS_REST_URL, UPSTASH_REDIS_REST_TOKEN
import { Redis } from "@upstash/redis"

export const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL!,
  token: process.env.UPSTASH_REDIS_REST_TOKEN!,
})
