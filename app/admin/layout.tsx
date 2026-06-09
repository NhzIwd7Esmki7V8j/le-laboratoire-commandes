// Layout minimal du back-office web (pas de nav/footer du site, pas de SDK Telegram).
import type { Metadata } from "next"
import { Toaster } from "sonner"

export const metadata: Metadata = {
  title: "Le Laboratoire — Back-office",
  robots: { index: false, follow: false },
}

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      {children}
      <Toaster position="top-center" richColors />
    </>
  )
}
