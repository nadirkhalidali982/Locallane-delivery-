import { create } from 'zustand'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'
import { parseRole, type DeliveryRole } from '../lib/roles'

interface AuthState {
  session: Session | null
  role: DeliveryRole | null
  name: string | null
  loading: boolean
  roleError: string | null
  init: () => Promise<void>
  refreshRole: () => Promise<void>
  sendCode: (email: string, name?: string) => Promise<string | null>
  verifyCode: (email: string, code: string) => Promise<string | null>
  signOut: () => Promise<void>
}

let started = false

export const useAuth = create<AuthState>((set, get) => ({
  session: null,
  role: null,
  name: null,
  loading: true,
  roleError: null,

  async init() {
    if (started) return
    started = true
    const { data } = await supabase.auth.getSession()
    set({ session: data.session })
    await get().refreshRole()
    set({ loading: false })
    supabase.auth.onAuthStateChange((_event, session) => {
      const prev = get().session?.user.id
      set({ session })
      // Do not call supabase inside this callback directly (can deadlock): defer.
      if (session?.user.id !== prev) setTimeout(() => void get().refreshRole(), 0)
    })
  },

  async refreshRole() {
    if (!get().session) {
      set({ role: null, name: null, roleError: null })
      return
    }
    // The role is decided on the server (delivery_me), never from the browser.
    const { data, error } = await supabase.rpc('delivery_me')
    if (error) {
      set({ role: null, name: null, roleError: error.message })
      return
    }
    const obj = (data ?? {}) as { role?: unknown; name?: unknown }
    set({
      role: parseRole(obj.role),
      name: typeof obj.name === 'string' ? obj.name : null,
      roleError: null,
    })
  },

  // Same email-code login as the LocalLane customer site. A code to an unknown email creates the account.
  async sendCode(email, name) {
    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim().toLowerCase(),
      options: { shouldCreateUser: true, ...(name?.trim() ? { data: { name: name.trim() } } : {}) },
    })
    return error ? error.message : null
  },

  async verifyCode(email, code) {
    const { error } = await supabase.auth.verifyOtp({
      email: email.trim().toLowerCase(),
      token: code.trim(),
      type: 'email',
    })
    if (error) return error.message
    await get().refreshRole()
    return null
  },

  async signOut() {
    await supabase.auth.signOut()
    set({ session: null, role: null, name: null, roleError: null })
  },
}))
