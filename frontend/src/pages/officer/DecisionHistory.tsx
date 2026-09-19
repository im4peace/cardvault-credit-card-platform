import { api } from '../../api/client';
import { Card, Empty, ErrorNote, StatusBadge, date, money, useLoad } from '../../components/ui';

export function DecisionHistory() {
  const { data, error } = useLoad(api.history);
  return (
    <>
      <h1>Decision history</h1>
      <ErrorNote message={error} />
      <Card title="Applications">
        {data?.applications.length === 0 && <Empty>No processed applications.</Empty>}
        {data?.applications.map((a) => (
          <div className="list-row" key={a.id}>
            <span>
              {a.firstName} {a.lastName} · {money(a.decision?.approvedLimit ?? a.requestedCreditLimit)}
              <small className="muted"> · {date(a.decision?.decidedAt)}</small>
              {a.decision?.comment && <div className="small">“{a.decision.comment}”</div>}
            </span>
            <StatusBadge status={a.decision?.decision ?? a.status} />
          </div>
        ))}
      </Card>
      <Card title="Limit requests">
        {data?.limitRequests.length === 0 && <Empty>No processed limit requests.</Empty>}
        {data?.limitRequests.map((r) => (
          <div className="list-row" key={r.id}>
            <span>
              {money(r.currentLimit)} → {money(r.requestedLimit)}
              <small className="muted"> · {date(r.decision?.decidedAt)}</small>
              {r.decision?.comment && <div className="small">“{r.decision.comment}”</div>}
            </span>
            <StatusBadge status={r.status} />
          </div>
        ))}
      </Card>
    </>
  );
}
