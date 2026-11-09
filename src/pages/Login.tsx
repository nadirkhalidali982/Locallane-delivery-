import { useState, type FormEvent } from 'react'
import { Navigate } from 'react-router-dom'
import { Loader2 } from 'lucide-react'
import Logo from '../components/Logo'
import Splash from '../components/Splash'
import { useAuth } from '../store/authStore'
import { homeFor } from '../lib/roles'

export default function Login() {
  const { session, role, loading, sendCode, verifyCode } = useAuth()
  const [step, setStep] = useState<'email' | 'code'>('email')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (loading) return <Splash />
  if (session) return <Navigate to={homeFor(role)} replace />

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (busy) return
    setBusy(true)
    setError(null)
    if (step === 'email') {
      const err = await sendCode(email, name)
      if (err) setError(err)
      else setStep('code')
    } else {
      const err = await verifyCode(email, code)
      if (err) setError(err)
    }
    setBusy(false)
  }

  const input =
    'mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-base text-slate-900 placeholder:text-slate-400'

  return (
    <div className="grid min-h-dvh lg:grid-cols-2">
      <section className="relative hidden overflow-hidden bg-ink-900 p-12 text-white lg:flex lg:flex-col lg:justify-between">
        <Logo />
        <svg viewBox="0 0 400 240" className="absolute inset-x-0 top-1/2 w-full -translate-y-1/2 opacity-90" aria-hidden>
          <path d="M-10 200 C 80 200, 100 90, 190 120 S 320 60, 410 40" fill="none" stroke="#26345f" strokeWidth="14" strokeLinecap="round" />
          <path d="M-10 200 C 80 200, 100 90, 190 120 S 320 60, 410 40" fill="none" stroke="#f59e0b" strokeWidth="3" strokeDasharray="2 12" strokeLinecap="round" />
          <circle cx="190" cy="120" r="9" fill="#14b8a6" />
          <circle cx="190" cy="120" r="18" fill="none" stroke="#14b8a6" strokeOpacity=".4" />
        </svg>
        <div className="relative max-w-sm">
          <h1 className="text-3xl font-bold leading-tight">From the shop shelf to the customer's door.</h1>
          <p className="mt-3 text-slate-300">Dispatch, riders and deliveries for LocalLane orders, in one place.</p>
        </div>
      </section>

      <section className="flex items-center justify-center px-5 py-10">
        <div className="w-full max-w-sm">
          <div className="mb-8 lg:hidden">
            <div className="inline-block rounded-2xl bg-ink-900 p-3">
              <Logo />
            </div>
          </div>
          <h2 className="text-2xl font-bold text-ink-900">Sign in</h2>
          <p className="mt-1 text-sm text-slate-600">
            {step === 'email'
              ? 'Enter your email. We send you a sign-in code, the same as on LocalLane.'
              : `Enter the code we sent to ${email}.`}
          </p>

          <form onSubmit={submit} className="mt-6 space-y-4" noValidate>
            {step === 'email' ? (
              <>
                <label className="block text-sm font-medium text-slate-700">
                  Email
                  <input className={input} type="email" inputMode="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" required />
                </label>
                <label className="block text-sm font-medium text-slate-700">
                  Your name (only needed the first time)
                  <input className={input} value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" maxLength={80} />
                </label>
              </>
            ) : (
              <label className="block text-sm font-medium text-slate-700">
                Code
                <input
                  className={input + ' tracking-widest'}
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 10))}
                  required
                />
              </label>
            )}

            {error && (
              <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={busy || (step === 'email' ? !email : code.length < 6)}
              className="flex w-full items-center justify-center gap-2 rounded-lg bg-brand-600 px-4 py-3 text-base font-semibold text-white hover:bg-brand-700 disabled:opacity-50"
            >
              {busy && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
              {step === 'email' ? 'Send code' : 'Sign in'}
            </button>
          </form>

          {step === 'code' && (
            <button
              onClick={() => {
                setStep('email')
                setCode('')
                setError(null)
              }}
              className="mt-5 text-sm font-medium text-brand-700 hover:underline"
            >
              Use a different email
            </button>
          )}
        </div>
      </section>
    </div>
  )
}
