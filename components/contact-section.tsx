"use client"

import { Button } from "@/components/ui/button"
import { Send, MessageCircle, Clock, Shield, User } from "lucide-react"
import { ContactModal } from "./contact-modal"

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

export function ContactSection() {
  return (
    <section id="contact" className="py-20 bg-gradient-to-br from-violet-600 to-fuchsia-600">
      <div className="container mx-auto px-4 max-w-4xl text-center">
        <div className="inline-flex items-center gap-2 bg-white/20 text-white px-4 py-2 rounded-full text-sm font-medium mb-6 backdrop-blur-sm">
          <MessageCircle className="h-4 w-4" />
          Contact direct
        </div>

        <h2 className="text-3xl md:text-4xl font-bold text-white mb-4 text-balance">
          Une question ? Contactez l&apos;un de nos admins !
        </h2>

        <p className="text-lg text-white/90 mb-8 max-w-2xl mx-auto text-pretty">
          Notre équipe d&apos;<span className="font-semibold text-white">administrateurs</span> est disponible pour répondre à toutes vos questions.
          Écrivez à celui que vous voulez, ils sont tous à votre écoute.
        </p>

        {/* Contact features */}
        <div className="flex flex-wrap justify-center gap-6 mb-10 text-white/80 text-sm">
          <div className="flex items-center gap-2">
            <Clock className="h-4 w-4" />
            <span>Réponse rapide</span>
          </div>
          <div className="flex items-center gap-2">
            <Shield className="h-4 w-4" />
            <span>Confidentiel</span>
          </div>
          <div className="flex items-center gap-2">
            <MessageCircle className="h-4 w-4" />
            <span>Support personnalisé</span>
          </div>
        </div>

        {/* Admin cards - mis bien en évidence */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-5 mb-8 max-w-3xl mx-auto">
          {admins.map((admin) => (
            <a
              key={admin.handle}
              href={admin.url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex flex-col items-center gap-3 p-6 rounded-2xl bg-white hover:shadow-2xl hover:-translate-y-1 transition-all duration-300 group"
            >
              <div className="w-16 h-16 rounded-full bg-gradient-to-br from-violet-500 to-fuchsia-500 flex items-center justify-center">
                <User className="h-8 w-8 text-white" />
              </div>
              <div className="text-center">
                <p className="font-bold text-violet-600 text-lg font-mono">{admin.handle}</p>
                <p className="text-sm text-slate-500">Administrateur Le Labo</p>
              </div>
              <span className="inline-flex items-center gap-2 mt-1 px-4 py-2 rounded-full bg-sky-500 text-white text-sm font-medium group-hover:bg-sky-600 transition-colors">
                <Send className="h-4 w-4" />
                Contacter
              </span>
            </a>
          ))}
        </div>

        {/* Info message */}
        <div className="bg-white/10 backdrop-blur-sm border border-white/20 rounded-lg p-4 mb-8 max-w-lg mx-auto">
          <p className="text-sm text-white/90">
            Un lien pour rejoindre notre groupe Telegram vous sera directement envoyé lorsque vous aurez pris contact avec l&apos;un de nos admins.
          </p>
        </div>

        {/* CTA Button */}
        <div className="flex flex-col items-center gap-4">
          <ContactModal>
            <Button
              size="lg"
              className="gap-3 bg-sky-500 hover:bg-sky-600 text-white shadow-xl shadow-black/20 text-lg px-8 py-6 h-auto transition-all duration-300 hover:scale-105 hover:shadow-2xl"
            >
              <Send className="h-5 w-5" />
              Voir nos admins Telegram
            </Button>
          </ContactModal>
        </div>
      </div>
    </section>
  )
}
