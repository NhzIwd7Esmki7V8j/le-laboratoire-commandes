# Robot Colissimo (RPA local, sans SIRET)

Aide à créer une étiquette **Colissimo en ligne** en auto-remplissant le formulaire
à partir d'une commande. Tourne **en local**, dans une fenêtre **Edge** visible.
Il **ne paie jamais** à ta place : tu valides le paiement par carte toi-même.

> ⚠️ Fragile par nature : si La Poste change son site, un champ peut ne plus se
> remplir. Tape `i` sur la page concernée pour lister les champs, puis ajuste les
> sélecteurs dans `fillForm()` de `colissimo.mjs`.

## Installation (une seule fois)

Edge est déjà installé sur Windows 11 → aucun navigateur à télécharger.

```powershell
$env:Path="C:\Users\Isaac\node20\node-v20.18.1-win-x64;"+$env:Path
cd C:\Users\Isaac\Desktop\pep\rpa
npm install
```

## Utilisation

```powershell
$env:Path="C:\Users\Isaac\node20\node-v20.18.1-win-x64;"+$env:Path
cd C:\Users\Isaac\Desktop\pep\rpa
npm run colissimo -- CMD_123456     # remplace par la vraie réf de commande
```

La fenêtre Edge s'ouvre sur Colissimo en ligne. **Connecte-toi** (la session est
mémorisée dans `.userdata` pour les fois suivantes), navigue jusqu'à l'écran de
saisie du **destinataire**, puis dans ce terminal :

| Touche | Action |
|---|---|
| `f` | remplir le formulaire de la page courante avec la commande |
| `i` | lister les champs visibles de la page (debug sélecteurs) |
| `o` | réafficher les infos de la commande |
| `q` | quitter |

Une fois l'étiquette créée et payée, récupère le **n° de suivi** et saisis-le
côté Telegram / back-office pour notifier le client.
