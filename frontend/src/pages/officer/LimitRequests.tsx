import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api } from '../../api/client';
import { Card, Empty, ErrorNote, Stat, StatusBadge, date, money, useLoad } from '../../components/ui';

const label = (t: string): string => (t === 'CREDIT_LIMIT_INCREASE' ? 'Increase' : 'Decrease');

export function PendingLimits() {
  const { data, error } = useLoad(() => api.officerLimitRequests('PENDING'));
  return (
    <>
      <h1>Pending limit requests</h1>
      <ErrorNote message={error} />
      <Card>
        {data?.length === 0 && <Empty>No limit requests awaiting review.</Empty>}
        {data?.map((r) => (
          <div className="list-row" key={r.id}>
            <span>
              <strong>{label(r.type)}</strong> {money(r.currentLimit)} → {money(r.requestedLimit)}
              <small className="muted"> · {date(r.createdAt)}</small>
            </span>
            <Link className="btn" to={`/officer/limits/${r.id}`}>
              Review
            </Link>
          </div>
        ))}
      </Card>
    </>
  );
}

export function LimitReview() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const { data, error } = useLoad(() => api.officerLimitRequests());
  const [comment, setComment] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const req = data?.find((r) => r.id === id);

  async function decide(kind: 'APPROVED' | 'REJECTED') {
    setErr(null);
    try {
      await api.decideLimitRequest(id, kind, comment);
      navigate('/officer/limits');
    } catch (e) {
      setErr((e as Error).message);
    }
  }

  return (
    <>
      <h1>Limit request review</h1>
      <ErrorNote message={error ?? err} />
      {data && !req && <Empty>Request not found.</Empty>}
      {req && (
        <Card title={label(req.type)} actions={<StatusBadge status={req.status} />}>
          <div className="stats">
            <Stat label="Current limit" value={money(req.currentLimit)} />
            <Stat label="Requested limit" value={money(req.requestedLimit)} />
            <Stat label="Card available" value={money(req.card?.availableLimit)} />
          </div>
          {req.reason && <p>Customer reason: “{req.reason}”</p>}
          {req.status === 'PENDING' ? (
            <div className="form">
              <label>
                Decision comment
                <textarea rows={3} value={comment} onChange={(e) => setComment(e.target.value)} />
              </label>
              <div className="inline">
                <button className="btn primary" onClick={() => decide('APPROVED')}>
                  Approve
                </button>
                <button className="btn danger" onClick={() => decide('REJECTED')}>
                  Reject
                </button>
              </div>
            </div>
          ) : (
            <p>
              {req.decision?.decision} {req.decision?.comment && `— “${req.decision.comment}”`}
            </p>
          )}
        </Card>
      )}
    </>
  );
}
