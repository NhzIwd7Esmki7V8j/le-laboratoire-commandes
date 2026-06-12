// Dépôt automatique des étiquettes sur Google Drive + récap dans un Google Sheet.
// Utilise l'autorisation OAuth (google-oauth.json + google-token.json créés par google-auth.mjs).
// Config (../.env.local) : GOOGLE_DRIVE_FOLDER_ID (dossier parent), GOOGLE_SHEET_ID (Sheet récap).
// Si rien n'est configuré → no-op silencieux (le robot continue normalement).
import { google } from "googleapis"
import { readFileSync, existsSync, createReadStream } from "node:fs"
import { fileURLToPath } from "node:url"
import { dirname, join } from "node:path"

const __dirname = dirname(fileURLToPath(import.meta.url))
const OAUTH = join(__dirname, "google-oauth.json")
const TOKEN = join(__dirname, "google-token.json")

function env(key) {
  try {
    const txt = readFileSync(join(__dirname, "..", ".env.local"), "utf8")
    for (const l of txt.split(/\r?\n/)) {
      const m = l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/)
      if (m && m[1] === key) return m[2].replace(/^["']|["']$/g, "")
    }
  } catch {
    /* pas de .env.local */
  }
  return ""
}

function authClient() {
  if (!existsSync(OAUTH) || !existsSync(TOKEN)) return null
  const creds = JSON.parse(readFileSync(OAUTH, "utf8")).installed
  const token = JSON.parse(readFileSync(TOKEN, "utf8"))
  const auth = new google.auth.OAuth2(creds.client_id, creds.client_secret)
  auth.setCredentials(token) // refresh_token inclus → googleapis renouvelle l'accès tout seul
  return auth
}

// Trouve (ou crée) un sous-dossier daté « AAAA-MM-JJ » sous le dossier parent.
async function ensureDatedFolder(drive, parentId, name) {
  const q = `name='${name}' and '${parentId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`
  const list = await drive.files.list({ q, fields: "files(id)", spaces: "drive" })
  if (list.data.files?.length) return list.data.files[0].id
  const created = await drive.files.create({
    requestBody: { name, mimeType: "application/vnd.google-apps.folder", parents: [parentId] },
    fields: "id",
  })
  return created.data.id
}

// Dépose le PDF d'une commande dans le dossier du jour + ajoute une ligne au Sheet récap.
// Renvoie { ok, link } ou { skipped } si non configuré. Ne lève jamais (best-effort).
export async function uploadLabelToDrive(order, pdfPath, trackingNumber) {
  try {
    const FOLDER = env("GOOGLE_DRIVE_FOLDER_ID")
    const SHEET = env("GOOGLE_SHEET_ID")
    const auth = authClient()
    if (!auth || !FOLDER) return { skipped: true }
    if (!existsSync(pdfPath)) return { skipped: true }

    const drive = google.drive({ version: "v3", auth })
    const now = new Date()
    const day = now.toLocaleDateString("fr-CA", { timeZone: "Europe/Paris" }) // AAAA-MM-JJ
    const month = day.slice(0, 7) // AAAA-MM
    // Arborescence : <dossier parent> / AAAA-MM / AAAA-MM-JJ / fichier.pdf
    const monthFolder = await ensureDatedFolder(drive, FOLDER, month)
    const dayFolder = await ensureDatedFolder(drive, monthFolder, day)

    const who = `${order.prenom ?? ""} ${order.nom ?? ""}`.replace(/\s+/g, " ").trim()
    const safe = (s) => String(s).replace(/[\\/:*?"<>|]/g, "-")
    const fileName = safe(`${order.ref} - ${who}${trackingNumber ? " - " + trackingNumber : ""}.pdf`)

    const file = await drive.files.create({
      requestBody: { name: fileName, parents: [dayFolder] },
      media: { mimeType: "application/pdf", body: createReadStream(pdfPath) },
      fields: "id, webViewLink",
    })
    const link = file.data.webViewLink || ""

    // Ligne du Sheet récap : Date | Commande | Client | Pays | Livraison | Suivi | Lien PDF
    if (SHEET) {
      const sheets = google.sheets({ version: "v4", auth })
      const when = now.toLocaleString("fr-FR", { timeZone: "Europe/Paris" })
      const mode = order.deliveryMode === "relais" ? "Point relais" : "Domicile"
      await sheets.spreadsheets.values
        .append({
          spreadsheetId: SHEET,
          range: "A1",
          valueInputOption: "USER_ENTERED",
          requestBody: {
            values: [[when, order.ref, who, order.pays ?? "", mode, trackingNumber || "", link]],
          },
        })
        .catch((e) => console.log("  ⚠️ Sheet récap : " + (e?.message ?? e)))
    }

    console.log(`  ☁️ Drive : ${fileName} déposé (${day}).`)
    return { ok: true, link }
  } catch (e) {
    console.log("  ⚠️ Dépôt Drive échoué (best-effort) : " + (e?.message ?? e))
    return { ok: false, error: String(e?.message ?? e) }
  }
}
