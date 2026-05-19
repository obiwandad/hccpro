import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

// #region debug-point A:instrument-supabase-fetch
const __DBG_URL = 'http://127.0.0.1:7777/event'
const __DBG_SESSION = 'insert-create-fails'
const __DBG_RUN = 'pre'
const __dbg = (hypothesisId, msg, data) => {
  try {
    fetch(__DBG_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sessionId: __DBG_SESSION,
        runId: __DBG_RUN,
        hypothesisId,
        location: 'src/lib/supabase.js',
        msg: `[DEBUG] ${msg}`,
        data: data || {},
        ts: Date.now(),
      }),
    }).catch(() => {})
  } catch {
  }
}
// #endregion

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  global: {
    fetch: async (input, init) => {
      const method = (init?.method || 'GET').toUpperCase()
      const urlStr = typeof input === 'string' ? input : input?.url
      const start = Date.now()
      const traceId = (typeof crypto !== 'undefined' && crypto.randomUUID) ? crypto.randomUUID() : `${start}-${Math.random().toString(16).slice(2)}`
      const isWrite = method !== 'GET' && method !== 'HEAD'

      if (isWrite) {
        __dbg('A', 'supabase request', {
          traceId,
          method,
          url: urlStr,
        })
      }

      const res = await fetch(input, init)

      if (isWrite) {
        let errText = ''
        try {
          if (!res.ok) {
            errText = (await res.clone().text())?.slice(0, 1200) || ''
          }
        } catch {
        }

        __dbg(res.ok ? 'A' : 'B', 'supabase response', {
          traceId,
          method,
          url: urlStr,
          status: res.status,
          ok: res.ok,
          ms: Date.now() - start,
          errText,
        })
      }

      return res
    },
  },
})
