import { Link } from 'react-router-dom';
import { api } from '../../api/client';
import { Card, Empty, ErrorNote, Stat, StatusBadge, date, money, useLoad } from '../../components/ui';

export function CustomerDashboard() {
  const apps = useLoad(api.applications);
  const cards = useLoad(api.cards);
  const limits = useLoad(api.limitRequests);
  const card = cards.data?.[0];
  const latest = apps.data?.[0];
  const pending = limits.data?.filter((l) => l.status === 'PENDING').length ?? 0;

  return (
    <>
      <h1>Welcome back</h1>
      <ErrorNote message={apps.error ?? cards.error ?? limits.error} />
      <div className="grid">
        <Card title="Your card">
          {card ? (
            <>
              <div className="stats">
                <Stat label="Status" value={<StatusBadge status={card.status} />} />
                <Stat label="Credit limit" value={money(card.creditLimit)} />
                <Stat label="Available" value={money(card.availableLimit)} />
              </div>
              <Link className="btn" to="/customer/card">
                Manage card
              </Link>
            </>
          ) : (
            <Empty>You don&apos;t have a card yet.</Empty>
          )}
        </Card>
        <Card title="Latest application">
          {latest ? (
            <>
              <div className="stats">
                <Stat label="Status" value={<StatusBadge status={latest.status} />} />
                <Stat label="Requested" value={money(latest.requestedCreditLimit)} />
                <Stat label="Created" value={date(latest.createdAt)} />
              </div>
              <Link className="btn" to="/customer/applications">
                View applications
              </Link>
            </>
          ) : (
            <>
              <Empty>No applications yet.</Empty>
              <Link className="btn primary" to="/customer/apply">
                Apply for a card
              </Link>
            </>
          )}
        </Card>
        <Card title="Limit requests">
          <div className="stats">
            <Stat label="Pending" value={pending} />
            <Stat label="Total" value={limits.data?.length ?? 0} />
          </div>
          <Link className="btn" to="/customer/limits">
            Credit limit management
          </Link>
        </Card>
      </div>
    </>
  );
}
