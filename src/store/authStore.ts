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
  signIn: (email: string, password: string) => Promise<string | null>
  signUp: (email: string, password: string, name: string) => Promise<{ error: string | null; needsConfirm: boolean }>
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

  async signIn(email, password) {
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password })
    if (error) return error.message
    await get().refreshRole()
    return null
  },

  async signUp(email, password, name) {
    const { data, error } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: { data: { name: name.trim() } },
    })
    if (error) return { error: error.message, needsConfirm: false }
    if (!data.session) return { error: null, needsConfirm: true }
    await get().refreshRole()
    return { error: null, needsConfirm: false }
  },

  async signOut() {
    await supabase.auth.signOut()
    set({ session: null, role: null, name: null, roleError: null })
  },
}))
