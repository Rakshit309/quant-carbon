// ── Parameter Input Panel ──────────────────────────────────────────────────

interface ParamPanelProps {
  params: Record<string, number | boolean>;
  onChange: (key: string, value: number | boolean) => void;
  fields: { key: string; label: string; desc: string; min: number; max: number; step: number }[];
  isCall: boolean;
  onTypeChange: (isCall: boolean) => void;
  title?: string;
  extras?: React.ReactNode;
}

export function ParamPanel({ params, onChange, fields, isCall, onTypeChange, title = 'PARAMETERS', extras }: ParamPanelProps) {
  const moneyness = (() => {
    const S = params.S as number;
    const K = params.K as number;
    if (S > K) return isCall ? 'ITM' : 'OTM';
    if (S < K) return isCall ? 'OTM' : 'ITM';
    return 'ATM';
  })();

  const mColor = moneyness === 'ITM' ? '#2dd67a' : moneyness === 'OTM' ? '#f05149' : '#f0a830';

  return (
    <div className="bg-surface border border-border rounded-lg p-3">
      <div className="text-[10px] text-dim tracking-widest mb-3">{title}</div>

      <div className="flex gap-2 mb-4">
        {[true, false].map(c => (
          <button
            key={String(c)}
            onClick={() => onTypeChange(c)}
            className="flex-1 py-1 text-xs rounded-md border transition-colors"
            style={{
              borderColor: isCall === c ? (c ? '#2dd67a' : '#f05149') : '#1a2d45',
              background:  isCall === c ? (c ? 'rgba(45,214,122,.1)' : 'rgba(240,81,73,.1)') : 'transparent',
              color:       isCall === c ? (c ? '#2dd67a' : '#f05149') : '#4a6480',
              fontFamily:  'inherit',
              fontWeight:  isCall === c ? 500 : 400,
            }}
          >
            {c ? 'Call' : 'Put'}
          </button>
        ))}
      </div>

      <div className="space-y-3">
        {fields.map(f => (
          <div key={f.key} className="flex items-center justify-between">
            <div>
              <div className="text-amber font-medium" style={{ fontSize: 14 }}>{f.label}</div>
              <div className="text-dim" style={{ fontSize: 10 }}>{f.desc}</div>
            </div>
            <input
              type="number"
              value={params[f.key] as number}
              step={f.step} min={f.min} max={f.max}
              onChange={e => onChange(f.key, parseFloat(e.target.value) || f.min)}
              className="w-16 bg-transparent border border-border rounded text-blue text-right outline-none focus:border-blue px-2 py-1"
              style={{ fontFamily: 'inherit', fontSize: 12 }}
            />
          </div>
        ))}
      </div>

      {extras}

      <div className="mt-3 pt-3 border-t border-border flex items-center gap-2">
        <span className="text-xs font-medium" style={{ color: mColor }}>{moneyness}</span>
        <span className="text-dim" style={{ fontSize: 10 }}>S/K = {((params.S as number) / (params.K as number)).toFixed(3)}</span>
      </div>
    </div>
  );
}