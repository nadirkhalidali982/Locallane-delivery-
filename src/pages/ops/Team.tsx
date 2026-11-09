import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { Loader2 } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../store/authStore'
import { cn } from '../../lib/cn'

interface Member {
  user_id: string
  email: string
  full_name: string | null
  phone: string | null
  role: 'manager' | 'staff' | 'rider'
  is_active: boolean
}

const ROLE_NAME: Record<Member['role'], string> = { manager: 'Manager', staff: 'Staff', rider: 'Rider' }

export default function Team() {
  const myRole = useAuth((s) => s.role)
  const [members, setMembers] = useState<Member[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [email, setEmail] = useState('')
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [role, setRole] = useState<Member['role']>('staff')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)

  const load = useCallback(async () => {
    setError(null)
    const { data, error: err } = await supabase.rpc('delivery_list_members')
    if (err) setError(err.message)
    else setMembers((data ?? []) as Member[])
    setLoading(false)
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  async function add(e: FormEvent) {
    e.preventDefault()
    if (busy) return
    setBusy(true)
    setError(null)
    setMsg(null)
    const { error: err } = await supabase.rpc('delivery_add_member', {
      p_email: email,
      p_role: role,
      p_name: name || null,
      p_phone: phone || null,
    })
    if (err) setError(err.message)
    else {
      setMsg('Member saved.')
      setEmail('')
      setName('')
      setPhone('')
      await load()
    }
    setBusy(false)
  }

  async function toggle(m: Member) {
    setError(null)
    const { error: err } = await supabase.rpc('delivery_set_member_active', { p_user: m.user_id, p_active: !m.is_active })
    if (err) setError(err.message)
    else await load()
  }

  const field = 'mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm'

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <h1 className="text-2xl font-bold text-ink-900">Team</h1>

      <form onSubmit={add} className="grid gap-3 rounded-2xl bg-white p-4 ring-1 ring-slate-200 sm:grid-cols-2">
        <p className="text-sm text-slate-600 sm:col-span-2">The person must have created an account on this site first.</p>
        <label className="text-sm font-medium text-slate-700">
          Email
          <input className={field} type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        </label>
        <label className="text-sm font-medium text-slate-700">
          Role
          <select className={field} value={role} onChange={(e) => setRole(e.target.value as Member['role'])}>
            {myRole === 'super_admin' && <option value="manager">Manager</option>}
            <option value="staff">Staff</option>
            <option value="rider">Rider</option>
          </select>
        </label>
        <label className="text-sm font-medium text-slate-700">
          Name
          <input className={field} value={name} onChange={(e) => setName(e.target.value)} maxLength={80} />
        </label>
        <label className="text-sm font-medium text-slate-700">
          Phone
          <input className={field} type="tel" inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} />
        </label>
        <div className="sm:col-span-2">
          <button
            type="submit"
            disabled={busy || !email}
            className="inline-flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-50"
          >
            {busy && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />} Add to team
          </button>
        </div>
      </form>

      {error && (
        <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      )}
      {msg && (
        <p role="status" className="rounded-lg bg-brand-50 px-3 py-2 text-sm text-brand-800">
          {msg}
        </p>
      )}

      <div className="overflow-x-auto rounded-2xl bg-white ring-1 ring-slate-200">
        {loading ? (
          <p className="p-6 text-sm text-slate-500">Loading…</p>
        ) : members.length === 0 ? (
          <p className="p-6 text-sm text-slate-600">No team members yet. Add the first one above.</p>
        ) : (
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 text-slate-600">
              <tr>
                <th className="px-4 py-2.5 font-semibold">Member</th>
                <th className="px-4 py-2.5 font-semibold">Role</th>
                <th className="px-4 py-2.5 font-semibold">Status</th>
                <th className="px-4 py-2.5" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {members.map((m) => (
                <tr key={m.user_id}>
                  <td className="px-4 py-3">
                    <p className="font-medium text-slate-800">{m.full_name || m.email}</p>
                    <p className="text-xs text-slate-500">{m.email}</p>
                  </td>
                  <td className="px-4 py-3">{ROLE_NAME[m.role]}</td>
                  <td className="px-4 py-3">
                    <span
                      className={cn(
                        'rounded-full px-2 py-0.5 text-xs font-semibold',
                        m.is_active ? 'bg-brand-100 text-brand-800' : 'bg-slate-200 text-slate-600',
                      )}
                    >
                      {m.is_active ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button onClick={() => void toggle(m)} className="text-sm font-semibold text-brand-700 hover:underline">
                      {m.is_active ? 'Deactivate' : 'Activate'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
