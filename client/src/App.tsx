import { Navigate, Route, Routes, useNavigate } from 'react-router-dom'
import { AppLayout } from './layouts/AppLayout'
import { PortalLayout } from './layouts/PortalLayout'
import { AuthLayout } from './layouts/AuthLayout'
import { GuestOnly, RequireAuth } from './auth/guards'
import { homeFor, useAuth } from './auth/AuthContext'
import { Spinner } from './components/ui'
import { Placeholder } from './pages/Placeholder'
import { LoginPage } from './pages/auth/LoginPage'
import { SignupPage } from './pages/auth/SignupPage'
import { ForgotPasswordPage } from './pages/auth/ForgotPasswordPage'
import { ResetPasswordPage } from './pages/auth/ResetPasswordPage'
import { UsersPage } from './pages/admin/UsersPage'

function BackOffice() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  return (
    <RequireAuth roles={['ADMIN', 'STAFF']}>
      <AppLayout role={user?.role} userName={user?.name} onLogout={() => logout().then(() => navigate('/login'))} />
    </RequireAuth>
  )
}

function Portal() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  return (
    <RequireAuth roles={['CUSTOMER']}>
      <PortalLayout userName={user?.name} onLogout={() => logout().then(() => navigate('/login'))} />
    </RequireAuth>
  )
}

function Home() {
  const { user, loading } = useAuth()
  if (loading) return <Spinner />
  return <Navigate to={user ? homeFor(user.role) : '/login'} replace />
}

export default function App() {
  return (
    <Routes>
      <Route element={<AuthLayout />}>
        <Route path="/login" element={<GuestOnly><LoginPage /></GuestOnly>} />
        <Route path="/signup" element={<GuestOnly><SignupPage /></GuestOnly>} />
        <Route path="/forgot-password" element={<ForgotPasswordPage />} />
        <Route path="/reset-password" element={<ResetPasswordPage />} />
      </Route>

      <Route element={<BackOffice />}>
        <Route path="/dashboard" element={<Placeholder title="Dashboard" />} />
        <Route path="/subscriptions" element={<Placeholder title="Subscriptions" />} />
        <Route path="/customers" element={<Placeholder title="Customers" />} />
        <Route path="/templates" element={<Placeholder title="Quotation templates" />} />
        <Route path="/invoices" element={<Placeholder title="Invoices" />} />
        <Route path="/payments" element={<Placeholder title="Payments" />} />
        <Route path="/billing" element={<Placeholder title="Billing runs" />} />
        <Route path="/products" element={<Placeholder title="Products" />} />
        <Route path="/plans" element={<Placeholder title="Recurring plans" />} />
        <Route path="/taxes" element={<Placeholder title="Taxes" />} />
        <Route path="/discounts" element={<Placeholder title="Discounts" />} />
        <Route path="/users" element={<RequireAuth roles={['ADMIN']}><UsersPage /></RequireAuth>} />
      </Route>

      <Route path="/portal" element={<Portal />}>
        <Route index element={<Navigate to="subscriptions" replace />} />
        <Route path="subscriptions" element={<Placeholder title="My subscriptions" />} />
        <Route path="invoices" element={<Placeholder title="My invoices" />} />
      </Route>

      <Route path="*" element={<Home />} />
    </Routes>
  )
}
