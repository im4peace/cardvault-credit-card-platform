import { Navigate, Route, Routes } from 'react-router-dom';
import { RequireRole } from './auth/RequireRole';
import { Layout } from './components/Layout';
import { Login } from './pages/Login';
import { Applications } from './pages/customer/Applications';
import { CardPage } from './pages/customer/CardPage';
import { CustomerDashboard } from './pages/customer/Dashboard';
import { Limits } from './pages/customer/Limits';
import { NewApplication } from './pages/customer/NewApplication';
import { RequestHistory } from './pages/customer/RequestHistory';
import { ApplicationReview } from './pages/officer/ApplicationReview';
import { OfficerDashboard } from './pages/officer/Dashboard';
import { DecisionHistory } from './pages/officer/DecisionHistory';
import { LimitReview, PendingLimits } from './pages/officer/LimitRequests';
import { PendingApplications } from './pages/officer/PendingApplications';

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route element={<RequireRole role="CUSTOMER" />}>
        <Route path="/customer" element={<Layout portal="customer" />}>
          <Route index element={<CustomerDashboard />} />
          <Route path="apply" element={<NewApplication />} />
          <Route path="applications" element={<Applications />} />
          <Route path="card" element={<CardPage />} />
          <Route path="limits" element={<Limits />} />
          <Route path="history" element={<RequestHistory />} />
        </Route>
      </Route>
      <Route element={<RequireRole role="CREDIT_OFFICER" />}>
        <Route path="/officer" element={<Layout portal="officer" />}>
          <Route index element={<OfficerDashboard />} />
          <Route path="applications" element={<PendingApplications />} />
          <Route path="applications/:id" element={<ApplicationReview />} />
          <Route path="limits" element={<PendingLimits />} />
          <Route path="limits/:id" element={<LimitReview />} />
          <Route path="history" element={<DecisionHistory />} />
        </Route>
      </Route>
      <Route path="*" element={<Navigate to="/login" replace />} />
    </Routes>
  );
}
