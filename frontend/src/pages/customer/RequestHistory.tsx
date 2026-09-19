import { api } from '../../api/client';
import { Card, Empty, ErrorNote, StatusBadge, date, money, useLoad } from '../../components/ui';

export function RequestHistory() {
  const apps = useLoad(api.applications);
  const limits = useLoad(api.limitRequests);
  return (
    <>
      <h1>Request history</h1>
      <ErrorNote message={apps.error ?? limits.error} />
      <Card title="Applications">
        {apps.data?.length === 0 && <Empty>Nothing yet.</Empty>}
        {apps.data?.map((a) => (
          <div className="list-row" key={a.id}>
            <span>
              {date(a.createdAt)} · {money(a.requestedCreditLimit)} requested
            </span>
            <StatusBadge status={a.status} />
          </div>
        ))}
      </Card>
      <Card title="Limit change requests">
        {limits.data?.length === 0 && <Empty>Nothing yet.</Empty>}
        {limits.data?.map((r) => (
          <div className="list-row" key={r.id}>
            <span>
              {date(r.createdAt)} · {money(r.currentLimit)} → {money(r.requestedLimit)}
            </span>
            <StatusBadge status={r.status} />
          </div>
        ))}
      </Card>
    </>
  );
}
