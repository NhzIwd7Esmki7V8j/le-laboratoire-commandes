"use client"

import { useEffect, useState } from "react"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogDescription,
} from "@/components/ui/dialog"
import { Send, User, Link2, MessageCircle } from "lucide-react"

interface ContactModalProps {
  children: React.ReactNode
}

const admins = [
  {
    name: "Le Labo",
    handle: "@Lelabonbz",
    url: "https://t.me/Lelabonbz",
  },
  {
    name: "Le Labo",
    handle: "@lelabo09",
    url: "https://t.me/lelabo09",
  },
  {
    name: "Le Labo",
    handle: "@moderateur1labo",
    url: "https://t.me/moderateur1labo",
  },
]

export function ContactModal({ children }: ContactModalProps) {
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])
  // Avant l'hydratation : on rend uniquement le déclencheur (le bouton), sans le Dialog
  // Radix, pour éviter tout mismatch d'ID serveur/client qui cassait l'interactivité mobile.
  if (!mounted) return <>{children}</>

  return (
    <Dialog>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-xl">
            <MessageCircle className="h-5 w-5 text-violet-600" />
            Contactez l&apos;un de nos admins
          </DialogTitle>
          <DialogDescription className="text-slate-600">
            Plusieurs administrateurs sont disponibles pour vous répondre sur Telegram. Choisissez celui que vous voulez ci-dessous.
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-1 gap-3 py-2">
          {admins.map((admin) => (
            <a
              key={admin.handle}
              href={admin.url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-4 p-4 rounded-xl border border-violet-200 bg-gradient-to-r from-violet-50 to-fuchsia-50 hover:shadow-lg hover:-translate-y-0.5 transition-all duration-300 group"
            >
              <div className="w-12 h-12 rounded-full bg-gradient-to-br from-violet-500 to-fuchsia-500 flex items-center justify-center flex-shrink-0">
                <User className="h-6 w-6 text-white" />
              </div>
              <div className="flex-1">
                <p className="font-semibold text-slate-900 font-mono">{admin.handle}</p>
                <p className="text-sm text-slate-500">Administrateur Le Labo</p>
              </div>
              <Send className="h-5 w-5 text-violet-500 group-hover:translate-x-1 transition-transform duration-300" />
            </a>
          ))}
        </div>

        {/* Info message */}
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
          <div className="flex items-start gap-3">
            <Link2 className="h-5 w-5 text-amber-600 flex-shrink-0 mt-0.5" />
            <p className="text-sm text-amber-800">
              <span className="font-semibold">Important :</span>               Un lien pour rejoindre notre groupe Telegram vous sera directement envoyé lorsque vous aurez pris contact avec l&apos;un de nos admins.
            </p>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
