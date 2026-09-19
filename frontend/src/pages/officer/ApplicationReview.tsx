import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api } from '../../api/client';
import { Card, ErrorNote, Stat, StatusBadge, date, money, useLoad } from '../../components/ui';
import type { Application } from '../../types';

function Details({ a }: { a: Application }) {
  const rows: [string, string][] = [
    ['Name', `${a.firstName} ${a.lastName}`],
    ['Email', a.email],
    ['Phone', a.phone],
    ['Date of birth', date(a.dateOfBirth)],
    ['Address', `${a.address}, ${a.city}, ${a.country}`],
    ['Employment', `${a.employmentStatus.replace('_', ' ')}${a.employerName ? ` · ${a.employerName}` : ''}`],
  ];
  return (
    <>
      <div className="stats">
        <Stat label="Monthly income" value={money(a.monthlyIncome)} />
        <Stat label="Requested limit" value={money(a.requestedCreditLimit)} />
        <Stat label="Submitted" value={date(a.submittedAt)} />
      </div>
      <dl className="details">
        {rows.map(([k, v]) => (
          <div key={k}>
            <dt>{k}</dt>
            <dd>{v}</dd>
          </div>
        ))}
      </dl>
    </>
  );
}

function DecisionForm({ a, onDone }: { a: Application; onDone: () => void }) {
  const [limit, setLimit] = useState(String(a.requestedCreditLimit));
  const [comment, setComment] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function decide(kind: 'APPROVED' | 'REJECTED') {
    setBusy(true);
    setError(null);
    try {
      await (kind === 'APPROVED'
        ? api.decideApplication(a.id, { decision: 'APPROVED', approvedLimit: Number(limit), comment: comment || undefined })
        : api.decideApplication(a.id, { decision: 'REJECTED', comment }));
      onDone();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card title="Decision">
      <div className="form">
        <label>
          Approved credit limit (USD)
          <input type="number" min={1} max={a.requestedCreditLimit} value={limit} onChange={(e) => setLimit(e.target.value)} />
        </label>
        <small className="muted">Cannot exceed the requested limit ({money(a.requestedCreditLimit)}).</small>
        <label>
          Decision comment (required to reject)
          <textarea rows={3} value={comment} onChange={(e) => setComment(e.target.value)} />
        </label>
        <ErrorNote message={error} />
        <div className="inline">
          <button className="btn primary" disabled={busy} onClick={() => decide('APPROVED')}>
            Approve
          </button>
          <button className="btn danger" disabled={busy || !comment.trim()} onClick={() => decide('REJECTED')}>
            Reject
          </button>
        </div>
      </div>
    </Card>
  );
}

export function ApplicationReview() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const { data, error } = useLoad(() => api.officerApplication(id));
  return (
    <>
      <h1>Application review</h1>
      <ErrorNote message={error} />
      {data && (
        <>
          <Card title="Applicant" actions={<StatusBadge status={data.status} />}>
            <Details a={data} />
          </Card>
          {data.status === 'PENDING_CREDIT_REVIEW' ? (
            <DecisionForm a={data} onDone={() => navigate('/officer/applications')} />
          ) : (
            <Card title="Decision">
              <p>
                {data.decision?.decision ?? 'No decision'} {data.decision?.comment && `— “${data.decision.comment}”`}
              </p>
            </Card>
          )}
        </>
      )}
    </>
  );
}
