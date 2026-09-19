import { useState, type FormEvent } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { homeFor } from '../auth/RequireRole';
import { ErrorNote } from '../components/ui';

export function Login() {
  const { user, login, register } = useAuth();
  const navigate = useNavigate();
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [f, setF] = useState({ email: '', password: '', firstName: '', lastName: '' });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (user) return <Navigate to={homeFor(user.role)} replace />;

  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: e.target.value });

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const u = mode === 'login' ? await login(f.email, f.password) : await register(f);
      navigate(homeFor(u.role));
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="login">
      <div className="login-hero">
        <h1>Ledgerly</h1>
        <p>Apply for a card, track your application, and manage your limit — all in one place.</p>
        <p className="muted">Demo app · simulated data only</p>
      </div>
      <form className="card login-form" onSubmit={submit} aria-label={mode === 'login' ? 'Sign in' : 'Create account'}>
        <h2>{mode === 'login' ? 'Sign in' : 'Create customer account'}</h2>
        {mode === 'register' && (
          <div className="row">
            <label>
              First name
              <input required value={f.firstName} onChange={set('firstName')} />
            </label>
            <label>
              Last name
              <input required value={f.lastName} onChange={set('lastName')} />
            </label>
          </div>
        )}
        <label>
          Email
          <input type="email" required value={f.email} onChange={set('email')} />
        </label>
        <label>
          Password
          <input type="password" required minLength={mode === 'register' ? 8 : 1} value={f.password} onChange={set('password')} />
        </label>
        <ErrorNote message={error} />
        <button className="btn primary" disabled={busy}>
          {mode === 'login' ? 'Sign in' : 'Create account'}
        </button>
        <button type="button" className="btn link" onClick={() => setMode(mode === 'login' ? 'register' : 'login')}>
          {mode === 'login' ? 'New customer? Create an account' : 'Have an account? Sign in'}
        </button>
        {mode === 'login' && (
          <p className="muted small">
            Demo logins: customer@test.com / Customer123! · officer@test.com / Officer123!
          </p>
        )}
      </form>
    </div>
  );
}
