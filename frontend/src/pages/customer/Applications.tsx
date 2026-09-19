import { Link } from 'react-router-dom';
import { api } from '../../api/client';
import { Card, Empty, ErrorNote, StatusBadge, date, money, useLoad } from '../../components/ui';

const STEPS = ['SUBMITTED', 'PENDING_CREDIT_REVIEW', 'APPROVED', 'CARD_ISSUED', 'CARD_ACTIVATED'];

function Progress({ status }: { status: string }) {
  if (status === 'REJECTED') return <p className="error">Application rejected</p>;
  if (status === 'DRAFT') return <p className="muted">Draft — not yet submitted</p>;
  // Approval moves straight to CARD_ISSUED, so the Approved step is reached along the way.
  const reached = STEPS.indexOf(status);
  return (
    <ol className="steps" aria-label="Progress">
      {['Submitted', 'In review', 'Approved', 'Card issued', 'Card active'].map((label, i) => (
        <li key={label} className={i <= reached ? 'done' : ''}>
          {label}
        </li>
      ))}
    </ol>
  );
}

export function Applications() {
  const { data, error } = useLoad(api.applications);
  return (
    <>
      <h1>Application status</h1>
      <ErrorNote message={error} />
      {data?.length === 0 && (
        <Card>
          <Empty>No applications yet.</Empty>
          <Link className="btn primary" to="/customer/apply">
            Apply for a card
          </Link>
        </Card>
      )}
      {data?.map((a) => (
        <Card key={a.id} title={`Application · ${date(a.createdAt)}`} actions={<StatusBadge status={a.status} />}>
          <Progress status={a.status} />
          <p className="muted small">
            Requested {money(a.requestedCreditLimit)}
            {a.decision?.approvedLimit != null && <> · Approved {money(a.decision.approvedLimit)}</>}
          </p>
          {a.decision?.comment && <p>Credit team comment: “{a.decision.comment}”</p>}
        </Card>
      ))}
    </>
  );
}
