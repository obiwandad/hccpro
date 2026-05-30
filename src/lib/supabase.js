import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

// #region debug-point A:instrument-supabase-fetch
const __DBG_URL = import.meta.env.VITE_DEBUG_SERVER_URL || ''
const __DBG_SESSION = import.meta.env.VITE_DEBUG_SESSION || 'dev'
const __DBG_RUN = import.meta.env.VITE_DEBUG_RUN || 'dev'
const __DBG_ENABLED = !!__DBG_URL
const __dbg = (hypothesisId, msg, data) => {
  if (!__DBG_ENABLED) return
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
    void 0
  }
}
// #endregion

// #region debug-point D:supabase-env
__dbg('D', 'supabase init', {
  hasUrl: !!supabaseUrl,
  urlHost: (() => { try { return supabaseUrl ? new URL(supabaseUrl).host : null } catch { return 'invalid-url' } })(),
  origin: (typeof window !== 'undefined' && window.location) ? window.location.origin : null,
})
// #endregion

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  global: {
    fetch: async (input, init) => {
      const method = (init?.method || 'GET').toUpperCase()
      const urlStr = typeof input === 'string' ? input : input?.url
      const start = Date.now()
      const traceId = (typeof crypto !== 'undefined' && crypto.randomUUID) ? crypto.randomUUID() : `${start}-${Math.random().toString(16).slice(2)}`
      const isWrite = method !== 'GET' && method !== 'HEAD'
      const headerKeys = (() => {
        try {
          const h = init?.headers
          if (!h) return []
          if (Array.isArray(h)) return h.map(([k]) => String(k))
          if (typeof Headers !== 'undefined' && h instanceof Headers) return Array.from(h.keys())
          return Object.keys(h).map(String)
        } catch {
          return []
        }
      })()

      if (isWrite) {
        __dbg('A', 'supabase request', {
          traceId,
          method,
          url: urlStr,
          headerKeys,
        })
      }

      let res
      try {
        res = await fetch(input, init)
      } catch (e) {
        if (isWrite) {
          __dbg('D', 'supabase fetch threw', {
            traceId,
            method,
            url: urlStr,
            headerKeys,
            name: e?.name || null,
            message: e?.message || String(e),
          })
        }
        throw e
      }

      if (isWrite) {
        let errText = ''
        try {
          if (!res.ok) {
            errText = (await res.clone().text())?.slice(0, 1200) || ''
          }
        } catch {
          void 0
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

export async function uploadToDocumentazione({ localeId, file, titolo, tags, userId }) {
  const BUCKET = 'allegati-merci'
  if (!localeId) return { error: new Error('localeId mancante') }
  if (!file) return { error: new Error('file mancante') }

  const safeName = String(file.name || 'documento').replaceAll('/', '_')
  const path = `${localeId}/documentazione/${Date.now()}_${safeName}`

  const { error: upErr } = await supabase.storage.from(BUCKET).upload(path, file, {
    contentType: file.type || undefined,
    upsert: false,
  })
  if (upErr) return { error: upErr }

  const payload = {
    locale_id: localeId,
    titolo: String(titolo || '').trim() || safeName,
    file_name: safeName,
    content_type: file.type || '',
    storage_bucket: BUCKET,
    storage_path: path,
    tags: Array.isArray(tags) ? tags : [],
    uploaded_by: userId || null,
  }

  const { error: insErr } = await supabase.from('documenti').insert(payload)
  if (insErr) {
    await supabase.storage.from(BUCKET).remove([path])
    return { error: insErr }
  }

  return { error: null, storagePath: path }
}
