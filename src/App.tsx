// ── quant-carbon Dashboard ─────────────────────────────────────────────────

import { useEffect }         from 'react';
import { NavBar }            from './components/NavBar';
import { EquityDashboard }   from './pages/EquityDashboard';
import { CarbonDashboard }   from './pages/CarbonDashboard';
import { VaRDashboard }      from './pages/VaRDashboard';
import { usePricingStore }   from './store/pricingStore';

export default function App() {
  const { activeTab } = usePricingStore();

  return (
    <div className="min-h-screen bg-bg text-[#c9d8ea]" style={{ fontFamily: "'IBM Plex Mono', monospace" }}>
      <NavBar />
      <main>
        {activeTab === 'equity' && <EquityDashboard />}
        {activeTab === 'carbon' && <CarbonDashboard />}
        {activeTab === 'var'    && <VaRDashboard    />}
      </main>
      <footer className="text-center py-4 text-[10px] text-dim border-t border-border">
        quant-carbon · github.com/Rakshit309/quant-carbon · 78 tests passing
      </footer>
    </div>
  );
}