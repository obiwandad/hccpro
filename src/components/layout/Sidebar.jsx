import { NavLink, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { useLocale } from '../../context/LocaleContext'
import { Icon } from '../../lib/icons'
import { useEffect, useState } from 'react'

const menuOperatore = [
  { path: '/dashboard', icon: 'dashboard', label: 'Dashboard' },
  { path: '/incassi', icon: 'incassi', label: 'Incassi' },
  { path: '/tracciabilita', icon: 'tracciabilita', label: 'Tracciabilità' },
  { path: '/temperature', icon: 'temperature', label: 'Temperature' },
  { path: '/pulizie', icon: 'pulizie', label: 'Pulizie' },
  { path: '/etichette', icon: 'etichette', label: 'Etichette' },
  { path: '/ddt', icon: 'ddt', label: 'DDT' },
  { path: '/documentazione', icon: 'documentazione', label: 'Documentazione' },
]

const menuAdmin = [
  { type: 'item', path: '/admin', icon: 'dashboard', label: 'Dashboard', end: true },
  {
    type: 'group', id: 'struttura', icon: 'struttura', label: 'Struttura',
    children: [
      { path: '/admin/locali', icon: 'locali', label: 'Locali' },
      { path: '/admin/utenti', icon: 'utenti', label: 'Utenti' },
    ]
  },
  {
    type: 'group', id: 'anagrafica', icon: 'anagrafica', label: 'Anagrafica',
    children: [
      { path: '/admin/categorie', icon: 'categorie', label: 'Categorie' },
      { path: '/admin/fornitori', icon: 'fornitori', label: 'Fornitori' },
      { path: '/admin/prodotti', icon: 'prodotti', label: 'Prodotti' },
      { path: '/admin/ricette', icon: 'ricette', label: 'Ricette' },
    ]
  },
  {
    type: 'group', id: 'config', icon: 'config', label: 'Configurazione',
    children: [
      { path: '/admin/zone-temperatura', icon: 'zone-temperatura', label: 'Zone Temperatura' },
      { path: '/admin/pulizie', icon: 'task-pulizie', label: 'Task Pulizie' },
      { path: '/admin/template-etichette', icon: 'template-etichette', label: 'Template Etichette' },
    ]
  },
]

function NavItem({ path, icon, label, end = false, sub = false }) {
  return (
    <NavLink
      to={path}
      end={end}
      className={({ isActive }) =>
        `flex items-center gap-3 rounded-xl text-sm font-medium transition-colors
        ${sub ? 'px-3 py-2' : 'px-4 py-2.5'}
        ${isActive
          ? 'bg-emerald-500 text-white'
          : 'text-gray-400 hover:bg-gray-800 hover:text-white'
        }`
      }
    >
      <Icon name={icon} className={sub ? 'w-4 h-4' : 'w-5 h-5'} />
      {label}
    </NavLink>
  )
}

function GroupItem({ group, location }) {
  const isAnyChildActive = group.children.some(c => location.pathname === c.path)
  const [open, setOpen] = useState(isAnyChildActive)

  useEffect(() => {
    if (isAnyChildActive) setOpen(true)
  }, [isAnyChildActive, location.pathname])

  return (
    <div>
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-4 py-2.5 rounded-xl text-sm font-medium text-gray-400 hover:bg-gray-800 hover:text-white transition-colors"
      >
        <div className="flex items-center gap-3">
          <Icon name={group.icon} className="w-5 h-5" />
          {group.label}
        </div>
        <span className={`text-xs transition-transform duration-200 ${open ? 'rotate-180' : ''}`}>▼</span>
      </button>
      {open && (
        <div className="ml-3 mt-0.5 space-y-0.5 border-l border-gray-700 pl-2">
          {group.children.map(c => (
            <NavItem key={c.path} {...c} sub />
          ))}
        </div>
      )}
    </div>
  )
}

export default function Sidebar() {
  const { logout } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const { profilo, activeLocaleName, isFeatureEnabled } = useLocale()
  const [menuAperto, setMenuAperto] = useState('operatore')

  useEffect(() => {
    if (profilo?.ruolo !== 'admin') return
    setMenuAperto(location.pathname.startsWith('/admin') ? 'admin' : 'operatore')
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
          <div className="w-10 h-10 bg-emerald-500 rounded-xl flex items-center justify-center text-white">
            <Icon name="logo" className="w-6 h-6" />
          </div>
          <h1 className="text-white font-bold text-lg">HACCPro</h1>
        </div>
        <p className="mt-3 text-emerald-400 font-bold text-xl leading-tight break-words">
          {activeLocaleName || '—'}
        </p>
      </div>

      {/* Toggle Cucina / Admin */}
      {profilo?.ruolo === 'admin' && (
        <div className="flex m-4 bg-gray-800 rounded-xl p-1 gap-1">
          <button
            onClick={() => { setMenuAperto('operatore'); navigate('/dashboard') }}
            className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-sm font-medium transition-colors ${menuAperto === 'operatore' ? 'bg-emerald-500 text-white shadow-sm' : 'text-gray-400 hover:text-white'}`}
          >
            <Icon name="cucina" className="w-4 h-4" /> Cucina
          </button>
          <button
            onClick={() => { setMenuAperto('admin'); navigate('/admin') }}
            className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-sm font-medium transition-colors ${menuAperto === 'admin' ? 'bg-emerald-500 text-white shadow-sm' : 'text-gray-400 hover:text-white'}`}
          >
            <Icon name="admin" className="w-4 h-4" /> Admin
          </button>
        </div>
      )}

      {/* Nav */}
      <nav className="flex-1 px-4 py-2 space-y-0.5 overflow-y-auto">
        {menuAperto === 'operatore' && menuOperatore
          .filter(item => item.path === '/dashboard' || isFeatureEnabled(item.path.slice(1)))
          .map(item => (
            <NavItem key={item.path} {...item} />
          ))}

        {menuAperto === 'admin' && menuAdmin.map(item =>
          item.type === 'group'
            ? <GroupItem key={item.id} group={item} location={location} />
            : <NavItem key={item.path} {...item} />
        )}
      </nav>

      {/* Utente + Logout */}
      <div className="p-4 border-t border-gray-700">
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
          <Icon name="logout" className="w-4 h-4" /> Esci
        </button>
      </div>
    </div>
  )
}
