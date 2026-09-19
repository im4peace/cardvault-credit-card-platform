import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';

const CUSTOMER_NAV: [string, string][] = [
  ['/customer', 'Dashboard'],
  ['/customer/apply', 'New Application'],
  ['/customer/applications', 'Applications'],
  ['/customer/card', 'My Card'],
  ['/customer/limits', 'Credit Limit'],
  ['/customer/history', 'Request History'],
];
const OFFICER_NAV: [string, string][] = [
  ['/officer', 'Dashboard'],
  ['/officer/applications', 'Pending Applications'],
  ['/officer/limits', 'Limit Requests'],
  ['/officer/history', 'Decision History'],
];

export function Layout({ portal }: { portal: 'customer' | 'officer' }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const items = portal === 'customer' ? CUSTOMER_NAV : OFFICER_NAV;
  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-mark" aria-hidden="true" />
          <div>
            <strong>Ledgerly</strong>
            <small>{portal === 'customer' ? 'Customer Portal' : 'Credit Team Portal'}</small>
          </div>
        </div>
        <nav aria-label="Main">
          {items.map(([to, label]) => (
            <NavLink key={to} to={to} end={to === `/${portal}`}>
              {label}
            </NavLink>
          ))}
        </nav>
        <div className="userbox">
          <small>{user?.email}</small>
          <button
            className="btn ghost"
            onClick={() => {
              logout();
              navigate('/login');
            }}
          >
            Sign out
          </button>
        </div>
      </aside>
      <main className="content">
        <p className="demo-banner">Demo only — simulated data. No real banking or card issuance.</p>
        <Outlet />
      </main>
    </div>
  );
}
