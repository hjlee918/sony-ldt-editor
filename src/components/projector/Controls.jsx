// src/components/projector/Controls.jsx
import { useState, useEffect } from 'react';

export function SectionCard({ title, children }) {
  return (
    <div className="proj-card">
      <div className="proj-card-header">{title}</div>
      <div className="proj-card-body">{children}</div>
    </div>
  );
}

export function CtrlRow({ label, children, indent = false }) {
  return (
    <div className={`proj-ctrl-row${indent ? ' proj-ctrl-indent' : ''}`}>
      <span className="proj-label">{label}</span>
      <div className="proj-ctrl-value">{children}</div>
    </div>
  );
}

export function Slider({ label, value, min, max, onCommit, indent = false }) {
  const [local, setLocal] = useState(value ?? min);
  useEffect(() => { setLocal(value ?? min); }, [value, min]);
  return (
    <CtrlRow label={label} indent={indent}>
      <div className="proj-slider-group">
        <input type="range" min={min} max={max} value={local}
          onChange={e => setLocal(Number(e.target.value))}
          onPointerUp={e => onCommit(Number(e.target.value))} />
        <span className="proj-slider-val">{local}</span>
      </div>
    </CtrlRow>
  );
}

export function Select({ label, value, options, onChange, indent = false }) {
  return (
    <CtrlRow label={label} indent={indent}>
      <select className="proj-select" value={value ?? options[0][0]}
        onChange={e => onChange(Number(e.target.value))}>
        {options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
      </select>
    </CtrlRow>
  );
}

export function Toggle({ label, value, onChange, indent = false }) {
  return (
    <CtrlRow label={label} indent={indent}>
      <label className="proj-toggle">
        <input type="checkbox" checked={!!value}
          onChange={e => onChange(e.target.checked ? 1 : 0)} />
        <span className="proj-toggle-track" />
      </label>
    </CtrlRow>
  );
}
