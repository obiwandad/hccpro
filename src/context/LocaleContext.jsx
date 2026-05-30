import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { useAuth } from './AuthContext'
import { supabase } from '../lib/supabase'
import { isFeatureEnabled as checkFeature } from '../lib/features'

const LocaleContext = createContext(null)

const storageKeyForUser = (userId) => `haccpro.activeLocaleId.${userId}`

export function LocaleProvider({ children }) {
  const { user } = useAuth()
  const [profilo, setProfilo] = useState(null)
  const [locali, setLocali] = useState([])
  const [activeLocaleId, setActiveLocaleId] = useState(null)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    if (!user) {
      setProfilo(null)
      setLocali([])
      setActiveLocaleId(null)
      setLoading(false)
      return
    }

    setLoading(true)

    const { data: prof } = await supabase
      .from('profili')
      .select('*, locali(id, nome, funzionalita)')
      .eq('user_id', user.id)
      .single()

    setProfilo(prof ?? null)

    if (prof?.ruolo === 'admin') {
      const { data: allLocali } = await supabase
        .from('locali')
        .select('id, nome, funzionalita')
        .order('nome')
      const list = allLocali ?? []
      setLocali(list)

      const stored = localStorage.getItem(storageKeyForUser(user.id))
      const storedId = stored || null
      const isValid = storedId != null && list.some((l) => l.id === storedId)
      setActiveLocaleId(isValid ? storedId : prof?.locale_id ?? list[0]?.id ?? null)
    } else {
      setLocali([])
      setActiveLocaleId(prof?.locale_id ?? null)
    }

    setLoading(false)
  }, [user])

  useEffect(() => {
    load()
  }, [load])

  const setActiveLocale = useCallback((localeId) => {
    const next = localeId == null ? null : String(localeId)
    setActiveLocaleId(next)
    if (user) localStorage.setItem(storageKeyForUser(user.id), next)
  }, [user])

  const activeLocale = useMemo(() => {
    if (!profilo) return null
    if (profilo.ruolo === 'admin' && activeLocaleId != null) {
      return locali.find((l) => l.id === activeLocaleId) ?? null
    }
    return profilo?.locali ?? null
  }, [activeLocaleId, locali, profilo])

  const activeLocaleName = useMemo(() => activeLocale?.nome ?? '', [activeLocale])

  const activeFunzionalita = useMemo(() => activeLocale?.funzionalita ?? {}, [activeLocale])

  const isFeatureEnabled = useCallback(
    (key) => checkFeature(activeFunzionalita, key),
    [activeFunzionalita]
  )

  const value = useMemo(
    () => ({
      profilo,
      locali,
      activeLocaleId,
      setActiveLocaleId: setActiveLocale,
      activeLocaleName,
      activeFunzionalita,
      isFeatureEnabled,
      reloadLocali: load,
      loading,
    }),
    [activeLocaleId, activeLocaleName, activeFunzionalita, isFeatureEnabled, locali, profilo, loading, load, setActiveLocale]
  )

  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>
}

export function useLocale() {
  const ctx = useContext(LocaleContext)
  if (!ctx) throw new Error('useLocale must be used within a LocaleProvider')
  return ctx
}
