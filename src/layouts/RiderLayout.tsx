import { NavLink, Outlet } from 'react-router-dom'
import Logo from '../components/Logo'
import { RIDER_NAV } from '../lib/roles'
import { cn } from '../lib/cn'

/** Rider app shell: big thumb-reach tabs at the bottom, minimal chrome on top. */
export default function RiderLayout() {
  return (
    <div className="flex min-h-dvh flex-col bg-slate-100">
      <header className="bg-ink-900 px-4 pb-3 pt-[max(0.75rem,env(safe-area-inset-top))]">
        <Logo />
      </header>
      <main className="mx-auto w-full max-w-lg flex-1 p-4 pb-28">
        <Outlet />
      </main>
      <nav
        aria-label="Rider"
        className="fixed inset-x-0 bottom-0 z-20 border-t border-slate-200 bg-white pb-[env(safe-area-inset-bottom)]"
      >
        <ul className="mx-auto flex max-w-lg">
          {RIDER_NAV.map((n) => (
            <li key={n.to} className="flex-1">
              <NavLink
                to={n.to}
                end={n.end}
                className={({ isActive }) =>
                  cn(
                    'flex min-h-16 flex-col items-center justify-center gap-1 text-xs font-semibold',
                    isActive ? 'text-brand-700' : 'text-slate-500',
                  )
                }
              >
                <n.icon className="h-6 w-6" aria-hidden />
                {n.label}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>
    </div>
  )
}
