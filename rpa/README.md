# 🤖 Robot Colissimo (RPA local, sans SIRET)

Crée **et paie** automatiquement les étiquettes **Colissimo en ligne** à partir d'une commande,
en pilotant un vrai navigateur Chromium comme le ferait un humain — **sans SIRET ni API pro**.

Tourne **en local** (ton PC / un laptop allumé 24h/24), à côté du site. Le site reste hébergé
sur Cloudflare ; ce dossier, lui, ne se déploie pas en ligne (voir [`../README.md`](../README.md)).

---

## Comment ça s'enchaîne

```
Commande client ──► canal Telegram admin ──► clic « ⚗️ Générer le bordereau »
        │                                              │
        │                                  (webhook pousse la réf dans Redis)
        ▼                                              ▼
   site (Cloudflare)                         veilleur local (watch.mjs)
                                                       │  lance le robot
                                                       ▼
                                           colissimo.mjs : remplit le parcours,
                                           paie, télécharge l'étiquette, la poste
                                           sur Telegram + notifie le client.
```

## Les fichiers

| Fichier | Rôle |
|---|---|
| **`colissimo.mjs`** | Le robot. Remplit tout le parcours Colissimo, paie, télécharge l'étiquette, la poste sur Telegram. |
| **`watch.mjs`** | Le **veilleur** : écoute la file Redis (`robot:queue`) et lance le robot à chaque commande à générer. Doit tourner en permanence. |
| **`Veilleur.bat`** | Double-clic pour lancer le veilleur. |
| **`Colissimo.bat`** | Double-clic pour lancer le robot sur une commande précise. |
| **`clear-cart.mjs`** | Vide le panier Colissimo (sécurité / maintenance). |
| **`login.mjs`** | Connexion initiale à La Poste (+ mémorisation de la carte) — utile sur une nouvelle machine. |
| **`recover-cmd.mjs` / `recover-by-name.mjs`** | Récupèrent une étiquette déjà payée depuis l'espace client (filet de secours). |
| **`run-audit.mjs` / `seed.mjs`** | Harnais de test : enchaîne des scénarios `AUD_*` jusqu'à la page de paiement, **sans payer**. |
| **`Dockerfile`, `docker-compose.yml`, `entrypoint.sh`, `DEPLOY-VPS.md`** | Kit pour héberger le bot 24h/24 sur un serveur (optionnel — voir le guide). |

## Pré-requis

- **Node 22+** (Chromium est fourni par Playwright, rien d'autre à installer).
- Un fichier **`../.env.local`** à la racine du projet (voir [`../.env.example`](../.env.example)) avec au minimum :
  `UPSTASH_REDIS_REST_URL`/`_TOKEN`, `LAPOSTE_EMAIL`/`_PASSWORD`, `LAPOSTE_CVV`, `RPA_AUTOPAY=1`,
  `RPA_API_KEY`, `APP_URL`.

## Installation (une fois)

```powershell
$env:Path = "C:\Users\Isaac\node22;" + $env:Path
cd C:\Users\Isaac\Desktop\pep\rpa
npm install
```

Puis lance le robot une première fois et **connecte-toi à La Poste** (la session est mémorisée
dans `.chromium/`, gitignoré) + **mémorise la carte** dans ton compte.

## Au quotidien

Garde le **veilleur** ouvert (double-clic `Veilleur.bat`, ou `npm run watch`). Ensuite tout se
fait depuis Telegram : tu cliques « ⚗️ Générer le bordereau » → le robot fait le reste tout seul.

Pour relancer manuellement une commande :

```powershell
npm run colissimo -- CMD_123456
```

## Fiabilité

- **Reconnexion auto** si la session La Poste expire (réessaie + vérifie).
- **Garde anti-surfacturation** (n'achète jamais plusieurs colis par erreur) et **anti-double-paiement**.
- **Vérifie le nom + le code postal** sur l'étiquette avant de l'envoyer.
- **Garde-fou anti-blocage** : ne reste jamais coincé, et **alerte sur Telegram** au moindre souci
  (« génère le bordereau manuellement pour CMD_… »).

> ⚠️ Par nature, ça dépend du site de La Poste : s'ils changent leur interface, un sélecteur peut
> être à ajuster dans `colissimo.mjs`. Le robot prévient (alerte Telegram) plutôt que d'échouer en silence.

## Héberger le bot 24h/24

Pour qu'il tourne sans ton PC : voir **[`DEPLOY-VPS.md`](DEPLOY-VPS.md)** (option serveur Docker),
ou simplement laisser un **laptop branché en permanence** avec le veilleur lancé.
