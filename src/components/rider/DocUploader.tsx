import { useState } from 'react'
import { CheckCircle2, Loader2 } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { rpc, type DocType, type RiderDoc } from '../../lib/api'
import { DOC_LABEL } from '../../lib/format'

const TYPES: { type: DocType; required: boolean }[] = [
  { type: 'id_proof', required: true },
  { type: 'photo', required: true },
  { type: 'licence', required: false },
  { type: 'vehicle_doc', required: false },
]
const OK_MIME = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf']

/** Uploads into the private "rider-docs" bucket, inside the rider's own folder. Only managers can read them. */
export default function DocUploader({ userId, docs, onChanged }: { userId: string; docs: RiderDoc[]; onChanged: () => void }) {
  const [busy, setBusy] = useState<DocType | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function pick(type: DocType, file: File | undefined) {
    if (!file || busy) return
    setError(null)
    if (!OK_MIME.includes(file.type)) return setError('Use a JPG, PNG, WebP or PDF file.')
    if (file.size > 5 * 1024 * 1024) return setError('File is too large (max 5 MB).')
    setBusy(type)
    try {
      const ext = (file.name.split('.').pop() || 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 5) || 'jpg'
      const path = `${userId}/${type}-${Date.now()}.${ext}`
      const up = await supabase.storage.from('rider-docs').upload(path, file, { contentType: file.type, upsert: false })
      if (up.error) throw new Error(up.error.message)
      await rpc('rider_add_doc', { p_type: type, p_path: path })
      onChanged()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Upload failed')
    }
    setBusy(null)
  }

  return (
    <div className="space-y-3">
      {TYPES.map(({ type, required }) => {
        const has = docs.some((d) => d.doc_type === type)
        return (
          <label key={type} className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white p-3">
            <span className="text-sm">
              <b className="text-slate-800">{DOC_LABEL[type]}</b>{' '}
              <span className="text-slate-500">{required ? '(required)' : '(optional)'}</span>
            </span>
            <span className="flex items-center gap-2">
              {busy === type && <Loader2 className="h-4 w-4 animate-spin text-slate-400" aria-label="Uploading" />}
              {has && busy !== type && <CheckCircle2 className="h-5 w-5 text-brand-600" aria-label="Uploaded" />}
              <span className="rounded-lg bg-slate-100 px-3 py-1.5 text-sm font-semibold text-slate-700">{has ? 'Replace' : 'Upload'}</span>
              <input type="file" accept="image/*,application/pdf" className="sr-only" disabled={busy !== null}
                onChange={(e) => { void pick(type, e.target.files?.[0]); e.target.value = '' }} />
            </span>
          </label>
        )
      })}
      {error && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
    </div>
  )
}
