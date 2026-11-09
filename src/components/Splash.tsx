export default function Splash({ label = 'Loading' }: { label?: string }) {
  return (
    <div className="grid min-h-dvh place-items-center bg-ink-900 text-white" role="status" aria-live="polite">
      <div className="flex flex-col items-center gap-3">
        <img src="/brand/logo-mark.png" alt="" width={420} height={431} className="h-14 w-14 animate-pulse object-contain" />
        <p className="text-sm text-slate-300">{label}…</p>
      </div>
    </div>
  )
}
