"use client"

import { Button } from "@/components/ui/button"
import { MessageCircle, Send } from "lucide-react"
import { ContactModal } from "./contact-modal"

export function HeroSection() {
  return (
    <section className="relative py-20 md:py-28 overflow-hidden">
      {/* Background gradient */}
      <div className="absolute inset-0 bg-gradient-to-br from-violet-100 via-white to-fuchsia-100" />
      <div className="absolute top-0 right-0 w-96 h-96 bg-violet-600/10 rounded-full blur-3xl" />
      <div className="absolute bottom-0 left-0 w-96 h-96 bg-fuchsia-600/10 rounded-full blur-3xl" />
      
      <div className="container relative mx-auto px-4 max-w-6xl">
        <div className="flex flex-col lg:flex-row items-center gap-12">
          {/* Text Content */}
          <div className="flex-1 text-center lg:text-left">
            <div className="inline-flex items-center gap-2 bg-violet-100 text-violet-700 px-4 py-2 rounded-full text-sm font-medium mb-6">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-violet-500/60 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-violet-600"></span>
              </span>
              Communauté active sur Telegram
            </div>
            
            <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold text-slate-900 mb-6 text-balance">
              Bienvenue au{" "}
              <span className="bg-gradient-to-r from-violet-600 to-fuchsia-600 bg-clip-text text-transparent">
                Laboratoire
              </span>
            </h1>
            
            <p className="text-lg md:text-xl text-slate-600 mb-8 max-w-2xl mx-auto lg:mx-0 leading-relaxed text-pretty">
              Votre source de confiance pour les peptides de recherche de haute qualité. 
              Nous sommes une communauté passionnée, transparente et toujours à votre écoute. 
              Des questions ? Nous répondons à tous vos messages en DM.
            </p>

            <div className="flex flex-col sm:flex-row gap-4 justify-center lg:justify-start">
              <ContactModal>
                <Button 
                  size="lg" 
                  className="gap-2 bg-sky-500 hover:bg-sky-600 text-white shadow-lg shadow-sky-500/25 transition-all duration-300 hover:scale-105 hover:shadow-xl hover:shadow-sky-500/30"
                >
                  <Send className="h-5 w-5" />
                  Rejoindre la communauté
                </Button>
              </ContactModal>
              <ContactModal>
                <Button 
                  size="lg" 
                  variant="outline" 
                  className="gap-2 border-violet-300 text-violet-700 hover:bg-violet-100 hover:border-violet-400 transition-all duration-300"
                >
                  <MessageCircle className="h-5 w-5" />
                  Nous contacter
                </Button>
              </ContactModal>
            </div>

            {/* Trust indicators */}
            <div className="mt-10 flex flex-wrap items-center gap-6 justify-center lg:justify-start text-sm text-slate-500">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-emerald-500" />
                <span>Réponse rapide en DM</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-emerald-500" />
                <span>Communauté bienveillante</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-emerald-500" />
                <span>Support personnalisé</span>
              </div>
            </div>
          </div>

          {/* Logo/Image */}
          <div className="flex-shrink-0">
            <div className="relative">
              <div className="absolute inset-0 bg-gradient-to-br from-violet-600 to-fuchsia-600 rounded-3xl blur-2xl opacity-20 scale-110" />
              <img 
                src="https://hebbkx1anhila5yf.public.blob.vercel-storage.com/image-dgQoszYy7rINAHw29yFn4Bg1R7SBDN.png" 
                alt="Le Laboratoire - Peptides de recherche" 
                className="relative w-72 md:w-96 h-auto drop-shadow-2xl"
              />
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
