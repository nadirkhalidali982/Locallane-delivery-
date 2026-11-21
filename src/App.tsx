import { useEffect } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import { useAuth } from './store/authStore'
import { MANAGE_ROLES, OPS_ROLES, homeFor } from './lib/roles'
import ProtectedRoute from './components/ProtectedRoute'
import Splash from './components/Splash'
import OpsLayout from './layouts/OpsLayout'
import RiderLayout from './layouts/RiderLayout'
import Login from './pages/Login'
import NoAccess from './pages/NoAccess'
import NotFound from './pages/NotFound'
import Overview from './pages/ops/Overview'
import Team from './pages/ops/Team'
import JobsPage from './pages/ops/JobsPage'
import RiderHistory from './pages/rider/RiderHistory'
import RidersPage from './pages/ops/RidersPage'
import FinancePage from './pages/ops/FinancePage'
import ZonesPage from './pages/ops/ZonesPage'
import RiderHome from './pages/rider/RiderHome'
import RiderProfile from './pages/rider/RiderProfile'

function Home() {
  const { session, role, loading } = useAuth()
  if (loading) return <Splash />
  if (!session) return <Navigate to="/login" replace />
  return <Navigate to={homeFor(role)} replace />
}

export default function App() {
  const init = useAuth((s) => s.init)
  useEffect(() => {
    void init()
  }, [init])

  return (
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/login" element={<Login />} />
      <Route path="/no-access" element={<NoAccess />} />

      <Route element={<ProtectedRoute allow={OPS_ROLES} />}>
        <Route path="/ops" element={<OpsLayout />}>
          <Route index element={<Overview />} />
          <Route path="orders" element={<JobsPage title="Orders" hint="Orders from shops that chose LocalLane Delivery. Only orders that need a manual check wait here." tabs={[{ label: 'Needs attention', statuses: ['pending_verification'] }, { label: 'Closed', statuses: ['delivered', 'failed', 'cancelled'] }, { label: 'All', statuses: 'all' }]} />} />
          <Route path="dispatch" element={<JobsPage title="Dispatch" hint="Send offers to nearby riders, or assign directly." tabs={[{ label: 'Ready', statuses: ['ready_for_dispatch', 'offering'] }, { label: 'With riders', statuses: ['assigned', 'picked_up'] }, { label: 'Failed', statuses: ['failed'] }]} />} />
          <Route element={<ProtectedRoute allow={MANAGE_ROLES} />}>
            <Route path="riders" element={<RidersPage />} />
            <Route path="zones" element={<ZonesPage />} />
            <Route path="finance" element={<FinancePage />} />
            <Route path="team" element={<Team />} />
          </Route>
        </Route>
      </Route>

      <Route element={<ProtectedRoute allow={['rider']} />}>
        <Route path="/rider" element={<RiderLayout />}>
          <Route index element={<RiderHome />} />
          <Route path="offers" element={<Navigate to="/rider" replace />} />
          <Route path="trip" element={<Navigate to="/rider" replace />} />
          <Route path="history" element={<RiderHistory />} />
          <Route path="profile" element={<RiderProfile />} />
        </Route>
      </Route>

      <Route path="*" element={<NotFound />} />
    </Routes>
  )
}
