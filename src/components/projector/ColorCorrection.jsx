// src/components/projector/ColorCorrection.jsx
import { useState, useEffect } from 'react';
import { SectionCard } from './Controls';

function sdcpToSigned(val) { return val > 0x7fff ? val - 0x10000 : val; }
function signedToSdcp(val) { return val < 0 ? val + 0x10000 : val; }

function CcSlider({ value, min, max, onCommit }) {
  const signed = sdcpToSigned(value ?? 0);
  const [local, setLocal] = useState(signed);
  useEffect(() => { setLocal(sdcpToSigned(value ?? 0)); }, [value]);
  return (
    <div className="cc-cell">
      <input
        type="range" min={min} max={max} value={local}
        onChange={e => setLocal(Number(e.target.value))}
        onPointerUp={e => onCommit(signedToSdcp(Number(e.target.value)))}
        onKeyUp={e => {
          if (['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Home','End'].includes(e.key)) {
            onCommit(signedToSdcp(Number(e.target.value)));
          }
        }}
        className="cc-range"
      />
      <span className="cc-val">{local}</span>
    </div>
  );
}

const CC_ROWS = [
  { key: 'R', label: 'Red',     dot: '#d94f4f', items: [0x87, 0x88, 0x89], fields: ['ccRHue','ccRSat','ccRBri'] },
  { key: 'Y', label: 'Yellow',  dot: '#c8a020', items: [0x8a, 0x8b, 0x8c], fields: ['ccYHue','ccYSat','ccYBri'] },
  { key: 'G', label: 'Green',   dot: '#3c9a50', items: [0x8d, 0x8e, 0x8f], fields: ['ccGHue','ccGSat','ccGBri'] },
  { key: 'C', label: 'Cyan',    dot: '#0e8a82', items: [0x90, 0x91, 0x92], fields: ['ccCHue','ccCSat','ccCBri'] },
  { key: 'B', label: 'Blue',    dot: '#3060c0', items: [0x93, 0x94, 0x95], fields: ['ccBHue','ccBSat','ccBBri'] },
  { key: 'M', label: 'Magenta', dot: '#a040a0', items: [0x96, 0x97, 0x98], fields: ['ccMHue','ccMSat','ccMBri'] },
];

export default function ColorCorrection({ status, onSet }) {
  return (
    <SectionCard title="Color Correction">
      <div className="cc-grid">
        <div className="cc-grid-header">
          <div className="cc-col-label" />
          <div className="cc-col-header">Hue</div>
          <div className="cc-col-header">Saturation</div>
          <div className="cc-col-header">Brightness</div>
        </div>
        {CC_ROWS.map(({ key, label, dot, items, fields }) => (
          <div key={key} className="cc-grid-row">
            <div className="cc-col-label">
              <span className="cc-dot" style={{ background: dot }} />
              {label}
            </div>
            {/* Hue and Saturation: -50 to +50 */}
            <CcSlider value={status[fields[0]] ?? 0} min={-50} max={50}
              onCommit={v => onSet(0x00, items[0], v)} />
            <CcSlider value={status[fields[1]] ?? 0} min={-50} max={50}
              onCommit={v => onSet(0x00, items[1], v)} />
            {/* Brightness: -30 to +30 */}
            <CcSlider value={status[fields[2]] ?? 0} min={-30} max={30}
              onCommit={v => onSet(0x00, items[2], v)} />
          </div>
        ))}
      </div>
    </SectionCard>
  );
}
