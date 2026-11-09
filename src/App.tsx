import { useEffect } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import { useAuth } from './store/authStore'
import { MANAGE_ROLES, OPS_ROLES, homeFor } from './lib/roles'
import ProtectedRoute from './components/ProtectedRoute'
import ComingSoon from './components/ComingSoon'
import Splash from './components/Splash'
import OpsLayout from './layouts/OpsLayout'
import RiderLayout from './layouts/RiderLayout'
import Login from './pages/Login'
import NoAccess from './pages/NoAccess'
import NotFound from './pages/NotFound'
import Overview from './pages/ops/Overview'
import Team from './pages/ops/Team'
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
          <Route path="orders" element={<ComingSoon title="Orders" milestone="Milestone 2" note="Orders marked ready for pickup will appear here for verification and dispatch." />} />
          <Route path="dispatch" element={<ComingSoon title="Dispatch" milestone="Milestone 3" note="Rider discovery, offers and manual assignment." />} />
          <Route element={<ProtectedRoute allow={MANAGE_ROLES} />}>
            <Route path="riders" element={<ComingSoon title="Riders" milestone="Milestone 4" note="Rider approvals, documents and status." />} />
            <Route path="finance" element={<ComingSoon title="Finance" milestone="Milestone 6" note="Earnings, COD collection and settlements." />} />
            <Route path="team" element={<Team />} />
          </Route>
        </Route>
      </Route>

      <Route element={<ProtectedRoute allow={['rider']} />}>
        <Route path="/rider" element={<RiderLayout />}>
          <Route index element={<RiderHome />} />
          <Route path="offers" element={<ComingSoon title="Offers" milestone="Milestone 3" note="Nearby delivery offers appear here." />} />
          <Route path="trip" element={<ComingSoon title="Current trip" milestone="Milestone 5" note="Pickup, navigation and OTP delivery." />} />
          <Route path="earnings" element={<ComingSoon title="Earnings" milestone="Milestone 6" note="Delivery earnings and history." />} />
          <Route path="profile" element={<RiderProfile />} />
        </Route>
      </Route>

      <Route path="*" element={<NotFound />} />
    </Routes>
  )
}
