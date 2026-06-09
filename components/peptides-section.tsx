"use client"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardTitle } from "@/components/ui/card"
import { 
  Syringe,
  FlaskConical,
  TestTube,
  ChevronRight,
  Check,
  AlertTriangle,
  Send,
  Sparkles
} from "lucide-react"
import { ContactModal } from "./contact-modal"

const featuredPeptides = [
  {
    name: "DSIP",
    subtitle: "Delta Sleep Inducing Peptide - Tout savoir sur le DSIP",
    icon: FlaskConical,
    color: "from-indigo-500 to-purple-600",
    bgColor: "from-indigo-50 to-purple-50",
    borderColor: "border-indigo-300",
    benefits: [
      "Amélioration de la qualité du sommeil",
      "Régulation des cycles circadiens",
      "Réduction du stress et de l'anxiété",
      "Effet neuroprotecteur",
    ],
    sideEffects: [
      "Somnolence diurne possible",
      "Maux de tête légers",
      "Légère baisse de tension",
    ],
    featured: true,
  },
  {
    name: "IGF1-LR3",
    subtitle: "Insulin-like Growth Factor - Tout savoir sur l'IGF1-LR3",
    icon: Syringe,
    color: "from-emerald-500 to-teal-600",
    bgColor: "from-emerald-50 to-teal-50",
    borderColor: "border-emerald-300",
    benefits: [
      "Croissance musculaire accélérée",
      "Récupération améliorée",
      "Augmentation de la synthèse protéique",
      "Réduction de la masse grasse",
    ],
    sideEffects: [
      "Hypoglycémie possible",
      "Douleurs articulaires",
      "Rétention d'eau légère",
    ],
    featured: true,
  },
  {
    name: "BPC-157",
    subtitle: "Body Protection Compound - Tout savoir sur le BPC-157",
    icon: TestTube,
    color: "from-rose-500 to-pink-600",
    bgColor: "from-rose-50 to-pink-50",
    borderColor: "border-rose-300",
    benefits: [
      "Guérison accélérée des tissus",
      "Réparation des tendons et ligaments",
      "Protection gastro-intestinale",
      "Effet anti-inflammatoire",
    ],
    sideEffects: [
      "Légères nausées",
      "Vertiges passagers",
      "Sensibilité au point d'injection",
    ],
    featured: true,
  },
]

const otherPeptides = [
  {
    name: "RETATRUTIDE (RETA)",
    subtitle: "Tout savoir sur la RETA",
    icon: FlaskConical,
    color: "from-violet-500 to-fuchsia-500",
    bgColor: "from-violet-50 to-fuchsia-50",
    borderColor: "border-violet-200",
    benefits: [
      "Perte de poids rapide et efficace",
      "Contrôle de la glycémie",
      "Réduction de l'appétit",
    ],
    sideEffects: [
      "Nausées ou vomissements",
      "Diarrhée, constipation",
      "Fatigue, maux de tête",
    ],
  },
  {
    name: "GHK-Cu",
    subtitle: "Tripeptide de Cuivre - Tout savoir sur le GHK-Cu",
    icon: TestTube,
    color: "from-cyan-500 to-blue-500",
    bgColor: "from-cyan-50 to-blue-50",
    borderColor: "border-cyan-200",
    benefits: [
      "Réparation des tissus et de la peau",
      "Boost de la production de collagène",
      "Amélioration de la qualité de la peau",
    ],
    sideEffects: [
      "Irritations ou rougeurs",
      "Démangeaisons",
      "Sensibilité cutanée",
    ],
  },
  {
    name: "MT2 (Melanotan 2)",
    subtitle: "Tout savoir sur le MT2",
    icon: Syringe,
    color: "from-amber-500 to-orange-500",
    bgColor: "from-amber-50 to-orange-50",
    borderColor: "border-amber-200",
    benefits: [
      "Stimulation de la mélanogenèse",
      "Bronzage accéléré",
      "Protection contre les UV",
    ],
    sideEffects: [
      "Nausées légères",
      "Rougeurs au visage",
      "Fatigue passagère",
    ],
  },
]

