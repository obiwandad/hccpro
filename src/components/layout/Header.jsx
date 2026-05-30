import { useLocale } from '../../context/LocaleContext'
import { Icon } from '../../lib/icons'

export default function Header() {
  const { profilo, locali, activeLocaleId, setActiveLocaleId, activeLocaleName } = useLocale()
  const isAdmin = profilo?.ruolo === 'admin'
  const canSwitch = isAdmin && locali.length > 1

  return (
    <header className="sticky top-0 z-30 bg-white/90 backdrop-blur border-b border-gray-100">
      <div className="px-8 py-3 flex items-center justify-end">
        <div className="flex items-center gap-2 rounded-xl bg-emerald-50 border border-emerald-200 pl-3 pr-2 py-1.5">
          <Icon name="pin" className="w-4 h-4 text-emerald-600" />
          <span className="text-xs font-semibold uppercase tracking-wide text-emerald-600">
            Locale attivo
          </span>

          {canSwitch ? (
            <select
              value={activeLocaleId ?? ''}
              onChange={(e) => setActiveLocaleId(e.target.value)}
              className="ml-1 rounded-lg bg-white px-2 py-1 text-sm font-bold text-emerald-800 ring-1 ring-emerald-200 focus:outline-none focus:ring-2 focus:ring-emerald-500 cursor-pointer"
            >
              {locali.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.nome}
                </option>
              ))}
            </select>
          ) : (
            <span className="ml-1 rounded-lg bg-white px-2 py-1 text-sm font-bold text-emerald-800 ring-1 ring-emerald-200">
              {activeLocaleName || '—'}
            </span>
          )}
        </div>
      </div>
    </header>
  )
}
