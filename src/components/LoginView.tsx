import { LoaderCircle, LogIn } from 'lucide-react'
import { useState } from 'react'
import { Button } from './ui/Button'
import { Panel } from './ui/Panel'
import { BarsLogo } from './BarsLogo'

export function LoginView({
  error,
  isLoading,
  onSubmit,
}: {
  error: string | null
  isLoading: boolean
  onSubmit: (email: string, password: string) => Promise<void>
}) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')

  return (
    <div className="relative flex min-h-screen items-center justify-center bg-[#0B0B0B] px-4 py-10 text-white">
      <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(circle_at_top,_rgba(255,106,0,0.08),_transparent_45%)]" />
      <Panel className="relative w-full max-w-md border-[#262626] bg-[#141414] p-8 shadow-2xl">
        <div className="flex flex-col items-center text-center">
          <BarsLogo size="lg" />
          <h1 className="mt-6 text-2xl font-black text-white tracking-tight">Acceso al Sistema</h1>
          <p className="mt-2 text-xs leading-5 text-[#9E9E9E] max-w-xs">
            Ingresa con tu correo y contraseña autorizados de BARS.
          </p>
        </div>

        <form
          className="mt-8 space-y-4"
          onSubmit={async (event) => {
            event.preventDefault()
            await onSubmit(email, password)
          }}
        >
          <div>
            <label className="block text-xs font-semibold text-[#9E9E9E] mb-1.5 ml-1">Correo Electrónico</label>
            <input
              className="w-full rounded-2xl border border-[#2E2E2E] bg-[#1A1A1A] px-4 py-3.5 text-sm text-white placeholder-[#555555] outline-none transition focus:border-[#FF6A00] focus:ring-1 focus:ring-[#FF6A00]"
              placeholder="usuario@pachax.net"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-[#9E9E9E] mb-1.5 ml-1">Contraseña</label>
            <input
              className="w-full rounded-2xl border border-[#2E2E2E] bg-[#1A1A1A] px-4 py-3.5 text-sm text-white placeholder-[#555555] outline-none transition focus:border-[#FF6A00] focus:ring-1 focus:ring-[#FF6A00]"
              placeholder="••••••••"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
          </div>

          {error ? (
            <div className="rounded-2xl border border-red-900/50 bg-red-950/30 px-4 py-3 text-xs font-medium text-red-300">
              {error}
            </div>
          ) : null}

          <Button fullWidth size="lg" className="mt-2" disabled={isLoading || !email || !password} type="submit">
            {isLoading ? <LoaderCircle size={18} className="animate-spin" /> : <LogIn size={18} />}
            {isLoading ? 'Verificando...' : 'Iniciar Sesión'}
          </Button>
        </form>
      </Panel>
    </div>
  )
}
