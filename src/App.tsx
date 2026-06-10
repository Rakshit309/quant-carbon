// ── quant-carbon Dashboard ─────────────────────────────────────────────────

import { NavBar }          from './components/NavBar';
import { EquityDashboard } from './pages/EquityDashboard';
import { CarbonDashboard } from './pages/CarbonDashboard';
import { VaRDashboard }    from './pages/VaRDashboard';
import { usePricingStore } from './store/pricingStore';

export default function App() {
  const { activeTab } = usePricingStore();

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)', color: 'var(--text)', fontFamily: "'IBM Plex Mono', monospace" }}>
      <NavBar />

      <main style={{ maxWidth: 1200, margin: '0 auto' }}>
        <div className="fade-in" key={activeTab}>
          {activeTab === 'equity' && <EquityDashboard />}
          {activeTab === 'carbon' && <CarbonDashboard />}
          {activeTab === 'var'    && <VaRDashboard    />}
        </div>
      </main>

      <footer style={{
        textAlign: 'center', padding: '16px 0', marginTop: 20,
        fontSize: 10, color: 'var(--dim)',
        borderTop: '1px solid var(--border)',
      }}>
        quant-carbon &nbsp;·&nbsp; github.com/Rakshit309/quant-carbon &nbsp;·&nbsp;
        <span style={{ color: 'var(--green)' }}>78 tests passing</span> &nbsp;·&nbsp;
        <a href="https://rakshit309.mintlify.app" target="_blank"
          style={{ color: 'var(--blue)', textDecoration: 'none' }}>
          docs ↗
        </a>
      </footer>
    </div>
  );
}