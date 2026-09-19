import { useState, type FormEvent } from 'react';
import { api } from '../../api/client';
import { Card, Empty, ErrorNote, Stat, StatusBadge, date, money, useLoad } from '../../components/ui';
import type { Card as CardType } from '../../types';

function LimitForm({ card, onDone }: { card: CardType; onDone: () => void }) {
  const [amount, setAmount] = useState(String(card.creditLimit));
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await api.requestLimit(card.id, Number(amount), reason);
      setReason('');
      onDone();
    } catch (err) {
      setError((err as Error).message);
    }
  }

  return (
    <form onSubmit={submit} className="form" aria-label="Request limit change">
      <div className="row">
        <label>
          Requested limit (USD)
          <input type="number" min={1} required value={amount} onChange={(e) => setAmount(e.target.value)} />
        </label>
        <label>
          Reason (optional)
          <input value={reason} onChange={(e) => setReason(e.target.value)} />
        </label>
      </div>
      <p className="muted small">Increases and decreases are both reviewed by the Credit Team.</p>
      <ErrorNote message={error} />
      <button className="btn primary">Submit request</button>
    </form>
  );
}

export function Limits() {
  const cards = useLoad(api.cards);
  const requests = useLoad(api.limitRequests);
  const card = cards.data?.[0];
  const refresh = () => {
    cards.reload();
    requests.reload();
  };
  const [error, setError] = useState<string | null>(null);

  async function cancel(id: string) {
    setError(null);
    try {
      await api.cancelLimitRequest(id);
      refresh();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  return (
    <>
      <h1>Credit limit management</h1>
      <ErrorNote message={cards.error ?? requests.error ?? error} />
      {!card && (
        <Card>
          <Empty>You need a card first.</Empty>
        </Card>
      )}
      {card && (
        <Card title="Current limit">
          <div className="stats">
            <Stat label="Credit limit" value={money(card.creditLimit)} />
            <Stat label="Available" value={money(card.availableLimit)} />
          </div>
          {card.status === 'ACTIVE' ? (
            <LimitForm key={card.creditLimit} card={card} onDone={refresh} />
          ) : (
            <p className="muted">Limit changes are available once your card is active.</p>
          )}
        </Card>
      )}
      <Card title="Your requests">
        {requests.data?.length === 0 && <Empty>No requests yet.</Empty>}
        {requests.data?.map((r) => (
          <div className="list-row" key={r.id}>
            <div>
              <strong>{r.type === 'CREDIT_LIMIT_INCREASE' ? 'Increase' : 'Decrease'}</strong> to {money(r.requestedLimit)}
              <small className="muted"> · from {money(r.currentLimit)} · {date(r.createdAt)}</small>
              {r.decision?.comment && <div className="small">Credit team: “{r.decision.comment}”</div>}
            </div>
            <div className="inline">
              <StatusBadge status={r.status} />
              {r.status === 'PENDING' && (
                <button className="btn ghost" onClick={() => cancel(r.id)}>
                  Cancel
                </button>
              )}
            </div>
          </div>
        ))}
      </Card>
    </>
  );
}
