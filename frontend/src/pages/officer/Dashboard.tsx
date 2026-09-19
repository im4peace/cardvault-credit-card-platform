import { Link } from 'react-router-dom';
import { api } from '../../api/client';
import { Card, ErrorNote, Stat, useLoad } from '../../components/ui';

export function OfficerDashboard() {
  const apps = useLoad(() => api.officerApplications('PENDING_CREDIT_REVIEW'));
  const limits = useLoad(() => api.officerLimitRequests('PENDING'));
  const history = useLoad(api.history);
  return (
    <>
      <h1>Credit Team dashboard</h1>
      <ErrorNote message={apps.error ?? limits.error ?? history.error} />
      <div className="grid">
        <Card title="Pending applications">
          <div className="stats">
            <Stat label="Awaiting review" value={apps.data?.length ?? '…'} />
          </div>
          <Link className="btn primary" to="/officer/applications">
            Review applications
          </Link>
        </Card>
        <Card title="Pending limit requests">
          <div className="stats">
            <Stat label="Awaiting review" value={limits.data?.length ?? '…'} />
          </div>
          <Link className="btn primary" to="/officer/limits">
            Review limit requests
          </Link>
        </Card>
        <Card title="Processed">
          <div className="stats">
            <Stat label="Applications" value={history.data?.applications.length ?? '…'} />
            <Stat label="Limit requests" value={history.data?.limitRequests.length ?? '…'} />
          </div>
          <Link className="btn" to="/officer/history">
            Decision history
          </Link>
        </Card>
      </div>
    </>
  );
}
