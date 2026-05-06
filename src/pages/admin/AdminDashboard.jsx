import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { useLocale } from '../../context/LocaleContext'

export default function AdminDashboard() {
  const { activeLocaleId } = useLocale()
  const [stats, setStats] = useState({
    locali: 0,
    utenti: 0,
    categorie: 0,
    fornitori: 0,
    prodotti: 0,
    ricette: 0,
  })

  useEffect(() => {
    const fetch = async () => {
      if (!activeLocaleId) return
      const [l, u, c, f, p, r] = await Promise.all([
        supabase.from('locali').select('id', { count: 'exact' }),
        supabase.from('profili').select('id', { count: 'exact' }).eq('locale_id', activeLocaleId),
        supabase.from('categorie').select('id', { count: 'exact' }).eq('locale_id', activeLocaleId),
        supabase.from('fornitori').select('id', { count: 'exact' }).eq('locale_id', activeLocaleId),
        supabase.from('prodotti').select('id', { count: 'exact' }).eq('locale_id', activeLocaleId),
        supabase.from('ricette').select('id', { count: 'exact' }).eq('locale_id', activeLocaleId),
      ])
      setStats({
        locali: l.count || 0,
        utenti: u.count || 0,
        categorie: c.count || 0,
        fornitori: f.count || 0,
        prodotti: p.count || 0,
        ricette: r.count || 0,
      })
    }
    fetch()
  }, [activeLocaleId])

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-800">⚙️ Pannello Admin</h1>
        <p className="text-gray-500 mt-1">Gestione e configurazione</p>
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { icon: '🏠', label: 'Locali', value: stats.locali, path: '/admin/locali' },
          { icon: '👥', label: 'Utenti', value: stats.utenti, path: '/admin/utenti' },
          { icon: '🏷️', label: 'Categorie', value: stats.categorie, path: '/admin/categorie' },
          { icon: '🚚', label: 'Fornitori', value: stats.fornitori, path: '/admin/fornitori' },
          { icon: '🥕', label: 'Prodotti', value: stats.prodotti, path: '/admin/prodotti' },
          { icon: '🍽️', label: 'Ricette', value: stats.ricette, path: '/admin/ricette' },
        ].map((s) => (
          <Link
            key={s.path}
            to={s.path}
            className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100 hover:border-emerald-300 hover:shadow-md transition-all"
          >
            <div className="text-3xl mb-3">{s.icon}</div>
            <p className="text-2xl font-bold text-gray-800">{s.value}</p>
            <p className="text-gray-500 text-sm mt-1">{s.label}</p>
          </Link>
        ))}
      </div>
    </div>
  )
}
