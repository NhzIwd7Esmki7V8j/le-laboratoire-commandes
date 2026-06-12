# Image du robot Colissimo + veilleur, avec écran déporté (noVNC) pour valider la 3-D Secure.
# Base officielle Playwright : Chromium + toutes les dépendances système déjà incluses,
# version alignée sur celle du package (1.60.0).
FROM mcr.microsoft.com/playwright:v1.60.0-jammy

# Écran virtuel (Xvfb) + partage VNC (x11vnc) + accès web (noVNC/websockify) + gestionnaire
# de fenêtres léger (fluxbox) pour afficher correctement le navigateur.
RUN apt-get update && apt-get install -y --no-install-recommends \
      xvfb x11vnc fluxbox novnc websockify \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app/rpa

# Dépendances Node du robot (les navigateurs sont déjà dans l'image → pas de re-téléchargement).
COPY rpa/package.json ./package.json
ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1
RUN npm install --omit=dev

# Code du robot + script de démarrage.
COPY rpa/*.mjs ./
COPY rpa/entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

ENV DISPLAY=:99
# Chromium tourne en root dans le conteneur → --no-sandbox requis (géré par le code).
ENV RPA_NO_SANDBOX=1
EXPOSE 6080
ENTRYPOINT ["/entrypoint.sh"]
# Par défaut : le veilleur. (Pour la connexion initiale : override avec « node login.mjs ».)
CMD ["node", "watch.mjs"]
