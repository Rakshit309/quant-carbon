// ── Parameter Panel with Range Sliders ────────────────────────────────────

interface Field {
  key:   string;
  label: string;
  desc:  string;
  min:   number;
  max:   number;
  step:  number;
  color?: string;
}

interface ParamPanelProps {
  params:       Record<string, number | boolean>;
  onChange:     (key: string, value: number | boolean) => void;
  fields:       Field[];
  isCall:       boolean;
  onTypeChange: (isCall: boolean) => void;
  title?:       string;
  extras?:      React.ReactNode;
}

function ParamSlider({
  label, desc, value, min, max, step, color = '#3b8bfd', onChange,
}: Field & { value: number; onChange: (v: number) => void }) {
  const pct = ((value - min) / (max - min)) * 100;

  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 5 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
          <span style={{ color, fontSize: 14, fontWeight: 600 }}>{label}</span>
          <span style={{ color: 'var(--dim)', fontSize: 10 }}>{desc}</span>
        </div>
        <input
          type="number"
          value={value}
          min={min} max={max} step={step}
          onChange={e => {
            const v = parseFloat(e.target.value);
            if (!isNaN(v) && v >= min && v <= max) onChange(v);
          }}
          style={{ borderColor: `${color}60`, color }}
        />
      </div>
      <div style={{ position: 'relative' }}>
        <input
          type="range"
          value={value} min={min} max={max} step={step}
          onChange={e => onChange(parseFloat(e.target.value))}
          style={{
            background: `linear-gradient(to right, ${color}80 ${pct}%, var(--border) ${pct}%)`,
          }}
        />
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 9, color: 'var(--dim)', marginTop: 2 }}>
        <span>{min}</span>
        <span style={{ color, fontSize: 10, fontWeight: 500 }}>{value}</span>
        <span>{max}</span>
      </div>
    </div>
  );
}

export function ParamPanel({
  params, onChange, fields, isCall, onTypeChange, title = 'PARAMETERS', extras,
}: ParamPanelProps) {
  const S = params.S as number;
  const K = params.K as number;

  const moneyness = S > K
    ? (isCall ? 'ITM' : 'OTM')
    : S < K
    ? (isCall ? 'OTM' : 'ITM')
    : 'ATM';

  const mColor = moneyness === 'ITM' ? 'var(--green)'
               : moneyness === 'OTM' ? 'var(--red)'
               : 'var(--amber)';

  return (
    <div className="qcard">
      {/* Title */}
      <div style={{ fontSize: 10, color: 'var(--dim)', letterSpacing: '.1em', marginBottom: 14 }}>
        {title}
      </div>

      {/* Call / Put toggle */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 18 }}>
        {([true, false] as const).map(c => (
          <button
            key={String(c)}
            onClick={() => onTypeChange(c)}
            style={{
              flex: 1, padding: '6px 0', fontSize: 12, fontFamily: 'inherit',
              borderRadius: 7, cursor: 'pointer', fontWeight: isCall === c ? 600 : 400,
              border: `1px solid ${isCall === c ? (c ? 'var(--green)' : 'var(--red)') : 'var(--border)'}`,
              background: isCall === c ? (c ? 'rgba(45,214,122,.1)' : 'rgba(240,81,73,.1)') : 'transparent',
              color: isCall === c ? (c ? 'var(--green)' : 'var(--red)') : 'var(--dim)',
              transition: 'all .15s',
            }}
          >
            {c ? 'Call' : 'Put'}
          </button>
        ))}
      </div>

      {/* Sliders */}
      {fields.map(f => (
        <ParamSlider
          {...f}
           key={f.key}
          value={params[f.key] as number}
          onChange={v => onChange(f.key, v)}
        />
      ))}

      {extras}

      {/* Moneyness badge */}
      <div style={{
        marginTop: 14, paddingTop: 12, borderTop: '1px solid var(--border)',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}>
        <span style={{
          fontSize: 12, fontWeight: 600, color: mColor,
          background: `${mColor}18`, border: `1px solid ${mColor}40`,
          borderRadius: 6, padding: '3px 10px',
        }}>
          {moneyness}
        </span>
        <span style={{ fontSize: 10, color: 'var(--dim)' }}>S/K = {(S / K).toFixed(3)}</span>
      </div>
    </div>
  );
}