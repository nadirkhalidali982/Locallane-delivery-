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
import RiderOffers from './pages/rider/RiderOffers'
import RiderTrip from './pages/rider/RiderTrip'
import RiderHistory from './pages/rider/RiderHistory'
import RidersPage from './pages/ops/RidersPage'
import FinancePage from './pages/ops/FinancePage'
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
          <Route path="orders" element={<JobsPage title="Orders" hint="Orders marked ready for pickup by shops. Check them, then dispatch." tabs={[{ label: 'Needs check', statuses: ['pending_verification'] }, { label: 'Closed', statuses: ['delivered', 'failed', 'cancelled'] }, { label: 'All', statuses: 'all' }]} />} />
          <Route path="dispatch" element={<JobsPage title="Dispatch" hint="Send offers to nearby riders, or assign directly." tabs={[{ label: 'Ready', statuses: ['ready_for_dispatch', 'offering'] }, { label: 'With riders', statuses: ['assigned', 'picked_up'] }, { label: 'Failed', statuses: ['failed'] }]} />} />
          <Route element={<ProtectedRoute allow={MANAGE_ROLES} />}>
            <Route path="riders" element={<RidersPage />} />
            <Route path="finance" element={<FinancePage />} />
            <Route path="team" element={<Team />} />
          </Route>
        </Route>
      </Route>

      <Route element={<ProtectedRoute allow={['rider']} />}>
        <Route path="/rider" element={<RiderLayout />}>
          <Route index element={<RiderHome />} />
          <Route path="offers" element={<RiderOffers />} />
          <Route path="trip" element={<RiderTrip />} />
          <Route path="history" element={<RiderHistory />} />
          <Route path="profile" element={<RiderProfile />} />
        </Route>
      </Route>

      <Route path="*" element={<NotFound />} />
    </Routes>
  )
}
