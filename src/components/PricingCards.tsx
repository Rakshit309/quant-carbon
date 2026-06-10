// ── Pricing Cards ──────────────────────────────────────────────────────────

interface Card { label: string; price: number | null; sub: string; color: string; ci?: number[] }

interface PricingCardsProps { cards: Card[]; loading: boolean }

export function PricingCards({ cards, loading }: PricingCardsProps) {
  return (
    <div className="grid grid-cols-3 gap-2">
      {cards.map(({ label, price, sub, color, ci }) => (
        <div key={label} className="bg-surface border border-border rounded-lg p-3"
          style={{ borderTop: `3px solid ${color}` }}>
          <div className="text-[10px] tracking-widest mb-2" style={{ color: '#4a6480' }}>
            {label}
          </div>
          <div className="text-2xl font-semibold mb-1" style={{ color }}>
            {loading ? '...' : price != null ? `$${price.toFixed(4)}` : '—'}
          </div>
          {ci && !loading && (
            <div className="text-[10px] text-dim">[{ci[0]?.toFixed(3)}, {ci[1]?.toFixed(3)}]</div>
          )}
          <div className="text-[10px] mt-1" style={{ color: '#4a6480' }}>{sub}</div>
        </div>
      ))}
    </div>
  );
}