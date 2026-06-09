"use client"

import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { 
  Send, 
  Tag, 
  BookOpen, 
  MessageSquare, 
  Package, 
  Star, 
  BarChart3, 
  Megaphone,
  Users,
  CheckCircle2
} from "lucide-react"
import { ContactModal } from "./contact-modal"

const channels = [
  {
    name: "Catalogue des prix",
    icon: Tag,
    color: "bg-emerald-500",
    description: "Tous nos produits et tarifs"
  },
  {
    name: "Encyclopédie des peptides",
    icon: BookOpen,
    color: "bg-amber-500",
    description: "Documentation complète"
  },
  {
    name: "Général",
    icon: MessageSquare,
    color: "bg-slate-500",
    description: "Discussions générales"
  },
  {
    name: "Commandes reçues",
    icon: Package,
    color: "bg-violet-600",
    description: "Suivi des livraisons"
  },
  {
    name: "Vos retours d'expérience",
    icon: Star,
    color: "bg-pink-500",
    description: "Avis de la communauté"
  },
  {
    name: "Sondage",
    icon: BarChart3,
    color: "bg-cyan-500",
    description: "Participez aux votes"
  },
  {
    name: "Annonces",
    icon: Megaphone,
    color: "bg-red-500",
    description: "Nouveautés et informations"
  },
]

export function CommunitySection() {
  return (
    <section id="communaute" className="py-20 bg-white">
      <div className="container mx-auto px-4 max-w-6xl">
        {/* Header */}
        <div className="text-center mb-12">
          <div className="inline-flex items-center gap-2 bg-sky-100 text-sky-600 px-4 py-2 rounded-full text-sm font-medium mb-4">
            <Users className="h-4 w-4" />
            Notre Communauté
          </div>
          <h2 className="text-3xl md:text-4xl font-bold text-slate-900 mb-4 text-balance">
            Rejoignez notre communauté Telegram
          </h2>
          <p className="text-lg text-slate-600 max-w-2xl mx-auto text-pretty">
            Un espace organisé où vous trouverez toutes les informations dont vous avez besoin. 
            Notre équipe répond à vos questions en DM et reste toujours à votre écoute.
          </p>
        </div>

        {/* Features */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-12">
          <Card className="border-violet-200 bg-gradient-to-br from-violet-50 to-white hover:shadow-lg hover:-translate-y-1 transition-all duration-300">
            <CardContent className="pt-6">
              <div className="w-12 h-12 rounded-xl bg-violet-100 flex items-center justify-center mb-4">
                <MessageSquare className="h-6 w-6 text-violet-600" />
              </div>
              <h3 className="font-semibold text-slate-900 mb-2">Réponse en DM</h3>
              <p className="text-sm text-slate-600">
                Une question ? Envoyez-nous un message privé, nous répondons rapidement à toutes vos demandes.
              </p>
            </CardContent>
          </Card>
          
          <Card className="border-fuchsia-200 bg-gradient-to-br from-fuchsia-50 to-white hover:shadow-lg hover:-translate-y-1 transition-all duration-300">
            <CardContent className="pt-6">
              <div className="w-12 h-12 rounded-xl bg-fuchsia-100 flex items-center justify-center mb-4">
                <CheckCircle2 className="h-6 w-6 text-fuchsia-600" />
              </div>
              <h3 className="font-semibold text-slate-900 mb-2">Transparence totale</h3>
              <p className="text-sm text-slate-600">
                Consultez les retours d&apos;expérience de notre communauté et les preuves de livraisons.
              </p>
            </CardContent>
          </Card>
          
          <Card className="border-sky-200 bg-gradient-to-br from-sky-50 to-white hover:shadow-lg hover:-translate-y-1 transition-all duration-300">
            <CardContent className="pt-6">
              <div className="w-12 h-12 rounded-xl bg-sky-100 flex items-center justify-center mb-4">
                <Users className="h-6 w-6 text-sky-600" />
              </div>
              <h3 className="font-semibold text-slate-900 mb-2">Communauté active</h3>
              <p className="text-sm text-slate-600">
                Échangez avec d&apos;autres passionnés et bénéficiez de conseils personnalisés.
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Telegram Channels Preview */}
        <Card className="border-0 bg-gradient-to-br from-slate-900 to-slate-800 text-white overflow-hidden shadow-2xl">
          <CardContent className="p-6 md:p-8">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-12 h-12 rounded-full bg-sky-500 flex items-center justify-center">
                <Send className="h-6 w-6 text-white" />
              </div>
              <div>
                <h3 className="font-bold text-lg">LE LABORATOIRE</h3>
                <p className="text-sm text-slate-400">Groupe Telegram officiel</p>
              </div>
            </div>

            {/* Channels list */}
            <div className="space-y-2 mb-6">
              {channels.map((channel) => {
                const IconComponent = channel.icon
                return (
                  <div 
                    key={channel.name}
                    className="flex items-center gap-3 p-3 rounded-lg bg-white/5 hover:bg-white/10 transition-all duration-300 cursor-pointer"
                  >
                    <div className={`w-8 h-8 rounded-lg ${channel.color} flex items-center justify-center flex-shrink-0`}>
                      <IconComponent className="h-4 w-4 text-white" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm truncate">{channel.name}</p>
                      <p className="text-xs text-slate-400 truncate">{channel.description}</p>
                    </div>
                  </div>
                )
              })}
            </div>

            <ContactModal>
              <Button 
                size="lg" 
                className="w-full gap-2 bg-sky-500 hover:bg-sky-600 text-white transition-all duration-300 hover:scale-[1.02] hover:shadow-lg"
              >
                <Send className="h-5 w-5" />
                Rejoindre le groupe Telegram
              </Button>
            </ContactModal>
          </CardContent>
        </Card>
      </div>
    </section>
  )
}
