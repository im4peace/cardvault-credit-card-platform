import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../../api/client';
import { Card, ErrorNote } from '../../components/ui';
import type { ApplicationForm } from '../../types';

const EMPTY: ApplicationForm = {
  firstName: '',
  lastName: '',
  email: '',
  phone: '',
  dateOfBirth: '',
  address: '',
  city: '',
  country: '',
  employmentStatus: 'EMPLOYED',
  employerName: '',
  monthlyIncome: 0,
  requestedCreditLimit: 1000,
};

const EMPLOYMENT = ['EMPLOYED', 'SELF_EMPLOYED', 'UNEMPLOYED', 'RETIRED', 'STUDENT'];

export function NewApplication() {
  const navigate = useNavigate();
  const [f, setF] = useState<ApplicationForm>(EMPTY);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const text = (k: keyof ApplicationForm, label: string, type = 'text') => (
    <label>
      {label}
      <input
        type={type}
        required={k !== 'employerName'}
        value={String(f[k])}
        min={type === 'number' ? 0 : undefined}
        onChange={(e) => setF({ ...f, [k]: e.target.value })}
      />
    </label>
  );

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const draft = await api.createApplication(f);
      await api.submitApplication(draft.id);
      navigate('/customer/applications');
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <h1>New credit card application</h1>
      <Card>
        <form onSubmit={submit} className="form" aria-label="Credit card application">
          <p className="muted small">Do not enter real sensitive data. This is a demo; nothing is sent to a real issuer.</p>
          <div className="row">
            {text('firstName', 'First name')}
            {text('lastName', 'Last name')}
          </div>
          <div className="row">
            {text('email', 'Email', 'email')}
            {text('phone', 'Phone number', 'tel')}
          </div>
          <div className="row">
            {text('dateOfBirth', 'Date of birth', 'date')}
            {text('country', 'Country')}
          </div>
          <div className="row">
            {text('address', 'Address')}
            {text('city', 'City')}
          </div>
          <div className="row">
            <label>
              Employment status
              <select value={f.employmentStatus} onChange={(e) => setF({ ...f, employmentStatus: e.target.value })}>
                {EMPLOYMENT.map((o) => (
                  <option key={o} value={o}>
                    {o.replace('_', ' ')}
                  </option>
                ))}
              </select>
            </label>
            {text('employerName', 'Employer name (optional)')}
          </div>
          <div className="row">
            {text('monthlyIncome', 'Monthly income (USD)', 'number')}
            {text('requestedCreditLimit', 'Requested credit limit (USD)', 'number')}
          </div>
          <ErrorNote message={error} />
          <button className="btn primary" disabled={busy}>
            Submit application
          </button>
        </form>
      </Card>
    </>
  );
}
