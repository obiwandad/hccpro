import { NavLink, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { useLocale } from '../../context/LocaleContext'
import { useEffect, useState } from 'react'

const menuOperatore = [
  { path: '/dashboard', icon: '📊', label: 'Dashboard' },
  { path: '/tracciabilita', icon: '📦', label: 'Tracciabilità' },
  { path: '/temperature', icon: '🌡️', label: 'Temperature' },
  { path: '/pulizie', icon: '🧹', label: 'Pulizie' },
  { path: '/etichette', icon: '🏷️', label: 'Etichette' },
]

const menuAdmin = [
  { path: '/admin', icon: '📊', label: 'Admin Dashboard' },
  { path: '/admin/locali', icon: '🏠', label: 'Locali' },
  { path: '/admin/utenti', icon: '👥', label: 'Utenti' },
  { path: '/admin/categorie', icon: '🏷️', label: 'Categorie' },
  { path: '/admin/fornitori', icon: '🚚', label: 'Fornitori' },
  { path: '/admin/prodotti', icon: '🥕', label: 'Prodotti' },
  { path: '/admin/ricette', icon: '🍽️', label: 'Ricette' },
  { path: '/admin/zone-temperatura', icon: '🌡️', label: 'Zone Temperatura' },
  { path: '/admin/pulizie', icon: '🧹', label: 'Task Pulizie' },
  { path: '/admin/template-etichette', icon: '🧾', label: 'Template Etichette' },
]

export default function Sidebar() {
  const { logout } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const { profilo, locali, activeLocaleId, setActiveLocaleId, activeLocaleName } = useLocale()
  const [menuAperto, setMenuAperto] = useState('operatore')

  useEffect(() => {
    if (profilo?.ruolo !== 'admin') return
    if (location.pathname.startsWith('/admin')) {
      setMenuAperto('admin')
      return
    }
    setMenuAperto('operatore')
  }, [location.pathname, profilo?.ruolo])

  const handleLogout = async () => {
    await logout()
    navigate('/login')
  }

  return (
    <div className="w-64 bg-gray-900 min-h-screen flex flex-col">
      
      {/* Logo */}
      <div className="p-6 border-b border-gray-700">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-emerald-500 rounded-xl flex items-center justify-center text-xl">
            🍽️
          </div>
          <div>
            <h1 className="text-white font-bold text-lg">HACCPro</h1>
            {profilo?.ruolo === 'admin' && locali.length > 0 ? (
              <select
                className="mt-1 w-full max-w-[12rem] rounded-lg bg-gray-800 px-2 py-1 text-xs text-gray-200 ring-1 ring-gray-700 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                value={activeLocaleId ?? ''}
                onChange={(e) => setActiveLocaleId(e.target.value)}
              >
                {locali.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.nome}
                  </option>
                ))}
              </select>
            ) : (
              <p className="text-gray-400 text-xs">{activeLocaleName}</p>
            )}
          </div>
        </div>
      </div>

      {/* Menu toggle se admin */}
      {profilo?.ruolo === 'admin' && (
        <div className="flex m-4 bg-gray-800 rounded-xl p-1">
          <button
            onClick={() => setMenuAperto('operatore')}
            className={`flex-1 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              menuAperto === 'operatore'
                ? 'bg-emerald-500 text-white'
                : 'text-gray-400 hover:text-white'
            }`}
          >
            Cucina
          </button>
          <button
            onClick={() => setMenuAperto('admin')}
            className={`flex-1 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              menuAperto === 'admin'
                ? 'bg-emerald-500 text-white'
                : 'text-gray-400 hover:text-white'
            }`}
          >
            Admin
          </button>
        </div>
      )}

      {/* Menu items */}
      <nav className="flex-1 bg-gray-900 px-4 py-2">
        {profilo?.ruolo === 'admin' && menuAperto === 'admin' ? null : (
          <>
            <p className="px-4 pb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">Cucina</p>
            <div className="space-y-1">
              {menuOperatore.map((item) => (
                <NavLink
                  key={item.path}
                  to={item.path}
                  className={({ isActive }) =>
                    `flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-colors ${
                      isActive
                        ? 'bg-emerald-500 text-white'
                        : 'text-gray-400 hover:bg-gray-800 hover:text-white'
                    }`
                  }
                >
                  <span className="text-lg">{item.icon}</span>
                  {item.label}
                </NavLink>
              ))}
            </div>
          </>
        )}

        {profilo?.ruolo === 'admin' && menuAperto === 'admin' ? (
          <>
            <p className="mt-1 px-4 pb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">Admin</p>
            <div className="space-y-1">
              {menuAdmin.map((item) => (
                <NavLink
                  key={item.path}
                  to={item.path}
                  end={item.path === '/admin'}
                  className={({ isActive }) =>
                    `flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-colors ${
                      isActive
                        ? 'bg-emerald-500 text-white'
                        : 'text-gray-400 hover:bg-gray-800 hover:text-white'
                    }`
                  }
                >
                  <span className="text-lg">{item.icon}</span>
                  {item.label}
                </NavLink>
              ))}
            </div>
          </>
        ) : null}

        {profilo?.ruolo === 'admin' ? null : null}
      </nav>


      {/* Utente + Logout */}
      <div className="bg-gray-900 p-4 border-t border-gray-700">
        <div className="flex items-center gap-3 mb-3">
          <div className="w-8 h-8 bg-emerald-500 rounded-full flex items-center justify-center text-white text-sm font-bold">
            {profilo?.nome?.charAt(0).toUpperCase()}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-white text-sm font-medium truncate">{profilo?.nome}</p>
            <p className="text-gray-400 text-xs capitalize">{profilo?.ruolo}</p>
          </div>
        </div>
        <button
          onClick={handleLogout}
          className="w-full flex items-center gap-2 px-4 py-2 text-gray-400 hover:text-white hover:bg-gray-800 rounded-xl text-sm transition-colors"
        >
          <span>🚪</span>
          Esci
        </button>
      </div>
    </div>
  )
}
