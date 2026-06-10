// ── Pricing Cards ──────────────────────────────────────────────────────────

interface Card {
  label: string;
  price: number | null;
  sub:   string;
  color: string;
  ci?:   number[];
  note?: string;
}

interface PricingCardsProps { cards: Card[]; loading: boolean }

export function PricingCards({ cards, loading }: PricingCardsProps) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
      {cards.map(({ label, price, sub, color, ci, note }) => (
        <div
          key={label}
          className="qcard fade-in"
          style={{ borderTop: `3px solid ${color}`, padding: '12px 14px' }}
        >
          <div style={{ fontSize: 9, color: 'var(--dim)', letterSpacing: '.1em', marginBottom: 6 }}>
            {label}
          </div>

          <div style={{
            fontSize: 26, fontWeight: 600, color,
            letterSpacing: '-.01em', marginBottom: 3,
            opacity: loading ? .4 : 1, transition: 'opacity .2s',
          }}>
            {loading ? '...' : price != null ? `$${price.toFixed(4)}` : '—'}
          </div>

          {ci && !loading && (
            <div style={{ fontSize: 10, color: 'var(--dim)', marginBottom: 3 }}>
              [{ci[0]?.toFixed(3)}, {ci[1]?.toFixed(3)}] 95%
            </div>
          )}

          {note && !loading && (
            <div style={{ fontSize: 10, color, opacity: .7 }}>{note}</div>
          )}

          <div style={{ fontSize: 10, color: 'var(--dim)', marginTop: 4 }}>{sub}</div>
        </div>
      ))}
    </div>
  );
}