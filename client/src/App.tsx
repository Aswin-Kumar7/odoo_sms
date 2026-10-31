import { Navigate, Route, Routes } from 'react-router-dom'
import { AppLayout } from './layouts/AppLayout'
import { PortalLayout } from './layouts/PortalLayout'
import { Placeholder } from './pages/Placeholder'

// Route shell. Auth guards and real pages replace the placeholders module by module (M1+).
export default function App() {
  return (
    <Routes>
      <Route element={<AppLayout />}>
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
        <Route path="/users" element={<Placeholder title="Users" />} />
      </Route>
      <Route path="/portal" element={<PortalLayout />}>
        <Route index element={<Navigate to="subscriptions" replace />} />
        <Route path="subscriptions" element={<Placeholder title="My subscriptions" />} />
        <Route path="invoices" element={<Placeholder title="My invoices" />} />
      </Route>
      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  )
}
