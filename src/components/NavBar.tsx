// ── Navigation Bar ─────────────────────────────────────────────────────────

import { usePricingStore } from '../store/pricingStore';

export function NavBar() {
  const { activeTab, setActiveTab } = usePricingStore();

  const tabs = [
    { id: 'equity' as const, label: 'Equity Options',    sub: 'Black-Scholes · GBM'       },
    { id: 'carbon' as const, label: 'Carbon EUA',        sub: 'Bachelier-OU · calibrated'  },
    { id: 'var'    as const, label: 'Portfolio VaR',     sub: 'MC full revaluation'        },
  ];

  return (
    <header className="border-b border-border px-4 py-3 flex items-center gap-3">
      <div className="flex items-center gap-2">
        <span className="text-[11px] font-bold text-blue bg-blue/10 border border-blue/30 rounded px-2 py-0.5 tracking-widest">
          QC
        </span>
        <div>
          <div className="font-bold text-[15px] tracking-tight" style={{ fontFamily: "'Syne', sans-serif", color: '#e8f2ff' }}>
            quant-carbon
          </div>
          <div className="text-[10px] text-dim">
            live · quant-carbon.shoumyadeep309.workers.dev
          </div>
        </div>
      </div>

      <nav className="flex gap-1 ml-6">
        {tabs.map(t => (
          <button
            key={t.id}
            onClick={() => setActiveTab(t.id)}
            className="px-3 py-2 rounded-lg text-left transition-colors"
            style={{
              background:   activeTab === t.id ? 'rgba(59,139,253,.1)' : 'transparent',
              border:       `0.5px solid ${activeTab === t.id ? 'rgba(59,139,253,.4)' : 'transparent'}`,
              fontFamily:   'inherit',
              cursor:       'pointer',
            }}
          >
            <div className="text-xs font-medium" style={{ color: activeTab === t.id ? '#3b8bfd' : '#c9d8ea' }}>
              {t.label}
            </div>
            <div className="text-[10px] text-dim">{t.sub}</div>
          </button>
        ))}
      </nav>

      <div className="ml-auto flex items-center gap-2">
        <span className="text-[10px] text-dim">78 tests passing</span>
        <span className="w-1.5 h-1.5 rounded-full bg-green inline-block" />
      </div>
    </header>
  );
}