function PeptideCard({ peptide, featured = false }: { peptide: typeof featuredPeptides[0], featured?: boolean }) {
  const IconComponent = peptide.icon
  return (
    <Card 
      className={`overflow-hidden border-2 ${peptide.borderColor} hover:shadow-xl transition-all duration-300 hover:-translate-y-1 ${featured ? 'ring-2 ring-violet-400 ring-offset-2' : ''}`}
    >
      {featured && (
        <div className="bg-gradient-to-r from-violet-600 to-fuchsia-600 text-white text-xs font-bold py-1.5 px-4 flex items-center justify-center gap-1.5">
          <Sparkles className="h-3 w-3" />
          NOUVEAU
        </div>
      )}
      <div className={`bg-gradient-to-r ${peptide.bgColor} p-6`}>
        <div className="flex items-center gap-4 mb-4">
          <div className={`w-14 h-14 rounded-2xl bg-gradient-to-br ${peptide.color} flex items-center justify-center flex-shrink-0 shadow-lg`}>
            <IconComponent className="h-7 w-7 text-white" />
          </div>
        </div>
        <CardTitle className="text-xl font-bold text-slate-900 mb-1">
          {peptide.name}
        </CardTitle>
        <p className="text-sm text-slate-500">{peptide.subtitle}</p>
      </div>
      
      <CardContent className="pt-6 space-y-5">
        {/* Benefits */}
        <div>
          <h4 className="font-semibold text-slate-900 mb-3 flex items-center gap-2 text-sm uppercase tracking-wide">
            <div className="w-6 h-6 rounded-full bg-emerald-100 flex items-center justify-center">
              <ChevronRight className="h-3 w-3 text-emerald-600" />
            </div>
            Avantages / Bénéfices
          </h4>
          <ul className="space-y-2">
            {peptide.benefits.map((benefit, index) => (
              <li 
                key={index}
                className="flex items-start gap-2 text-sm text-slate-700"
              >
                <Check className="h-4 w-4 text-emerald-500 flex-shrink-0 mt-0.5" />
                <span>{benefit}</span>
              </li>
            ))}
          </ul>
        </div>

        {/* Side Effects */}
        <div>
          <h4 className="font-semibold text-slate-900 mb-3 flex items-center gap-2 text-sm uppercase tracking-wide">
            <div className="w-6 h-6 rounded-full bg-amber-100 flex items-center justify-center">
              <AlertTriangle className="h-3 w-3 text-amber-600" />
            </div>
            Effets Secondaires
          </h4>
          <ul className="space-y-2">
            {peptide.sideEffects.map((effect, index) => (
              <li 
                key={index}
                className="flex items-start gap-2 text-sm text-slate-600"
              >
                <Check className="h-4 w-4 text-amber-500 flex-shrink-0 mt-0.5" />
                <span>{effect}</span>
              </li>
            ))}
          </ul>
        </div>
      </CardContent>
    </Card>
  )
}

export function PeptidesSection() {
  return (
    <section id="peptides" className="py-20 bg-gradient-to-br from-slate-50 to-white">
      <div className="container mx-auto px-4 max-w-7xl">
        {/* Header */}
        <div className="text-center mb-12">
          <div className="inline-flex items-center gap-2 bg-violet-100 text-violet-700 px-4 py-2 rounded-full text-sm font-medium mb-4">
            <FlaskConical className="h-4 w-4" />
            Nos Peptides
          </div>
          <h2 className="text-3xl md:text-4xl font-bold text-slate-900 mb-4 text-balance">
            Découvrez nos peptides de recherche
          </h2>
          <p className="text-lg text-slate-600 max-w-2xl mx-auto text-pretty">
            Informations détaillées sur nos principaux peptides : avantages, bénéfices et effets secondaires.
          </p>
        </div>

        {/* Featured Peptides - Highlighted */}
        <div className="mb-16">
          <div className="flex items-center justify-center gap-3 mb-8">
            <div className="h-px bg-gradient-to-r from-transparent via-violet-300 to-transparent flex-1 max-w-32" />
            <h3 className="text-lg font-bold text-violet-700 flex items-center gap-2">
              <Sparkles className="h-5 w-5" />
              Peptides en vedette
            </h3>
            <div className="h-px bg-gradient-to-r from-transparent via-violet-300 to-transparent flex-1 max-w-32" />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {featuredPeptides.map((peptide) => (
              <PeptideCard key={peptide.name} peptide={peptide} featured />
            ))}
          </div>
        </div>

        {/* Other Peptides */}
        <div>
          <div className="flex items-center justify-center gap-3 mb-8">
            <div className="h-px bg-gradient-to-r from-transparent via-slate-300 to-transparent flex-1 max-w-32" />
            <h3 className="text-lg font-semibold text-slate-600">
              Autres peptides disponibles
            </h3>
            <div className="h-px bg-gradient-to-r from-transparent via-slate-300 to-transparent flex-1 max-w-32" />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {otherPeptides.map((peptide) => (
              <PeptideCard key={peptide.name} peptide={peptide} />
            ))}
          </div>
        </div>

        {/* CTA */}
        <div className="mt-16 text-center">
          <div className="bg-gradient-to-r from-violet-100 to-fuchsia-100 rounded-2xl p-8 border border-violet-200">
            <h3 className="text-xl font-bold text-slate-900 mb-2">
              Envie d&apos;en savoir plus ?
            </h3>
            <p className="text-slate-600 mb-6">
              Rejoignez notre communauté Telegram pour accéder à toutes nos ressources et échanger avec des passionnés.
            </p>
            <ContactModal>
              <Button 
                size="lg" 
                className="gap-2 bg-sky-500 hover:bg-sky-600 text-white shadow-lg shadow-sky-500/25 transition-all duration-300 hover:scale-105"
              >
                <Send className="h-5 w-5" />
                Rejoignez-nous sur Telegram
              </Button>
            </ContactModal>
          </div>
        </div>
      </div>
    </section>
  )
}
