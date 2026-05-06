import { createContext, useContext, useEffect, useMemo, useState } from 'react'
import { useAuth } from './AuthContext'
import { supabase } from '../lib/supabase'

const LocaleContext = createContext(null)

const storageKeyForUser = (userId) => `haccpro.activeLocaleId.${userId}`

export function LocaleProvider({ children }) {
  const { user } = useAuth()
  const [profilo, setProfilo] = useState(null)
  const [locali, setLocali] = useState([])
  const [activeLocaleId, setActiveLocaleId] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const init = async () => {
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
        .select('*, locali(id, nome)')
        .eq('user_id', user.id)
        .single()

      setProfilo(prof ?? null)

      if (prof?.ruolo === 'admin') {
        const { data: allLocali } = await supabase.from('locali').select('id, nome').order('nome')
        const list = allLocali ?? []
        setLocali(list)

        const stored = localStorage.getItem(storageKeyForUser(user.id))
        const storedId = stored || null
        const isValid = storedId != null && list.some((l) => l.id === storedId)
        setActiveLocaleId(isValid ? storedId : prof?.locale_id ?? null)
      } else {
        setLocali([])
        setActiveLocaleId(prof?.locale_id ?? null)
      }

      setLoading(false)
    }

    init()
  }, [user])

  const setActiveLocale = (localeId) => {
    const next = localeId == null ? null : String(localeId)
    setActiveLocaleId(next)
    if (user) localStorage.setItem(storageKeyForUser(user.id), next)
  }

  const activeLocaleName = useMemo(() => {
    if (!profilo) return ''
    if (profilo.ruolo === 'admin' && activeLocaleId != null) {
      const match = locali.find((l) => l.id === activeLocaleId)
      if (match?.nome) return match.nome
    }
    return profilo?.locali?.nome ?? ''
  }, [activeLocaleId, locali, profilo])

  const value = useMemo(
    () => ({
      profilo,
      locali,
      activeLocaleId,
      setActiveLocaleId: setActiveLocale,
      activeLocaleName,
      loading,
    }),
    [activeLocaleId, activeLocaleName, locali, profilo, loading]
  )

  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>
}

export function useLocale() {
  const ctx = useContext(LocaleContext)
  if (!ctx) throw new Error('useLocale must be used within a LocaleProvider')
  return ctx
}
