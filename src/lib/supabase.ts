import { createClient } from '@supabase/supabase-js'

export interface DocumentRow {
  id: string
  token: string
  delete_token: string
  storage_key: string
  file_name: string
  file_size: number
  mime_type: string
  status: 'pending' | 'viewed' | 'deleted' | 'expired'
  iv: string
  viewed_at: string | null
  expires_at: string
  ttl_after_view: number
  ip_hash: string | null
  created_at: string
}

type Database = {
  public: {
    Tables: {
      documents: {
        Row: DocumentRow
        Insert: Omit<DocumentRow, 'id' | 'created_at'> & {
          id?: string
          created_at?: string
        }
        Update: Partial<Omit<DocumentRow, 'id'>>
      }
    }
  }
}

// Server-side only — never import in 'use client' files
// Uses untyped client to avoid Supabase generic inference issues;
// callers cast results to DocumentRow manually.
export function createServerSupabaseClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}
