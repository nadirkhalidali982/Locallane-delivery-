import { useState } from 'react'
import { NavLink, Outlet } from 'react-router-dom'
import { LogOut, Menu, X } from 'lucide-react'
import Logo from '../components/Logo'
import { useAuth } from '../store/authStore'
import { OPS_NAV, ROLE_LABEL } from '../lib/roles'
import { cn } from '../lib/cn'

export default function OpsLayout() {
  const { role, name, session, signOut } = useAuth()
  const [open, setOpen] = useState(false)
  const items = OPS_NAV.filter((n) => role && n.roles.includes(role))

  const nav = (
    <nav className="flex flex-col gap-1" aria-label="Main">
      {items.map((n) => (
        <NavLink
          key={n.to}
          to={n.to}
          end={n.end}
          onClick={() => setOpen(false)}
          className={({ isActive }) =>
            cn(
              'flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors',
              isActive ? 'bg-white text-ink-900' : 'text-slate-300 hover:bg-ink-800 hover:text-white',
            )
          }
        >
          <n.icon className="h-5 w-5" aria-hidden />
          {n.label}
        </NavLink>
      ))}
    </nav>
  )

  const who = (
    <div className="border-t border-ink-700 pt-4">
      <p className="truncate text-sm font-semibold text-white">{name || session?.user.email}</p>
      <p className="text-xs text-accent-400">{role ? ROLE_LABEL[role] : ''}</p>
      <button
        onClick={() => void signOut()}
        className="mt-3 flex items-center gap-2 text-sm text-slate-300 hover:text-white"
      >
        <LogOut className="h-4 w-4" aria-hidden /> Sign out
      </button>
    </div>
  )

  return (
    <div className="min-h-dvh lg:grid lg:grid-cols-[15rem_1fr]">
      {/* Desktop sidebar */}
      <aside className="hidden flex-col justify-between bg-ink-900 p-4 lg:flex lg:sticky lg:top-0 lg:h-dvh">
        <div className="space-y-6">
          <Logo />
          {nav}
        </div>
        {who}
      </aside>

      {/* Mobile top bar */}
      <header className="sticky top-0 z-20 flex items-center justify-between bg-ink-900 px-4 py-3 pt-[max(0.75rem,env(safe-area-inset-top))] lg:hidden">
        <Logo />
        <button onClick={() => setOpen(true)} aria-label="Open menu" className="rounded-lg p-2 text-white">
          <Menu className="h-6 w-6" />
        </button>
      </header>

      {open && (
        <div className="fixed inset-0 z-30 lg:hidden" role="dialog" aria-modal="true" aria-label="Menu">
          <button className="absolute inset-0 bg-black/50" aria-label="Close menu" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-0 flex h-full w-72 max-w-[85%] flex-col justify-between bg-ink-900 p-4">
            <div className="space-y-6">
              <div className="flex justify-end">
                <button onClick={() => setOpen(false)} aria-label="Close menu" className="rounded-lg p-2 text-white">
                  <X className="h-6 w-6" />
                </button>
              </div>
              {nav}
            </div>
            {who}
          </div>
        </div>
      )}

      <main className="min-w-0 p-4 sm:p-6 lg:p-8">
        <Outlet />
      </main>
    </div>
  )
}
