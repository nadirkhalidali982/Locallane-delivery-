import { Hammer } from 'lucide-react'

export default function ComingSoon({ title, milestone, note }: { title: string; milestone: string; note: string }) {
  return (
    <div className="mx-auto max-w-xl rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center">
      <Hammer className="mx-auto h-8 w-8 text-slate-400" aria-hidden />
      <h1 className="mt-3 text-xl font-bold text-ink-900">{title}</h1>
      <p className="mt-1 text-sm font-medium text-brand-700">{milestone}</p>
      <p className="mt-3 text-sm text-slate-600">{note}</p>
    </div>
  )
}
