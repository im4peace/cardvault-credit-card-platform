import { useEffect, useState, type ReactNode } from 'react';

export const money = (n: number | null | undefined): string =>
  n == null ? '—' : n.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });

export const date = (s: string | null | undefined): string => (s ? new Date(s).toLocaleDateString() : '—');

const TONE: Record<string, string> = {
  APPROVED: 'good',
  ACTIVE: 'good',
  CARD_ACTIVATED: 'good',
  CARD_ISSUED: 'info',
  ISSUED: 'info',
  PENDING: 'warn',
  PENDING_CREDIT_REVIEW: 'warn',
  SUBMITTED: 'warn',
  DRAFT: 'neutral',
  REJECTED: 'bad',
  BLOCKED: 'bad',
  CLOSED: 'neutral',
  CANCELLED: 'neutral',
};

export function StatusBadge({ status }: { status: string }) {
  return <span className={`badge ${TONE[status] ?? 'neutral'}`}>{status.replace(/_/g, ' ')}</span>;
}

export function Card({ title, children, actions }: { title?: string; children: ReactNode; actions?: ReactNode }) {
  return (
    <section className="card">
      {(title || actions) && (
        <header className="card-head">
          {title && <h2>{title}</h2>}
          {actions}
        </header>
      )}
      {children}
    </section>
  );
}

export function ErrorNote({ message }: { message: string | null }) {
  return message ? (
    <p role="alert" className="error">
      {message}
    </p>
  ) : null;
}

export function Stat({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="stat">
      <span className="stat-label">{label}</span>
      <span className="stat-value">{value}</span>
    </div>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <p className="muted empty">{children}</p>;
}

/** Loads data on mount; `reload` refetches. */
export function useLoad<T>(fn: () => Promise<T>) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  useEffect(() => {
    let live = true;
    fn()
      .then((d) => live && setData(d))
      .catch((e: Error) => live && setError(e.message));
    return () => {
      live = false;
    };
    // fn is intentionally not a dependency: callers pass inline closures; reload() re-runs it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tick]);
  const reload = () => setTick((t) => t + 1);
  return { data, error, reload };
}
