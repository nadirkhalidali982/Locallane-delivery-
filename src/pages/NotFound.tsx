import { Link } from 'react-router-dom'

export default function NotFound() {
  return (
    <div className="grid min-h-dvh place-items-center p-6 text-center">
      <div>
        <h1 className="text-2xl font-bold text-ink-900">Page not found</h1>
        <p className="mt-2 text-sm text-slate-600">This page does not exist.</p>
        <Link to="/" className="mt-4 inline-block font-semibold text-brand-700 hover:underline">
          Go to home
        </Link>
      </div>
    </div>
  )
}
