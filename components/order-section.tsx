"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import { Card, CardContent } from "@/components/ui/card"
import {
  ShoppingBag,
  User,
  MapPin,
  Phone,
  MessageSquare,
  Send,
  CheckCircle2,
  Loader2,
  ShieldCheck,
  AlertCircle,
  Home,
  Package,
  Clock,
  Globe,
} from "lucide-react"
import { submitOrder } from "@/app/actions/order"
import { ContactModal } from "@/components/contact-modal"
import { RelayPicker, type SelectedRelay } from "@/components/relay-picker"

// Lettres (avec accents), espaces, tirets et apostrophes uniquement
const NAME_REGEX = /^[A-Za-zÀ-ÿ' -]+$/
// Chiffres avec un + optionnel au début, espaces, tirets, points et parenthèses
const PHONE_REGEX = /^\+?[0-9 ().-]{8,20}$/
// Code postal : FR = 5 chiffres, BE = 4 chiffres
const CP_REGEX_FR = /^\d{5}$/
const CP_REGEX_BE = /^\d{4}$/

type Field = "nom" | "prenom" | "adresse" | "telephone" | "codePostal" | "ville" | "pointRelais" | "message"
type DeliveryMode = "domicile" | "relais"
type Country = "FR" | "BE"

const EMPTY_FORM = {
  nom: "",
  prenom: "",
  pays: "FR" as Country,
  adresse: "",
  telephone: "",
  codePostal: "",
  ville: "",
  pointRelais: "",
  relayId: "",
  message: "",
}

export function OrderSection() {
  const [deliveryMode, setDeliveryMode] = useState<DeliveryMode>("domicile")
  const [form, setForm] = useState(EMPTY_FORM)
  const [errors, setErrors] = useState<Partial<Record<Field, string>>>({})
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle")
  const [errorMsg, setErrorMsg] = useState("")
  const [orderRef, setOrderRef] = useState("")

  // Bloque la saisie de caractères interdits selon le champ
  const sanitize = (field: Field, value: string) => {
    if (field === "nom" || field === "prenom") {
      // Retire tout ce qui n'est pas lettre, espace, tiret ou apostrophe
      return value.replace(/[^A-Za-zÀ-ÿ' -]/g, "")
    }
    if (field === "telephone") {
      // Retire tout ce qui n'est pas chiffre, +, espace, tiret, point ou parenthèse
      return value.replace(/[^0-9+ ().-]/g, "")
    }
    if (field === "codePostal") {
      // Chiffres uniquement, longueur max selon le pays (FR 5 / BE 4)
      return value.replace(/[^0-9]/g, "").slice(0, form.pays === "BE" ? 4 : 5)
    }
    return value
  }

  const validateField = (field: Field, value: string): string => {
    const v = value.trim()
    if (!v) return "Ce champ est obligatoire."
    if ((field === "nom" || field === "prenom") && !NAME_REGEX.test(v)) {
      return "Lettres uniquement (pas de chiffres)."
    }
    if (field === "telephone" && !PHONE_REGEX.test(v)) {
      return "Numéro invalide (chiffres uniquement, 8 à 20 caractères)."
    }
    if (field === "adresse" && v.length < 5) {
      return "Adresse trop courte."
    }
    if (field === "codePostal") {
      const cpRegex = form.pays === "BE" ? CP_REGEX_BE : CP_REGEX_FR
      if (!cpRegex.test(v)) {
        return form.pays === "BE" ? "Code postal à 4 chiffres." : "Code postal à 5 chiffres."
      }
    }
    if (field === "ville" && v.length < 2) {
      return "Ville invalide."
    }
    if (field === "pointRelais" && v.length < 3) {
      return "Indiquez le point relais souhaité."
    }
    if (field === "message" && v.length < 3) {
      return "Précisez votre commande (produits, quantités, prix)."
    }
    return ""
  }

  const handleChange = (field: Field) => (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = sanitize(field, e.target.value)
    setForm((prev) => ({ ...prev, [field]: value }))
    // Efface l'erreur dès que l'utilisateur corrige
    if (errors[field]) {
      setErrors((prev) => ({ ...prev, [field]: validateField(field, value) || undefined }))
    }
  }

  const handleBlur = (field: Field) => () => {
    setErrors((prev) => ({ ...prev, [field]: validateField(field, form[field]) || undefined }))
  }

  // Champ "détail commande" : Textarea (event différent des Input).
  const handleMessageChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const value = e.target.value.slice(0, 1000)
    setForm((prev) => ({ ...prev, message: value }))
    if (errors.message) {
      setErrors((prev) => ({ ...prev, message: validateField("message", value) || undefined }))
    }
  }

  // Champs requis selon le mode de livraison choisi
  const requiredFields = (): Field[] =>
    deliveryMode === "domicile"
      ? ["nom", "prenom", "telephone", "adresse", "codePostal", "ville", "message"]
      : ["nom", "prenom", "telephone", "pointRelais", "message"]

  const validateAll = (): boolean => {
    const newErrors: Partial<Record<Field, string>> = {}
    requiredFields().forEach((field) => {
      const err = validateField(field, form[field])
      if (err) newErrors[field] = err
    })
    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  // Change le mode et nettoie les erreurs des champs masqués
  const switchMode = (mode: DeliveryMode) => {
    if (mode === deliveryMode) return
    setDeliveryMode(mode)
    setErrors({})
  }

  // Change le pays : la validation du code postal s'adapte (FR 5 / BE 4)
  // et on vide CP + ville pour forcer une re-saisie cohérente.
  const handleCountryChange = (value: string) => {
    const pays: Country = value === "BE" ? "BE" : "FR"
    setForm((prev) => ({ ...prev, pays, codePostal: "", ville: "" }))
    setErrors((prev) => ({ ...prev, codePostal: undefined, ville: undefined }))
  }

  // Auto-remplissage depuis le widget Mondial Relay
  const handleRelaySelect = (relay: SelectedRelay) => {
    setForm((prev) => ({
      ...prev,
      pointRelais: `${relay.nom} — ${relay.adresse}, ${relay.cp} ${relay.ville}`.trim(),
      relayId: relay.id,
      // Remplit code postal / ville s'ils sont encore vides
      codePostal: prev.codePostal || relay.cp,
      ville: prev.ville || relay.ville,
    }))
    setErrors((prev) => ({
      ...prev,
      pointRelais: undefined,
      codePostal: undefined,
      ville: undefined,
    }))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setErrorMsg("")
    if (!validateAll()) {
      setStatus("idle")
      return
    }
    setStatus("loading")

    try {
      const result = await submitOrder({ ...form, deliveryMode })

      if (result.success) {
        setOrderRef(result.orderRef ?? "")
        setStatus("success")
        setForm(EMPTY_FORM)
        setDeliveryMode("domicile")
        setErrors({})
      } else {
        setStatus("error")
        setErrorMsg(result.error || "Une erreur est survenue.")
      }
    } catch {
      // Empêche le bouton de tourner à l'infini si la promesse est rejetée
      // (ex. perte de connexion). On ne reste jamais bloqué sur "loading".
      setStatus("error")
      setErrorMsg(
        "La connexion a été interrompue. Veuillez vérifier votre connexion et réessayer.",
      )
    }
  }

  const inputClass = (field: Field) =>
    `border-slate-300 focus-visible:ring-violet-500 ${
      errors[field] ? "border-red-400 focus-visible:ring-red-400" : ""
    }`

  return (
    <section id="commande" className="py-20 bg-gradient-to-br from-slate-50 to-white">
      <div className="container mx-auto px-4 max-w-3xl">
        {/* Header */}
        <div className="text-center mb-10">
          <div className="inline-flex items-center gap-2 bg-violet-100 text-violet-700 px-4 py-2 rounded-full text-sm font-medium mb-4">
            <ShoppingBag className="h-4 w-4" />
            Passer commande
          </div>
          <h2 className="text-3xl md:text-4xl font-bold text-slate-900 mb-4 text-balance">
            Formulaire de commande
          </h2>
          <p className="text-lg text-slate-600 max-w-2xl mx-auto text-pretty">
            Remplissez ce formulaire pour passer votre commande. Vos informations sont
            transmises directement et en toute confidentialité à notre équipe sur Telegram,
            qui reviendra vers vous pour finaliser votre commande.
          </p>
        </div>

        <Card className="border-2 border-violet-200 shadow-xl overflow-hidden">
          {/* Bandeau */}
          <div className="bg-gradient-to-r from-violet-600 to-fuchsia-600 px-6 py-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center backdrop-blur-sm">
              <ShoppingBag className="h-5 w-5 text-white" />
            </div>
            <div>
              <p className="font-bold text-white">Détails de la commande</p>
              <p className="text-sm text-white/80">Tous les champs sont obligatoires</p>
            </div>
          </div>

          <CardContent className="p-6 md:p-8">
            {status === "success" ? (
              <div className="text-center py-8">
                <div className="w-16 h-16 rounded-full bg-emerald-100 flex items-center justify-center mx-auto mb-5">
                  <CheckCircle2 className="h-8 w-8 text-emerald-600" />
                </div>
                <h3 className="text-2xl font-bold text-slate-900 mb-3">
                  Commande bien reçue !
                </h3>
                {orderRef && (
                  <div className="mb-5 inline-flex flex-col items-center gap-0.5 rounded-xl border-2 border-violet-200 bg-violet-50 px-6 py-3">
                    <span className="text-[11px] font-medium uppercase tracking-wide text-violet-500">
                      Votre numéro de commande
                    </span>
                    <span className="text-xl font-bold text-violet-700">{orderRef}</span>
                    <span className="text-[11px] text-violet-400">Conservez-le pour le suivi</span>
                  </div>
                )}
                <p className="text-slate-600 mb-6 max-w-md mx-auto">
                  Merci de votre confiance. Votre commande est enregistrée et{" "}
                  <span className="font-semibold text-slate-800">en attente de paiement</span>.
                  Notre équipe va vous recontacter très prochainement pour finaliser le règlement et
                  organiser l&apos;expédition.
                </p>
                <div className="inline-flex items-center gap-2 text-sm font-medium text-amber-700 bg-amber-50 border border-amber-200 rounded-full px-4 py-2 mb-6">
                  <Clock className="h-4 w-4 text-amber-500" />
                  En attente de paiement
                </div>
                <div className="flex flex-col sm:flex-row gap-3 justify-center">
                  <ContactModal>
                    <Button className="gap-2 bg-sky-500 hover:bg-sky-600 text-white transition-all duration-300 hover:scale-105">
                      <Send className="h-4 w-4" />
                      Contacter nos admins Telegram
                    </Button>
                  </ContactModal>
                  <Button
                    variant="outline"
                    className="gap-2 border-violet-300 text-violet-700 hover:bg-violet-100"
                    onClick={() => setStatus("idle")}
                  >
                    Passer une autre commande
                  </Button>
                </div>
              </div>
            ) : (
              <form onSubmit={handleSubmit} noValidate className="space-y-5">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                  <div className="space-y-2">
                    <Label htmlFor="nom" className="flex items-center gap-1.5 text-slate-700">
                      <User className="h-4 w-4 text-violet-500" />
                      Nom
                    </Label>
                    <Input
                      id="nom"
                      inputMode="text"
                      value={form.nom}
                      onChange={handleChange("nom")}
                      onBlur={handleBlur("nom")}
                      placeholder="Votre nom"
                      aria-invalid={!!errors.nom}
                      className={inputClass("nom")}
                    />
                    {errors.nom && (
                      <p className="flex items-center gap-1 text-sm text-red-600">
                        <AlertCircle className="h-3.5 w-3.5" />
                        {errors.nom}
                      </p>
                    )}
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="prenom" className="flex items-center gap-1.5 text-slate-700">
                      <User className="h-4 w-4 text-violet-500" />
                      Prénom
                    </Label>
                    <Input
                      id="prenom"
                      inputMode="text"
                      value={form.prenom}
                      onChange={handleChange("prenom")}
                      onBlur={handleBlur("prenom")}
                      placeholder="Votre prénom"
                      aria-invalid={!!errors.prenom}
                      className={inputClass("prenom")}
                    />
                    {errors.prenom && (
                      <p className="flex items-center gap-1 text-sm text-red-600">
                        <AlertCircle className="h-3.5 w-3.5" />
                        {errors.prenom}
                      </p>
                    )}
                  </div>
                </div>

                {/* Pays de livraison */}
                <div className="space-y-2">
                  <Label className="flex items-center gap-1.5 text-slate-700">
                    <Globe className="h-4 w-4 text-violet-500" />
                    Pays de livraison
                  </Label>
                  <div className="grid grid-cols-2 gap-3">
                    <button
                      type="button"
                      onClick={() => handleCountryChange("FR")}
                      aria-pressed={form.pays === "FR"}
                      className={`flex items-center justify-center gap-2 rounded-lg border-2 px-4 py-3 text-sm font-medium transition-all ${
                        form.pays === "FR"
                          ? "border-violet-500 bg-violet-50 text-violet-700"
                          : "border-slate-200 text-slate-600 hover:border-slate-300 hover:bg-slate-50"
                      }`}
                    >
                      🇫🇷 France
                    </button>
                    <button
                      type="button"
                      onClick={() => handleCountryChange("BE")}
                      aria-pressed={form.pays === "BE"}
                      className={`flex items-center justify-center gap-2 rounded-lg border-2 px-4 py-3 text-sm font-medium transition-all ${
                        form.pays === "BE"
                          ? "border-violet-500 bg-violet-50 text-violet-700"
                          : "border-slate-200 text-slate-600 hover:border-slate-300 hover:bg-slate-50"
                      }`}
                    >
                      🇧🇪 Belgique
                    </button>
                  </div>
                </div>

                {/* Mode de livraison */}
                <div className="space-y-2">
                  <Label className="flex items-center gap-1.5 text-slate-700">
                    <Package className="h-4 w-4 text-violet-500" />
                    Mode de livraison
                  </Label>
                  <div className="grid grid-cols-2 gap-3">
                    <button
                      type="button"
                      onClick={() => switchMode("domicile")}
                      aria-pressed={deliveryMode === "domicile"}
                      className={`flex items-center justify-center gap-2 rounded-lg border-2 px-4 py-3 text-sm font-medium transition-all ${
                        deliveryMode === "domicile"
                          ? "border-violet-500 bg-violet-50 text-violet-700"
                          : "border-slate-200 text-slate-600 hover:border-slate-300 hover:bg-slate-50"
                      }`}
                    >
                      <Home className="h-4 w-4" />
                      À domicile
                    </button>
                    <button
                      type="button"
                      onClick={() => switchMode("relais")}
                      aria-pressed={deliveryMode === "relais"}
                      className={`flex items-center justify-center gap-2 rounded-lg border-2 px-4 py-3 text-sm font-medium transition-all ${
                        deliveryMode === "relais"
                          ? "border-violet-500 bg-violet-50 text-violet-700"
                          : "border-slate-200 text-slate-600 hover:border-slate-300 hover:bg-slate-50"
                      }`}
                    >
                      <Package className="h-4 w-4" />
                      Point relais
                    </button>
                  </div>
                </div>

                {deliveryMode === "domicile" ? (
                  <div className="space-y-5">
                    <div className="space-y-2">
                      <Label htmlFor="adresse" className="flex items-center gap-1.5 text-slate-700">
                        <MapPin className="h-4 w-4 text-violet-500" />
                        Adresse (n° et rue)
                      </Label>
                      <Input
                        id="adresse"
                        value={form.adresse}
                        onChange={handleChange("adresse")}
                        onBlur={handleBlur("adresse")}
                        placeholder="Ex : 12 rue des Lilas"
                        aria-invalid={!!errors.adresse}
                        className={inputClass("adresse")}
                      />
                      {errors.adresse && (
                        <p className="flex items-center gap-1 text-sm text-red-600">
                          <AlertCircle className="h-3.5 w-3.5" />
                          {errors.adresse}
                        </p>
                      )}
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                      <div className="space-y-2">
                        <Label htmlFor="codePostal" className="flex items-center gap-1.5 text-slate-700">
                          <MapPin className="h-4 w-4 text-violet-500" />
                          Code postal
                        </Label>
                        <Input
                          id="codePostal"
                          inputMode="numeric"
                          value={form.codePostal}
                          onChange={handleChange("codePostal")}
                          onBlur={handleBlur("codePostal")}
                          placeholder="Ex : 75011"
                          aria-invalid={!!errors.codePostal}
                          className={inputClass("codePostal")}
                        />
                        {errors.codePostal && (
                          <p className="flex items-center gap-1 text-sm text-red-600">
                            <AlertCircle className="h-3.5 w-3.5" />
                            {errors.codePostal}
                          </p>
                        )}
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="ville" className="flex items-center gap-1.5 text-slate-700">
                          <MapPin className="h-4 w-4 text-violet-500" />
                          Ville
                        </Label>
                        <Input
                          id="ville"
                          value={form.ville}
                          onChange={handleChange("ville")}
                          onBlur={handleBlur("ville")}
                          placeholder="Ex : Paris"
                          aria-invalid={!!errors.ville}
                          className={inputClass("ville")}
                        />
                        {errors.ville && (
                          <p className="flex items-center gap-1 text-sm text-red-600">
                            <AlertCircle className="h-3.5 w-3.5" />
                            {errors.ville}
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <Label className="flex items-center gap-1.5 text-slate-700">
                      <Package className="h-4 w-4 text-violet-500" />
                      Point relais
                    </Label>
                    <RelayPicker
                      defaultPostCode={form.codePostal}
                      country={form.pays}
                      onSelect={handleRelaySelect}
                    />
                    {form.pointRelais ? (
                      <div className="flex items-start gap-2 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">
                        <CheckCircle2 className="h-4 w-4 text-emerald-600 mt-0.5 flex-shrink-0" />
                        <span>{form.pointRelais}</span>
                      </div>
                    ) : errors.pointRelais ? (
                      <p className="flex items-center gap-1 text-sm text-red-600">
                        <AlertCircle className="h-3.5 w-3.5" />
                        {errors.pointRelais}
                      </p>
                    ) : (
                      <p className="text-xs text-slate-400">
                        Cliquez sur « Choisir mon point relais sur la carte » et sélectionnez votre
                        relais : tout se remplit automatiquement.
                      </p>
                    )}
                  </div>
                )}

                <div className="space-y-2">
                  <Label htmlFor="telephone" className="flex items-center gap-1.5 text-slate-700">
                    <Phone className="h-4 w-4 text-violet-500" />
                    Téléphone
                  </Label>
                  <Input
                    id="telephone"
                    type="tel"
                    inputMode="tel"
                    value={form.telephone}
                    onChange={handleChange("telephone")}
                    onBlur={handleBlur("telephone")}
                    placeholder="Ex : 06 12 34 56 78"
                    aria-invalid={!!errors.telephone}
                    className={inputClass("telephone")}
                  />
                  {errors.telephone && (
                    <p className="flex items-center gap-1 text-sm text-red-600">
                      <AlertCircle className="h-3.5 w-3.5" />
                      {errors.telephone}
                    </p>
                  )}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="message" className="flex items-center gap-1.5 text-slate-700">
                    <MessageSquare className="h-4 w-4 text-violet-500" />
                    Détail de votre commande &amp; prix
                  </Label>
                  <p className="text-xs text-slate-500">
                    Indiquez précisément les produits souhaités, les quantités et le prix convenu avec
                    l&apos;équipe.
                  </p>
                  <Textarea
                    id="message"
                    value={form.message}
                    onChange={handleMessageChange}
                    onBlur={handleBlur("message")}
                    placeholder="Ex : 2x BPC-157 5mg + 1x TB-500 5mg — 90€ convenus avec l'équipe"
                    rows={4}
                    maxLength={1000}
                    aria-invalid={!!errors.message}
                    className={`resize-none ${
                      errors.message
                        ? "border-red-400 focus-visible:ring-red-400"
                        : "border-slate-300 focus-visible:ring-violet-500"
                    }`}
                  />
                  <div className="flex items-center justify-between gap-2">
                    {errors.message ? (
                      <p className="flex items-center gap-1 text-sm text-red-600">
                        <AlertCircle className="h-3.5 w-3.5" />
                        {errors.message}
                      </p>
                    ) : (
                      <span />
                    )}
                    <p className="shrink-0 text-right text-xs text-slate-400">{form.message.length}/1000</p>
                  </div>
                </div>

                {status === "error" && (
                  <div className="bg-red-50 border border-red-200 rounded-lg p-3">
                    <p className="text-sm text-red-700">{errorMsg}</p>
                  </div>
                )}

                <div className="flex items-center gap-2 text-sm text-slate-500 bg-slate-50 rounded-lg p-3">
                  <ShieldCheck className="h-4 w-4 text-emerald-500 flex-shrink-0" />
                  <span>
                    Vos informations sont utilisées uniquement pour traiter votre commande et
                    restent confidentielles.
                  </span>
                </div>

                <Button
                  type="submit"
                  size="lg"
                  disabled={status === "loading"}
                  className="w-full gap-2 bg-sky-500 hover:bg-sky-600 text-white shadow-lg shadow-sky-500/25 transition-all duration-300 hover:scale-[1.02] disabled:opacity-70 disabled:hover:scale-100"
                >
                  {status === "loading" ? (
                    <>
                      <Loader2 className="h-5 w-5 animate-spin" />
                      Envoi en cours...
                    </>
                  ) : (
                    <>
                      <Send className="h-5 w-5" />
                      Envoyer mes informations de commande
                    </>
                  )}
                </Button>
              </form>
            )}
          </CardContent>
        </Card>
      </div>
    </section>
  )
}
