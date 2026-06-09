// Layout MINIMAL de la Telegram Mini App — volontairement séparé du site principal
// (pas de nav ni footer). Charge le SDK Telegram WebApp + le Toaster (sonner).
import type { Metadata } from "next"
import Script from "next/script"
import { Toaster } from "sonner"

export const metadata: Metadata = {
  title: "Le Laboratoire — Commandes",
  // Pas d'indexation de l'espace admin par les moteurs.
  robots: { index: false, follow: false },
}

export default function BotAppLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <Script src="https://telegram.org/js/telegram-web-app.js" strategy="afterInteractive" />
      {children}
      <Toaster position="top-center" richColors />
    </>
  )
}
