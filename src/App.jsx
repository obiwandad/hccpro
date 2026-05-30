import { Routes, Route, Navigate } from 'react-router-dom'
import { useAuth } from './context/AuthContext'
import { useLocale } from './context/LocaleContext'
import Layout from './components/layout/Layout'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import Tracciabilita from './pages/Tracciabilita'
import Temperature from './pages/Temperature'
import Pulizie from './pages/Pulizie'
import Etichette from './pages/Etichette'
import Incassi from './pages/Incassi'
import Documentazione from './pages/Documentazione'
import DDT from './pages/DDT'
import TracciabilitaQR from './pages/TracciabilitaQR'
import AdminDashboard from './pages/admin/AdminDashboard'
import AdminLocali from './pages/admin/AdminLocali'
import AdminUtenti from './pages/admin/AdminUtenti'
import AdminProdotti from './pages/admin/AdminProdotti'
import AdminZoneTemp from './pages/admin/AdminZoneTemp'
import AdminPulizie from './pages/admin/AdminPulizie'
import AdminRicette from './pages/admin/AdminRicette'
import AdminCategorie from './pages/admin/AdminCategorie'
import AdminFornitori from './pages/admin/AdminFornitori'
import AdminTemplateEtichette from './pages/admin/AdminTemplateEtichette'

const ProtectedRoute = ({ children }) => {
  const { user, loading } = useAuth()
  if (loading) return <div className="flex items-center justify-center h-screen">Caricamento...</div>
  if (!user) return <Navigate to="/login" replace />
  return children
}

// Blocca l'accesso diretto via URL a una sezione disattivata per il locale attivo
const FeatureRoute = ({ feature, children }) => {
  const { loading, isFeatureEnabled } = useLocale()
  if (loading) return <div className="flex items-center justify-center h-64 text-gray-500">Caricamento...</div>
  if (!isFeatureEnabled(feature)) return <Navigate to="/dashboard" replace />
  return children
}

export default function App() {
  return (
    <Routes>
      {/* Route pubblica — accessibile senza login */}
      <Route path="/tracciabilita/:lotto" element={<TracciabilitaQR />} />

      <Route path="/login" element={<Login />} />
      <Route path="/reset-password" element={<Login />} />
      <Route path="/" element={
        <ProtectedRoute>
          <Layout />
        </ProtectedRoute>
      }>
        <Route index element={<Navigate to="/dashboard" replace />} />
        <Route path="dashboard" element={<Dashboard />} />
        <Route path="tracciabilita" element={<FeatureRoute feature="tracciabilita"><Tracciabilita /></FeatureRoute>} />
        <Route path="temperature" element={<FeatureRoute feature="temperature"><Temperature /></FeatureRoute>} />
        <Route path="pulizie" element={<FeatureRoute feature="pulizie"><Pulizie /></FeatureRoute>} />
        <Route path="etichette" element={<FeatureRoute feature="etichette"><Etichette /></FeatureRoute>} />
        <Route path="incassi" element={<FeatureRoute feature="incassi"><Incassi /></FeatureRoute>} />
        <Route path="ddt" element={<FeatureRoute feature="ddt"><DDT /></FeatureRoute>} />
        <Route path="documentazione" element={<FeatureRoute feature="documentazione"><Documentazione /></FeatureRoute>} />
        <Route path="admin" element={<AdminDashboard />} />
        <Route path="admin/locali" element={<AdminLocali />} />
        <Route path="admin/utenti" element={<AdminUtenti />} />
        <Route path="admin/prodotti" element={<AdminProdotti />} />
        <Route path="admin/zone-temperatura" element={<AdminZoneTemp />} />
        <Route path="admin/pulizie" element={<AdminPulizie />} />
        <Route path="admin/ricette" element={<AdminRicette />} />
        <Route path="admin/categorie" element={<AdminCategorie />} />
        <Route path="admin/fornitori" element={<AdminFornitori />} />
        <Route path="admin/template-etichette" element={<AdminTemplateEtichette />} />
      </Route>
    </Routes>
  )
}
