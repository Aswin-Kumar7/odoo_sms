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
import { TaxesPage } from './pages/catalog/TaxesPage'
import { ProductsPage } from './pages/catalog/ProductsPage'
import { ProductFormPage } from './pages/catalog/ProductFormPage'
import { PlansPage } from './pages/catalog/PlansPage'
import { DiscountsPage } from './pages/catalog/DiscountsPage'
import { InvoicesPage } from './pages/billing/InvoicesPage'
import { InvoiceDetailPage } from './pages/billing/InvoiceDetailPage'
import { BillingPage } from './pages/billing/BillingPage'
import { CustomersPage } from './pages/sales/CustomersPage'
import { TemplatesPage } from './pages/sales/TemplatesPage'
import { TemplateFormPage } from './pages/sales/TemplateFormPage'
import { SubscriptionsPage } from './pages/sales/SubscriptionsPage'
import { NewSubscriptionPage } from './pages/sales/NewSubscriptionPage'
import { SubscriptionDetailPage } from './pages/sales/SubscriptionDetailPage'

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
        <Route path="/subscriptions" element={<SubscriptionsPage />} />
        <Route path="/subscriptions/new" element={<NewSubscriptionPage />} />
        <Route path="/subscriptions/:id" element={<SubscriptionDetailPage />} />
        <Route path="/customers" element={<CustomersPage />} />
        <Route path="/templates" element={<TemplatesPage />} />
        <Route path="/templates/:id" element={<RequireAuth roles={['ADMIN']}><TemplateFormPage /></RequireAuth>} />
        <Route path="/invoices" element={<InvoicesPage />} />
        <Route path="/invoices/:id" element={<InvoiceDetailPage />} />
        <Route path="/payments" element={<Placeholder title="Payments" />} />
        <Route path="/billing" element={<BillingPage />} />
        <Route path="/products" element={<ProductsPage />} />
        <Route path="/products/:id" element={<ProductFormPage />} />
        <Route path="/plans" element={<PlansPage />} />
        <Route path="/taxes" element={<TaxesPage />} />
        <Route path="/discounts" element={<DiscountsPage />} />
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
