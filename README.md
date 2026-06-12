# 🧪 Le Laboratoire — Commandes

Plateforme de commande pour **Le Laboratoire** (peptides de recherche, France & Belgique).

Le projet se compose de **deux parties bien distinctes** qui travaillent ensemble :

| | 🌐 **Le site** | 🤖 **Le bot** |
|---|---|---|
| **Où** | racine du repo (Next.js) | dossier [`rpa/`](rpa/) |
| **Rôle** | formulaire de commande, back-office admin, API, bots Telegram | crée + paie les étiquettes Colissimo tout seul |
| **Tourne** | en ligne sur **Cloudflare Workers** (OpenNext) | **en local** (PC / laptop allumé), jamais déployé en ligne |
| **Doc** | ce fichier | [`rpa/README.md`](rpa/README.md) |

---

## 🔄 Comment ça marche, de bout en bout

```
1. Client ──► formulaire du site ──► commande enregistrée (Redis) + envoyée au canal Telegram admin
2. Admin  ──► Accepter ► Payé ► « ⚗️ Générer le bordereau »  (depuis Telegram)
3. Le clic pousse la commande dans une file Redis
4. Le BOT local (veilleur) la récupère ──► crée l'étiquette sur La Poste, paie, la télécharge
5. L'étiquette est postée sur Telegram ; le client suit sa commande (bot Telegram) et reçoit
   son numéro de suivi par email
```

Le **site** ne sait pas créer d'étiquette ; le **bot** s'en charge en local. Ils communiquent via
**Redis** (file d'attente) et l'**API du site** (`/api/rpa/*`).

---

## 🗂️ Structure

```
.
├── app/                     # 🌐 LE SITE (Next.js App Router)
│   ├── page.tsx             #   page d'accueil = formulaire de commande
│   ├── admin/               #   back-office admin
│   ├── actions/             #   logique de commande
│   └── api/                 #   routes API
│       ├── order/           #     création de commande (appelée par le formulaire)
│       ├── relays/          #     recherche de points relais Colissimo
│       ├── telegram/        #     webhook du bot admin
│       ├── telegram-tracking/ #   webhook du bot de suivi client
│       └── rpa/             #     endpoints appelés PAR le bot (shipped, alert)
├── components/              # 🌐 composants du site (formulaire, picker relais, UI)
├── lib/                     # 🌐 Redis, Telegram, commandes, sessions…
├── rpa/                     # 🤖 LE BOT (voir rpa/README.md)
├── scripts/                 # 🛠️ utilitaires de dev (pollers Telegram, etc.)
├── .env.example             # modèle des variables d'environnement
└── wrangler.jsonc           # config du déploiement Cloudflare
```

---

## 🌐 Le site

**Stack** : Next.js (App Router) · Tailwind · Upstash Redis · 2 bots Telegram
(`@labo_commandes_bot` admin, `@labo_num_suivi_bot` suivi client) · déploiement Cloudflare Workers via OpenNext.

### Développer en local

```bash
npm install
npm run dev          # http://localhost:3000
```

### Déployer en prod

⚠️ Nécessite **Node 22+**.

```bash
npm run deploy       # build OpenNext + déploiement Cloudflare
```

→ **https://commande.le-laboratoire.workers.dev**

### Configuration

Copie `.env.example` en `.env.local` et remplis les valeurs (Redis, Telegram, La Poste, etc.).
Les secrets de prod sont dans le dashboard Cloudflare (mêmes clés).

---

## 🤖 Le bot

Le robot Colissimo vit dans **[`rpa/`](rpa/)** et tourne **en local**. Il crée et paie les
étiquettes automatiquement. Toute la doc (installation, fonctionnement, hébergement 24h/24) est
dans **[`rpa/README.md`](rpa/README.md)**.

---

## 📦 Pourquoi un bot et pas une API ?

Créer des étiquettes via un agrégateur (type Boxtal) demande une **entreprise déclarée (SIRET)**.
Faute de ça, le bot pilote le site grand public de La Poste **comme un humain** — c'est ce qui
permet de tout automatiser sans SIRET.
