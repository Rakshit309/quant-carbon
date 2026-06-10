// ── Navigation Bar ─────────────────────────────────────────────────────────

import { usePricingStore } from '../store/pricingStore';

const TABS = [
  { id: 'equity' as const, label: 'Equity Options', sub: 'Black-Scholes · GBM · FDM',     icon: '◈' },
  { id: 'carbon' as const, label: 'Carbon EUA',     sub: 'Bachelier-OU · calibrated',      icon: '◉' },
  { id: 'var'    as const, label: 'Portfolio VaR',  sub: 'MC full revaluation · ES',       icon: '◎' },
];

export function NavBar() {
  const { activeTab, setActiveTab } = usePricingStore();

  return (
    <header style={{
      background: 'var(--surface)', borderBottom: '1px solid var(--border)',
      padding: '12px 20px', display: 'flex', alignItems: 'center', gap: 16,
      position: 'sticky', top: 0, zIndex: 50,
    }}>

      {/* Logo */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <div style={{
          fontSize: 11, fontWeight: 700, color: 'var(--blue)',
          background: 'rgba(59,139,253,.1)', border: '1px solid rgba(59,139,253,.3)',
          borderRadius: 5, padding: '2px 8px', letterSpacing: '.1em',
        }}>
          QC
        </div>
        <div>
          <div style={{
            fontFamily: "'Syne', sans-serif", fontWeight: 800,
            fontSize: 16, color: '#e8f2ff', letterSpacing: '-.01em',
          }}>
            quant-carbon
          </div>
          <div style={{ fontSize: 9, color: 'var(--dim)' }}>
            live · quant-carbon.shoumyadeep309.workers.dev
          </div>
        </div>
      </div>

      {/* Tabs */}
      <nav style={{ display: 'flex', gap: 4, marginLeft: 16 }}>
        {TABS.map(t => {
          const active = activeTab === t.id;
          return (
            <button
              key={t.id}
              onClick={() => setActiveTab(t.id)}
              style={{
                padding: '8px 14px', borderRadius: 8, cursor: 'pointer',
                fontFamily: 'inherit', textAlign: 'left', transition: 'all .15s',
                background: active ? 'rgba(59,139,253,.1)' : 'transparent',
                border:     active ? '1px solid rgba(59,139,253,.35)' : '1px solid transparent',
              }}
            >
              <div style={{
                display: 'flex', alignItems: 'center', gap: 5,
                fontSize: 12, fontWeight: active ? 600 : 400,
                color: active ? 'var(--blue)' : 'var(--text)',
              }}>
                <span style={{ fontSize: 10 }}>{t.icon}</span>
                {t.label}
              </div>
              <div style={{ fontSize: 9, color: 'var(--dim)', marginTop: 2 }}>{t.sub}</div>
            </button>
          );
        })}
      </nav>

      {/* Status */}
      <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8 }}>
        <div style={{
          fontSize: 10, color: 'var(--green)',
          background: 'rgba(45,214,122,.08)', border: '1px solid rgba(45,214,122,.2)',
          borderRadius: 5, padding: '3px 8px', display: 'flex', alignItems: 'center', gap: 4,
        }}>
          <span style={{ width: 5, height: 5, borderRadius: '50%', background: 'var(--green)', display: 'inline-block' }} />
          78 tests passing
        </div>
        <div style={{
          fontSize: 10, color: 'var(--blue)',
          background: 'rgba(59,139,253,.08)', border: '1px solid rgba(59,139,253,.2)',
          borderRadius: 5, padding: '3px 8px',
        }}>
          API live
        </div>
      </div>
    </header>
  );
}