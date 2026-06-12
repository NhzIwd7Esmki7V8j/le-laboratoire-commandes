// Lanceur d'audit : exécute des scénarios (refs) en boucle via colissimo.mjs (RPA_AUDIT=1),
// parse AUDIT_PASS/FAIL + AUDIT_CLEANED, et suit les séries de réussites consécutives.
// Usage : node run-audit.mjs <repeat> <ref...>
//   node run-audit.mjs 1 AUD_01 AUD_02 ...   → 1 passe sur chaque
//   node run-audit.mjs 15 AUD_05             → 15 fois AUD_05 d'affilée (s'arrête si bug)
import { spawn } from "node:child_process"
import { fileURLToPath } from "node:url"
import { dirname, join } from "node:path"

const __dirname = dirname(fileURLToPath(import.meta.url))
const args = process.argv.slice(2)
const repeat = Number(args[0]) || 1
const refs = args.slice(1)
if (!refs.length) {
  console.error("Usage: node run-audit.mjs <repeat> <ref...>")
  process.exit(1)
}

function runOne(ref) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [join(__dirname, "colissimo.mjs"), ref], {
      env: { ...process.env, RPA_AUDIT: "1", RPA_HEADLESS: process.env.RPA_HEADLESS ?? "0" },
      cwd: __dirname,
    })
    let out = ""
    const onData = (d) => { out += d.toString() }
    child.stdout.on("data", onData)
    child.stderr.on("data", onData)
    const timer = setTimeout(() => { try { child.kill("SIGKILL") } catch {} }, 180000)
    child.on("exit", () => {
      clearTimeout(timer)
      const pass = /AUDIT_PASS/.test(out)
      const cleaned = /AUDIT_CLEANED/.test(out)
      const failLine = (out.match(/AUDIT_FAIL.*/) || [])[0] || ""
      resolve({ pass, cleaned, failLine, out })
    })
  })
}

const summary = {}
for (const ref of refs) summary[ref] = { pass: 0, fail: 0, noclean: 0, streak: 0, maxStreak: 0, brokeAt: null }

outer: for (const ref of refs) {
  for (let n = 1; n <= repeat; n++) {
    const t0 = Date.now()
    const r = await runOne(ref)
    const secs = ((Date.now() - t0) / 1000).toFixed(0)
    const s = summary[ref]
    if (r.pass) {
      s.pass++; s.streak++; s.maxStreak = Math.max(s.maxStreak, s.streak)
      if (!r.cleaned) s.noclean++
      console.log(`✅ ${ref} #${n}/${repeat} PASS${r.cleaned ? "+CLEAN" : " (NOCLEAN!)"} (${secs}s) — série ${s.streak}`)
    } else {
      s.fail++; s.streak = 0; if (!s.brokeAt) s.brokeAt = n
      console.log(`❌ ${ref} #${n}/${repeat} FAIL (${secs}s) — ${r.failLine.trim()}`)
      console.log(r.out.split("\n").filter((l) => l.trim()).slice(-12).join("\n"))
      break // une série cassée : on arrête ce scénario (le bug doit être corrigé)
    }
  }
}

console.log("\n══════════ RÉSUMÉ ══════════")
for (const ref of refs) {
  const s = summary[ref]
  console.log(`${ref}: ${s.pass} PASS / ${s.fail} FAIL — meilleure série ${s.maxStreak}${s.noclean ? ` — ⚠️ ${s.noclean} NOCLEAN` : ""}${s.brokeAt ? ` — cassé au #${s.brokeAt}` : ""}`)
}
process.exit(0)
