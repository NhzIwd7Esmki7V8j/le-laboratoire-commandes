// Autorisation Google (à lancer UNE seule fois) : ouvre une page d'autorisation, récupère
// le jeton et l'enregistre dans google-token.json. Ensuite le robot dépose tout seul sur le Drive.
//   Usage : node google-auth.mjs
import { google } from "googleapis"
import { readFileSync, writeFileSync } from "node:fs"
import { createServer } from "node:http"
import { spawn } from "node:child_process"
import { fileURLToPath } from "node:url"
import { dirname, join } from "node:path"

const __dirname = dirname(fileURLToPath(import.meta.url))
const creds = JSON.parse(readFileSync(join(__dirname, "google-oauth.json"), "utf8")).installed
const SCOPES = [
  "https://www.googleapis.com/auth/drive", // déposer les PDF
  "https://www.googleapis.com/auth/spreadsheets", // écrire dans le Sheet récap
]
const PORT = 53682 // port loopback (boucle locale) fixe

const oauth2 = new google.auth.OAuth2(creds.client_id, creds.client_secret, `http://localhost:${PORT}`)
const authUrl = oauth2.generateAuthUrl({ access_type: "offline", prompt: "consent", scope: SCOPES })

const server = createServer(async (req, res) => {
  try {
    const code = new URL(req.url, `http://localhost:${PORT}`).searchParams.get("code")
    if (!code) {
      res.end("En attente du code…")
      return
    }
    const { tokens } = await oauth2.getToken(code)
    writeFileSync(join(__dirname, "google-token.json"), JSON.stringify(tokens, null, 2))
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" })
    res.end("<h2>✅ Autorisation réussie !</h2><p>Tu peux fermer cet onglet et revenir au terminal.</p>")
    console.log("\n✅ Jeton enregistré dans google-token.json — connexion Google prête !")
    server.close()
    process.exit(0)
  } catch (e) {
    res.end("Erreur : " + e.message)
    console.error("\n❌ Échec :", e.message)
    process.exit(1)
  }
})

server.listen(PORT, () => {
  console.log("\n🔐 AUTORISATION GOOGLE — connecte-toi avec le BON Gmail.\n")
  console.log("Si le navigateur ne s'ouvre pas tout seul, ouvre ce lien :\n\n  " + authUrl + "\n")
  console.log('⚠️ Écran « Google n\'a pas validé cette application » → clique "Paramètres avancés"')
  console.log('   puis "Accéder à labo (non sécurisé)" (c\'est TON app, c\'est normal et sans risque).\n')
  console.log("En attente de l'autorisation…")
  // Ouvre le navigateur par défaut (Windows).
  spawn("cmd", ["/c", "start", "", authUrl], { detached: true, stdio: "ignore" }).on("error", () => {})
})
