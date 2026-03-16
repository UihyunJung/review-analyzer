import { createClient, type SupabaseClient } from '@supabase/supabase-js'

import { SUPABASE_URL, SUPABASE_ANON_KEY } from '~lib/constants'
import { chromeStorageAdapter } from './supabase-storage-adapter'

let client: SupabaseClient | null = null

export function getSupabaseClient(): SupabaseClient {
  if (client) return client

  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    throw new Error('Supabase URL or anon key not configured')
  }

  client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: {
      storage: chromeStorageAdapter,
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: false
    }
  })

  return client
}

// --- Auth 함수 (popup/sidepanel에서만 호출) ---

export async function signUp(email: string, password: string) {
  const supabase = getSupabaseClient()
  const { data, error } = await supabase.auth.signUp({ email, password })
  if (error) throw error
  return data
}

export async function signIn(email: string, password: string) {
  const supabase = getSupabaseClient()
  const { data, error } = await supabase.auth.signInWithPassword({ email, password })
  if (error) throw error
  return data
}

export async function signOut() {
  const supabase = getSupabaseClient()
  const { error } = await supabase.auth.signOut()
  if (error) throw error
}

export async function getCurrentUser() {
  const supabase = getSupabaseClient()
  const {
    data: { user }
  } = await supabase.auth.getUser()
  return user
}

export async function getSession() {
  const supabase = getSupabaseClient()
  const {
    data: { session }
  } = await supabase.auth.getSession()
  return session
}

/** Background에서 호출 — storage에서 access_token만 읽기 */
export async function getAccessToken(): Promise<string | null> {
  try {
    const session = await getSession()
    return session?.access_token ?? null
  } catch {
    return null
  }
}
