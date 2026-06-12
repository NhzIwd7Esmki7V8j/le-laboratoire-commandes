# Héberger le robot Colissimo sur un VPS (24/7, sans ton PC)

Le robot pilote un **vrai navigateur** connecté à La Poste. On l'héberge donc sur un petit
**serveur toujours allumé (VPS)**, dans un conteneur Docker, avec un **écran déporté** que tu
ouvres depuis ton téléphone (noVNC) pour valider la **3-D Secure** quand la banque la demande.

> ⚠️ Ce qu'on NE peut PAS rendre 100 % automatique : si ta banque exige une validation
> 3-D Secure (SMS/appli) au moment de payer, il faut un humain. La solution ci-dessous te
> permet de le faire **d'un tap depuis ton téléphone**, sans être devant ton PC.

---

## 1. Créer le VPS (5 min)

Prends un petit VPS **Ubuntu 22.04**, ~5 €/mois, 2 Go RAM minimum :
- **Hetzner Cloud** (CX22), **OVH** (VPS), **Contabo**, **DigitalOcean**… au choix.
- Note l'**adresse IP** et le mot de passe / la clé SSH.

Connecte-toi : `ssh root@TON_IP`

## 2. Installer Docker (2 min)

```bash
curl -fsSL https://get.docker.com | sh
```

## 3. Récupérer le code

```bash
# Repo privé → utilise un token GitHub (NhzIwd7Esmki7V8j), ou copie les fichiers à la main.
git clone https://github.com/NhzIwd7Esmki7V8j/le-laboratoire-commandes.git pep
cd pep
```

## 4. Configurer les secrets

```bash
cp .env.example .env.local
nano .env.local      # remplis : UPSTASH_*, LAPOSTE_*, RPA_API_KEY, APP_URL, VNC_PASSWORD…
```

- `RPA_API_KEY` = **exactement** la même valeur que côté site (Cloudflare).
- `RPA_AUTOPAY=1` pour que le robot paie tout seul.
- `VNC_PASSWORD` = un mot de passe solide (c'est la clé de ton écran déporté).

## 5. Connexion initiale à La Poste (1 fois)

Le profil du navigateur est vide au départ : il faut s'y connecter **une fois** et y
**mémoriser la carte**.

```bash
cd rpa
export VNC_PASSWORD="le-mot-de-passe-que-tu-as-mis"
docker compose run --rm --service-ports bot node login.mjs
```

Puis, depuis ton téléphone ou ton PC, ouvre :

```
http://TON_IP:6080/vnc.html      (mot de passe = VNC_PASSWORD)
```

Tu vois le navigateur du serveur. **Connecte-toi à La Poste**, va dans
« Mes moyens de paiement » et **mémorise la carte**. Quand c'est bon, reviens au terminal
et fais **Ctrl+C**. La session est gardée dans un volume Docker (persistante).

## 6. Lancer le robot 24/7

```bash
docker compose up -d --build
```

C'est tout. Le veilleur tourne en continu et lance le robot à chaque clic
« ⚗️ Générer le bordereau » dans Telegram — exactement comme sur ton PC.

- Voir les logs en direct : `docker compose logs -f`
- Redémarrer : `docker compose restart`
- Arrêter : `docker compose down` (le volume `.chromium` et la session sont conservés)

## 7. Valider une 3-D Secure (quand ça arrive)

Quand le robot atteint le paiement et que la banque demande une validation :
1. Tu reçois (comme aujourd'hui) une **alerte Telegram** si ça bloque.
2. Ouvre `http://TON_IP:6080/vnc.html` depuis ton **téléphone**.
3. Tu vois la page de paiement → valide la 3-D Secure → le robot continue tout seul
   (téléchargement de l'étiquette + envoi Telegram).

## 8. Sécurité (important)

Le port **6080** donne accès au navigateur connecté à La Poste + ta carte. À protéger :
- **Option simple** : firewall, n'autorise 6080 que depuis ton IP.
  ```bash
  ufw allow 22/tcp && ufw allow from TON_IP_PERSO to any port 6080 && ufw enable
  ```
- **Option propre** : ferme 6080 au public et passe par un **tunnel SSH** quand tu en as besoin :
  ```bash
  ssh -L 6080:localhost:6080 root@TON_IP
  # puis ouvre http://localhost:6080/vnc.html sur ta machine
  ```
- Garde un **VNC_PASSWORD** fort dans tous les cas.

## 9. Mettre à jour le robot plus tard

```bash
cd pep && git pull && cd rpa && docker compose up -d --build
```

---

### Rappels
- Le site (Next.js) reste hébergé sur **Cloudflare** — on ne touche pas à ça. Ici on n'héberge
  que **le robot + le veilleur**.
- Redis (Upstash) et Telegram sont déjà distants : le serveur n'a que des connexions **sortantes**.
- La même `RPA_API_KEY` doit exister des **deux** côtés (site Cloudflare + ce serveur).
