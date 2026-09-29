import { createClient } from '@supabase/supabase-js'
import { env } from './env.js'

const clientOptions = { auth: { persistSession: false, autoRefreshToken: false } }
export const authClient = createClient(env.supabaseUrl, env.supabaseAnonKey, clientOptions)
export const adminClient = createClient(env.supabaseUrl, env.supabaseServiceRoleKey, clientOptions)
