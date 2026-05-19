import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'

export default function Login() {
  const { login } = useAuth()
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const [resetMode, setResetMode] = useState(false)
  const [resetPassword, setResetPassword] = useState('')
  const [resetPassword2, setResetPassword2] = useState('')
  const [resetMessage, setResetMessage] = useState('')

  const isRecoveryLink = useMemo(() => {
    const hash = window.location.hash || ''
    const search = window.location.search || ''
    const pathname = window.location.pathname || ''
    return (
      pathname === '/reset-password' ||
      hash.includes('type=recovery') ||
      search.includes('type=recovery')
    )
  }, [])

  useEffect(() => {
    const init = async () => {
      if (!isRecoveryLink) return
      setResetMode(true)
      setResetMessage('')
      setError('')
      await supabase.auth.getSession()
    }
    init()
  }, [isRecoveryLink])

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    const { error } = await login(email, password)
    if (error) {
      setError('Email o password non corretti')
      setLoading(false)
    } else {
      navigate('/dashboard')
    }
  }

  const handleReset = async (e) => {
    e.preventDefault()
    setError('')
    setResetMessage('')

    if (!resetPassword || resetPassword.length < 8) {
      setError('La password deve avere almeno 8 caratteri')
      return
    }
    if (resetPassword !== resetPassword2) {
      setError('Le password non coincidono')
      return
    }

    setLoading(true)
    const { data: sessionRes } = await supabase.auth.getSession()
    if (!sessionRes?.session) {
      setError('Link di reset non valido o scaduto. Richiedi un nuovo reset password.')
      setLoading(false)
      return
    }

    const { error: updErr } = await supabase.auth.updateUser({ password: resetPassword })
    if (updErr) {
      setError(updErr.message)
      setLoading(false)
      return
    }

    setResetMessage('Password aggiornata. Ora puoi accedere.')
    setResetPassword('')
    setResetPassword2('')
    window.history.replaceState({}, document.title, '/login')
    await supabase.auth.signOut()
    setLoading(false)
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-green-50 to-emerald-100 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-8">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-emerald-500 rounded-2xl mb-4">
            <span className="text-3xl">🍽️</span>
          </div>
          <h1 className="text-3xl font-bold text-gray-800">HACCPro</h1>
          <p className="text-gray-500 mt-1">Gestione sicurezza alimentare</p>
        </div>
        {resetMode ? (
          <form onSubmit={handleReset} className="space-y-4">
            <p className="text-sm text-gray-500">
              Imposta una nuova password per completare il recupero.
            </p>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Nuova password</label>
              <input
                type="password"
                value={resetPassword}
                onChange={(e) => setResetPassword(e.target.value)}
                className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500"
                placeholder="••••••••"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Conferma password</label>
              <input
                type="password"
                value={resetPassword2}
                onChange={(e) => setResetPassword2(e.target.value)}
                className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500"
                placeholder="••••••••"
                required
              />
            </div>
            {error && <div className="bg-red-50 text-red-600 px-4 py-3 rounded-xl text-sm">{error}</div>}
            {resetMessage && <div className="bg-emerald-50 text-emerald-700 px-4 py-3 rounded-xl text-sm">{resetMessage}</div>}
            <button
              type="submit"
              disabled={loading}
              className="w-full bg-emerald-500 hover:bg-emerald-600 disabled:bg-emerald-300 text-white font-semibold py-3 rounded-xl transition-colors"
            >
              {loading ? 'Salvataggio...' : 'Aggiorna password'}
            </button>
          </form>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)}
                className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500"
                placeholder="tuaemail@esempio.it" required />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Password</label>
              <input type="password" value={password} onChange={(e) => setPassword(e.target.value)}
                className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500"
                placeholder="••••••••" required />
            </div>
            {error && <div className="bg-red-50 text-red-600 px-4 py-3 rounded-xl text-sm">{error}</div>}
            <button type="submit" disabled={loading}
              className="w-full bg-emerald-500 hover:bg-emerald-600 disabled:bg-emerald-300 text-white font-semibold py-3 rounded-xl transition-colors">
              {loading ? 'Accesso in corso...' : 'Accedi'}
            </button>
          </form>
        )}
        <p className="text-center text-xs text-gray-400 mt-8">HACCPro © 2026</p>
      </div>
    </div>
  )
}
