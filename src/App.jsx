import { Routes, Route, Navigate } from 'react-router-dom'
import { useAuth } from './context/AuthContext'
import Layout from './components/layout/Layout'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import Tracciabilita from './pages/Tracciabilita'
import Temperature from './pages/Temperature'
import Pulizie from './pages/Pulizie'
import Etichette from './pages/Etichette'
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
        <Route path="tracciabilita" element={<Tracciabilita />} />
        <Route path="temperature" element={<Temperature />} />
        <Route path="pulizie" element={<Pulizie />} />
        <Route path="etichette" element={<Etichette />} />
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
