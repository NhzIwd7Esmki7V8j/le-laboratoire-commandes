#!/bin/bash
# Démarre l'écran déporté (Xvfb + VNC + noVNC) puis lance la commande passée (veilleur par défaut).
set -e

# 1) Écran virtuel sur :99
Xvfb :99 -screen 0 1440x960x24 -ac +extension RANDR >/tmp/xvfb.log 2>&1 &
sleep 2

# 2) Gestionnaire de fenêtres léger (affichage correct du navigateur)
fluxbox >/dev/null 2>&1 &

# 3) Partage VNC de l'écran :99. Mot de passe OBLIGATOIRE en prod (sinon n'importe qui
#    sur Internet pourrait piloter le navigateur connecté à La Poste + la carte !).
if [ -n "$VNC_PASSWORD" ]; then
  x11vnc -storepasswd "$VNC_PASSWORD" /tmp/vncpass >/dev/null 2>&1
  x11vnc -display :99 -forever -shared -rfbauth /tmp/vncpass -bg -o /tmp/x11vnc.log
else
  echo "⚠️  VNC_PASSWORD non défini : écran déporté SANS mot de passe (à éviter en prod)."
  x11vnc -display :99 -forever -shared -nopw -bg -o /tmp/x11vnc.log
fi

# 4) noVNC (accès navigateur web) sur le port 6080 → http://<IP>:6080/vnc.html
websockify --web=/usr/share/novnc 6080 localhost:5900 >/tmp/novnc.log 2>&1 &
sleep 1
echo "🌐 Écran déporté prêt : http://<IP_DU_SERVEUR>:6080/vnc.html"

# 5) Commande applicative (veilleur par défaut, ou « node login.mjs » pour la connexion initiale)
cd /app/rpa
exec "$@"
