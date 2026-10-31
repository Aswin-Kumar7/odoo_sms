import { lazy, type ComponentType } from 'react'
import { Navigate, Route, Routes, useNavigate } from 'react-router-dom'
import { AppLayout } from './layouts/AppLayout'
import { PortalLayout } from './layouts/PortalLayout'
import { AuthLayout } from './layouts/AuthLayout'
import { GuestOnly, RequireAuth } from './auth/guards'
import { homeFor, useAuth } from './auth/AuthContext'
import { Spinner } from './components/ui'
import { LoginPage } from './pages/auth/LoginPage'
import { SignupPage } from './pages/auth/SignupPage'
import { ForgotPasswordPage } from './pages/auth/ForgotPasswordPage'
import { ResetPasswordPage } from './pages/auth/ResetPasswordPage'

// Pages load on first visit, so signing in doesn't download every screen (and the charting
// library) up front. The layouts show a spinner while a page's code arrives.
function page<K extends string>(load: () => Promise<Record<K, ComponentType>>, name: K) {
  return lazy(() => load().then((m) => ({ default: m[name] })))
}

const DashboardPage = page(() => import('./pages/DashboardPage'), 'DashboardPage')
const UsersPage = page(() => import('./pages/admin/UsersPage'), 'UsersPage')
const TaxesPage = page(() => import('./pages/catalog/TaxesPage'), 'TaxesPage')
const ProductsPage = page(() => import('./pages/catalog/ProductsPage'), 'ProductsPage')
const ProductFormPage = page(() => import('./pages/catalog/ProductFormPage'), 'ProductFormPage')
const PlansPage = page(() => import('./pages/catalog/PlansPage'), 'PlansPage')
const DiscountsPage = page(() => import('./pages/catalog/DiscountsPage'), 'DiscountsPage')
const InvoicesPage = page(() => import('./pages/billing/InvoicesPage'), 'InvoicesPage')
const InvoiceDetailPage = page(() => import('./pages/billing/InvoiceDetailPage'), 'InvoiceDetailPage')
const BillingPage = page(() => import('./pages/billing/BillingPage'), 'BillingPage')
const PaymentsPage = page(() => import('./pages/billing/PaymentsPage'), 'PaymentsPage')
const PortalSubscriptionDetailPage = page(() => import('./pages/portal/PortalSubscriptionsPage'), 'PortalSubscriptionDetailPage')
const PortalSubscriptionsPage = page(() => import('./pages/portal/PortalSubscriptionsPage'), 'PortalSubscriptionsPage')
const PortalInvoiceDetailPage = page(() => import('./pages/portal/PortalInvoicesPage'), 'PortalInvoiceDetailPage')
const PortalInvoicesPage = page(() => import('./pages/portal/PortalInvoicesPage'), 'PortalInvoicesPage')
const CustomersPage = page(() => import('./pages/sales/CustomersPage'), 'CustomersPage')
const TemplatesPage = page(() => import('./pages/sales/TemplatesPage'), 'TemplatesPage')
const TemplateFormPage = page(() => import('./pages/sales/TemplateFormPage'), 'TemplateFormPage')
const SubscriptionsPage = page(() => import('./pages/sales/SubscriptionsPage'), 'SubscriptionsPage')
const NewSubscriptionPage = page(() => import('./pages/sales/NewSubscriptionPage'), 'NewSubscriptionPage')
const SubscriptionDetailPage = page(() => import('./pages/sales/SubscriptionDetailPage'), 'SubscriptionDetailPage')

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
        <Route path="/dashboard" element={<DashboardPage />} />
        <Route path="/subscriptions" element={<SubscriptionsPage />} />
        <Route path="/subscriptions/new" element={<NewSubscriptionPage />} />
        <Route path="/subscriptions/:id" element={<SubscriptionDetailPage />} />
        <Route path="/customers" element={<CustomersPage />} />
        <Route path="/templates" element={<TemplatesPage />} />
        <Route path="/templates/:id" element={<RequireAuth roles={['ADMIN']}><TemplateFormPage /></RequireAuth>} />
        <Route path="/invoices" element={<InvoicesPage />} />
        <Route path="/invoices/:id" element={<InvoiceDetailPage />} />
        <Route path="/payments" element={<PaymentsPage />} />
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
        <Route path="subscriptions" element={<PortalSubscriptionsPage />} />
        <Route path="subscriptions/:id" element={<PortalSubscriptionDetailPage />} />
        <Route path="invoices" element={<PortalInvoicesPage />} />
        <Route path="invoices/:id" element={<PortalInvoiceDetailPage />} />
      </Route>

      <Route path="*" element={<Home />} />
    </Routes>
  )
}
