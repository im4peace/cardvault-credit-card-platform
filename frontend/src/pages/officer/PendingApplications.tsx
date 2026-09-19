import { Link } from 'react-router-dom';
import { api } from '../../api/client';
import { Card, Empty, ErrorNote, StatusBadge, date, money, useLoad } from '../../components/ui';

export function PendingApplications() {
  const { data, error } = useLoad(() => api.officerApplications('PENDING_CREDIT_REVIEW'));
  return (
    <>
      <h1>Pending applications</h1>
      <ErrorNote message={error} />
      <Card>
        {data?.length === 0 && <Empty>No applications awaiting review.</Empty>}
        {data?.map((a) => (
          <div className="list-row" key={a.id}>
            <div>
              <strong>
                {a.firstName} {a.lastName}
              </strong>
              <small className="muted">
                {' '}
                · {money(a.requestedCreditLimit)} requested · income {money(a.monthlyIncome)}/mo · {date(a.submittedAt)}
              </small>
            </div>
            <div className="inline">
              <StatusBadge status={a.status} />
              <Link className="btn" to={`/officer/applications/${a.id}`}>
                Review
              </Link>
            </div>
          </div>
        ))}
      </Card>
    </>
  );
}
