import { OrderSection } from "@/components/order-section"
import { ContactModal } from "@/components/contact-modal"
import { Send, Lock } from "lucide-react"
import { Button } from "@/components/ui/button"

export default function Home() {
  return (
    <main className="min-h-screen flex flex-col">
      {/* Header - Sticky avec backdrop blur */}
      <header className="bg-white/80 backdrop-blur-md border-b border-slate-200 sticky top-0 z-50">
        <div className="container mx-auto px-4 max-w-6xl">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-3">
              <img
                src="https://hebbkx1anhila5yf.public.blob.vercel-storage.com/image-dgQoszYy7rINAHw29yFn4Bg1R7SBDN.png"
                alt="Le Laboratoire Logo"
                className="h-10 w-auto"
              />
              <span className="font-bold text-lg text-slate-900">LE LABORATOIRE</span>
            </div>

            <ContactModal>
              <Button
                size="sm"
                className="gap-2 bg-sky-500 hover:bg-sky-600 text-white transition-all duration-300 hover:scale-105 hover:shadow-lg hover:shadow-sky-500/25"
              >
                <Send className="h-4 w-4" />
                Telegram
              </Button>
            </ContactModal>
          </div>
        </div>
      </header>

      {/* Order Section */}
      <div className="flex-1">
        <OrderSection />
      </div>

      {/* Footer */}
      <footer className="bg-slate-900 text-white py-12">
        <div className="container mx-auto px-4 max-w-6xl">
          <div className="flex flex-col md:flex-row items-center justify-between gap-6">
            <div className="flex items-center gap-3">
              <img
                src="https://hebbkx1anhila5yf.public.blob.vercel-storage.com/image-dgQoszYy7rINAHw29yFn4Bg1R7SBDN.png"
                alt="Le Laboratoire Logo"
                className="h-10 w-auto"
              />
              <div>
                <span className="font-bold text-lg">LE LABORATOIRE</span>
                <p className="text-sm text-slate-400">Peptides de recherche</p>
              </div>
            </div>

            <ContactModal>
              <button
                type="button"
                className="inline-flex items-center gap-2 text-sm text-slate-300 hover:text-sky-400 transition-colors font-mono"
              >
                <Send className="h-4 w-4" />
                Contacter nos admins Telegram
              </button>
            </ContactModal>
          </div>

          <div className="mt-8 pt-8 border-t border-slate-800">
            <div className="flex flex-col md:flex-row items-center justify-between gap-4">
              <div className="flex items-center gap-4">
                <p className="text-xs text-slate-500">
                  © {new Date().getFullYear()} Le Laboratoire. Tous droits réservés.
                </p>
                <a
                  href="/admin"
                  className="inline-flex items-center gap-1 text-xs text-slate-600 transition-colors hover:text-violet-400"
                >
                  <Lock className="h-3 w-3" />
                  Admin
                </a>
              </div>
              <p className="text-[10px] text-slate-600 text-center md:text-right max-w-lg leading-relaxed">
                Produits destinés uniquement à la recherche en laboratoire. Non destinés à l&apos;usage humain ou animal
                direct. Toute utilisation doit être conforme aux réglementations locales en vigueur.
              </p>
            </div>
          </div>
        </div>
      </footer>
    </main>
  )
}
