import { useState } from 'react';
import { api } from '../../api/client';
import { Card, Empty, ErrorNote, Stat, StatusBadge, date, money, useLoad } from '../../components/ui';
import type { Card as CardType } from '../../types';

function CardItem({ card, onChange }: { card: CardType; onChange: () => void }) {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function activate() {
    setBusy(true);
    setError(null);
    try {
      await api.activateCard(card.id);
      onChange();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card title="Card details" actions={<StatusBadge status={card.status} />}>
      <div className="creditcard" aria-label="Simulated card">
        <span>SIMULATED CARD</span>
        <strong>ID {card.id.slice(-8).toUpperCase()}</strong>
        <span>{money(card.creditLimit)} limit</span>
      </div>
      <div className="stats">
        <Stat label="Credit limit" value={money(card.creditLimit)} />
        <Stat label="Available" value={money(card.availableLimit)} />
        <Stat label="Issued" value={date(card.issuedAt)} />
        <Stat label="Activated" value={date(card.activatedAt)} />
      </div>
      {card.status === 'ISSUED' && (
        <>
          <p>Your card has been issued. Activate it to start using it.</p>
          <ErrorNote message={error} />
          <button className="btn primary" onClick={activate} disabled={busy}>
            Activate card
          </button>
        </>
      )}
    </Card>
  );
}

export function CardPage() {
  const { data, error, reload } = useLoad(api.cards);
  return (
    <>
      <h1>My card</h1>
      <ErrorNote message={error} />
      {data?.length === 0 && (
        <Card>
          <Empty>No card yet. Once your application is approved your card appears here.</Empty>
        </Card>
      )}
      {data?.map((c) => <CardItem key={c.id} card={c} onChange={reload} />)}
    </>
  );
}
