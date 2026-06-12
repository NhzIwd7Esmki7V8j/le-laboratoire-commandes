// Seed de commandes de TEST dans Redis (pour tester le robot sans passer commande).
// Usage : node seed.mjs        (crée/écrase les commandes de test)
//         node seed.mjs clean  (supprime les commandes de test)
import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { dirname, join } from "node:path"

const __dirname = dirname(fileURLToPath(import.meta.url))
const txt = readFileSync(join(__dirname, "..", ".env.local"), "utf8")
const env = {}
for (const line of txt.split(/\r?\n/)) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/)
  if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, "")
}
const URL = env.UPSTASH_REDIS_REST_URL
const TOKEN = env.UPSTASH_REDIS_REST_TOKEN

async function cmd(arr) {
  const res = await fetch(URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify(arr),
  })
  return res.json()
}

const now = Date.now()
// Panel de scénarios pour l'AUDIT (types de clients variés).
const ORDERS = [
  // 1. Domicile FR — adresse propre et cohérente
  { ref: "AUD_01", prenom: "Jean", nom: "Dupont", telephone: "0612345678",
    deliveryMode: "domicile", pays: "FR", adresse: "10 rue de Rivoli", codePostal: "75001", ville: "Paris",
    message: "[AUDIT] domicile FR cohérent" },
  // 2. Domicile FR — autre ville
  { ref: "AUD_02", prenom: "Sophie", nom: "Durand", telephone: "0623456789",
    deliveryMode: "domicile", pays: "FR", adresse: "3 rue de la République", codePostal: "13001", ville: "Marseille",
    message: "[AUDIT] domicile FR Marseille" },
  // 3. Domicile FR — CP/ville INCOHÉRENTS (déclenche la modale de suggestions)
  { ref: "AUD_03", prenom: "Paul", nom: "Bernard", telephone: "0634567890",
    deliveryMode: "domicile", pays: "FR", adresse: "1 rue de la Paix", codePostal: "31000", ville: "Paris",
    message: "[AUDIT] domicile FR CP/ville incohérents" },
  // 4. Domicile FR — accents, tirets, apostrophe dans le nom
  { ref: "AUD_04", prenom: "Hélène-Léa", nom: "O'Brien Dübois", telephone: "0645678901",
    deliveryMode: "domicile", pays: "FR", adresse: "12 rue de l'Égalité", codePostal: "69001", ville: "Lyon",
    message: "[AUDIT] domicile FR caractères spéciaux" },
  // 5. Point relais FR — Toulouse (vrai relais Colissimo, ≠ le plus proche → teste le match EXACT)
  { ref: "AUD_05", prenom: "Luc", nom: "Petit", telephone: "0656789012",
    deliveryMode: "relais", pays: "FR", adresse: "20 rue d'Alsace Lorraine", codePostal: "31000", ville: "Toulouse",
    pointRelais: "RETIK 243 MULTISERVICES — 14 B RUE MAURICE FONVIEILLE, 31000 TOULOUSE", relayId: "434507",
    message: "[AUDIT] point relais FR Toulouse (exact)" },
  // 6. Point relais FR — Paris (vrai relais Colissimo ≠ le plus proche)
  { ref: "AUD_06", prenom: "Nadia", nom: "Lefevre", telephone: "0667890123",
    deliveryMode: "relais", pays: "FR", adresse: "8 rue de Rennes", codePostal: "75006", ville: "Paris",
    pointRelais: "ZAFA TECH — 18 RUE LITTRE, 75006 PARIS", relayId: "998464",
    message: "[AUDIT] point relais FR Paris (exact)" },
  // 7. Domicile BE — international (Bruxelles)
  { ref: "AUD_07", prenom: "Tom", nom: "Janssens", telephone: "0470123456",
    deliveryMode: "domicile", pays: "BE", adresse: "Rue Neuve 1", codePostal: "1000", ville: "Bruxelles",
    message: "[AUDIT] domicile Belgique" },
  // 8. Domicile FR — petite ville
  { ref: "AUD_08", prenom: "Yann", nom: "Le Goff", telephone: "0678901234",
    deliveryMode: "domicile", pays: "FR", adresse: "2 rue de l'Église", codePostal: "56000", ville: "Vannes",
    message: "[AUDIT] domicile FR petite ville" },
  // 9. Domicile FR — adresse longue (numéro + bis + voie composée)
  { ref: "AUD_09", prenom: "Inès", nom: "Da Silva", telephone: "0689012345",
    deliveryMode: "domicile", pays: "FR", adresse: "15 bis avenue Jean Médecin", codePostal: "06000", ville: "Nice",
    message: "[AUDIT] domicile FR adresse longue" },
  // 10. Point relais FR — Lyon (vrai relais Colissimo ≠ le plus proche)
  { ref: "AUD_10", prenom: "Karim", nom: "Benali", telephone: "0611223344",
    deliveryMode: "relais", pays: "FR", adresse: "1 rue de la République", codePostal: "69002", ville: "Lyon",
    pointRelais: "AZ ALIMENTATION — 3 RUE SAINTE CATHERINE, 69001 LYON", relayId: "LYON01",
    message: "[AUDIT] point relais FR Lyon (exact)" },
  // 11. Point relais FR — Lille (vrai relais Colissimo)
  { ref: "AUD_11", prenom: "Emma", nom: "Dubois", telephone: "0601234567",
    deliveryMode: "relais", pays: "FR", adresse: "1 rue Nationale", codePostal: "59000", ville: "Lille",
    pointRelais: "MES DARONS — 1 RUE DES BOUCHERS, 59800 LILLE", relayId: "LILLE01",
    message: "[AUDIT] point relais FR Lille (exact)" },
  // 12. Domicile BE — autre ville (Liège)
  { ref: "AUD_12", prenom: "Lucas", nom: "Maes", telephone: "0471234567",
    deliveryMode: "domicile", pays: "BE", adresse: "Rue Léopold 10", codePostal: "4000", ville: "Liège",
    message: "[AUDIT] domicile Belgique Liège" },
  // 13. Domicile FR — Strasbourg (variété géographique)
  { ref: "AUD_13", prenom: "Chloé", nom: "Martin", telephone: "0612345670",
    deliveryMode: "domicile", pays: "FR", adresse: "8 rue du Dôme", codePostal: "67000", ville: "Strasbourg",
    message: "[AUDIT] domicile FR Strasbourg" },
].map((o, i) => ({ ...o, status: "paid", createdAt: now - i * 1000 }))

const clean = process.argv.includes("clean")
for (const o of ORDERS) {
  if (clean) {
    await cmd(["DEL", `order:${o.ref}`])
    await cmd(["ZREM", "orders", o.ref])
    console.log("🗑️  supprimé", o.ref)
  } else {
    await cmd(["SET", `order:${o.ref}`, JSON.stringify(o)])
    await cmd(["ZADD", "orders", String(o.createdAt), o.ref])
    console.log("✅ seedé", o.ref, "—", o.deliveryMode, o.pays)
  }
}
console.log(clean ? "Nettoyage terminé." : "Seed terminé.")
