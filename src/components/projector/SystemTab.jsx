// src/components/projector/SystemTab.jsx
import { useState, useRef, useEffect } from 'react';
import { SectionCard, Select, Slider, Toggle, CtrlRow } from './Controls';

const LENS_MODES = [
  { key: 'focus', label: 'Focus' },
  { key: 'zoom',  label: 'Zoom'  },
  { key: 'shift', label: 'Shift' },
];

const LENS_KEYS = {
  focus: { up: 'lens_focus_far', down: 'lens_focus_near' },
  zoom:  { up: 'lens_zoom_up',   down: 'lens_zoom_down'  },
  shift: { up: 'lens_shift_up', down: 'lens_shift_down', left: 'lens_shift_left', right: 'lens_shift_right' },
};

const REPEAT_DELAY_MS = 400;
const REPEAT_RATE_MS  = 120;

function LensAdjustment({ onKey }) {
  const [mode, setMode] = useState(null);
  const timerRef = useRef(null);
  const keys = mode ? LENS_KEYS[mode] : null;

  useEffect(() => () => stopRepeat(), []);

  function stopRepeat() {
    if (timerRef.current) { clearTimeout(timerRef.current); clearInterval(timerRef.current); timerRef.current = null; }
  }

  function startRepeat(keyCode) {
    stopRepeat();
    onKey(keyCode);
    timerRef.current = setTimeout(() => {
      timerRef.current = setInterval(() => onKey(keyCode), REPEAT_RATE_MS);
    }, REPEAT_DELAY_MS);
  }

  return (
    <SectionCard title="Lens Adjustment">
      <div className="proj-note">Hold a direction to repeat.</div>
      <div className="lens-mode-btns">
        {LENS_MODES.map(m => (
          <button
            key={m.key}
            className={'btn btn-sm' + (mode === m.key ? ' btn-accent' : '')}
            onClick={() => setMode(v => v === m.key ? null : m.key)}
          >{m.label}</button>
        ))}
      </div>
      {keys && (
        <>
          <div className="lens-dpad">
            <button className="btn btn-sm lens-dpad-up"
              onMouseDown={() => startRepeat(keys.up)} onMouseUp={stopRepeat} onMouseLeave={stopRepeat}>▲</button>
            {keys.left  && <button className="btn btn-sm lens-dpad-left"
              onMouseDown={() => startRepeat(keys.left)}  onMouseUp={stopRepeat} onMouseLeave={stopRepeat}>◀</button>}
            <button className="btn btn-sm lens-dpad-center" onClick={() => onKey('enter')} title="Confirm">✓</button>
            {keys.right && <button className="btn btn-sm lens-dpad-right"
              onMouseDown={() => startRepeat(keys.right)} onMouseUp={stopRepeat} onMouseLeave={stopRepeat}>▶</button>}
            <button className="btn btn-sm lens-dpad-down"
              onMouseDown={() => startRepeat(keys.down)} onMouseUp={stopRepeat} onMouseLeave={stopRepeat}>▼</button>
          </div>
          <div className="lens-dpad-actions">
            <button className="btn btn-sm btn-danger" onClick={() => onKey('reset')}>Exit</button>
          </div>
        </>
      )}
    </SectionCard>
  );
}

const PIC_POS_SLOTS = [
  { key: '1.85_1', label: '1.85:1' },
  { key: '2.35_1', label: '2.35:1' },
  { key: 'custom1', label: 'Custom 1' },
  { key: 'custom2', label: 'Custom 2' },
  { key: 'custom3', label: 'Custom 3' },
];

function PicturePosition({ onPicPos }) {
  const [active, setActive] = useState(null);
  return (
    <SectionCard title="Picture Position">
      <div className="proj-note">Lens moves when loading a position.</div>
      <div className="pic-pos-slots">
        {PIC_POS_SLOTS.map(s => (
          <button
            key={s.key}
            className={'btn btn-sm' + (active === s.key ? ' btn-accent' : '')}
            onClick={() => setActive(v => v === s.key ? null : s.key)}
          >{s.label}</button>
        ))}
      </div>
      {active && (
        <div className="pic-pos-actions">
          <button className="btn btn-sm btn-accent" onClick={() => onPicPos('sel', active)}>Load</button>
          <button className="btn btn-sm" onClick={() => onPicPos('save', active)}>Save</button>
          <button className="btn btn-sm btn-danger" onClick={() => {
            if (window.confirm(`Delete position "${PIC_POS_SLOTS.find(s => s.key === active)?.label}"?`))
              onPicPos('del', active);
          }}>Delete</button>
        </div>
      )}
    </SectionCard>
  );
}

const ASPECT_OPTS     = [[0,'Normal'],[1,'V Stretch'],[2,'Squeeze'],[3,'Stretch'],[4,'1.85:1 Zoom'],[5,'2.35:1 Zoom']];
const DYN_RANGE_OPTS  = [[0,'Auto'],[1,'Limited'],[2,'Full']];
const HDMI_FMT_OPTS   = [[0,'Standard'],[1,'Enhanced']];
const D3_DISP_OPTS    = [[0,'Auto'],[1,'3D'],[2,'2D']];
const D3_FMT_OPTS     = [[0,'Simulated 3D'],[1,'Side-by-Side'],[2,'Over-Under']];
const D3_BRI_OPTS     = [[0,'Standard'],[1,'High']];
const IMAGE_FLIP_OPTS = [[0,'Off'],[1,'HV'],[2,'H'],[3,'V']];
const INPUT_OPTS      = [[1,'HDMI 1'],[2,'HDMI 2']];
const POWER_SAVING_OPTS = [[0,'Off'],[1,'Standby']];

export default function SystemTab({ status, onSet, onPicPos, onKey, onFactoryReset, onCalibReset }) {
  const [resetsOpen, setResetsOpen] = useState(false);
  return (
    <div className="system-tab">

      {/* ── Left: Screen + Position + Lens ── */}
      <div className="system-col">
        <SectionCard title="Screen">
          <Select label="Aspect" value={status.aspect ?? 0} options={ASPECT_OPTS}
            onChange={v => onSet(0x00, 0x3c, v)} />
          <Toggle label="Blanking" value={status.blankingEnabled ?? 0} onChange={v => onSet(0x00, 0x7d, v)} />
          <Slider label="Blanking Left"   value={status.blankLeft   ?? 0} min={0} max={20} onCommit={v => onSet(0x00, 0x78, v)} />
          <Slider label="Blanking Right"  value={status.blankRight  ?? 0} min={0} max={20} onCommit={v => onSet(0x00, 0x79, v)} />
          <Slider label="Blanking Top"    value={status.blankTop    ?? 0} min={0} max={20} onCommit={v => onSet(0x00, 0x7a, v)} />
          <Slider label="Blanking Bottom" value={status.blankBottom ?? 0} min={0} max={20} onCommit={v => onSet(0x00, 0x7b, v)} />
        </SectionCard>
        <PicturePosition onPicPos={onPicPos} />
        <LensAdjustment onKey={onKey} />
      </div>

      {/* ── Center: Function ── */}
      <div className="system-col">
        <SectionCard title="Function">
          <div className="proj-ctrl-row" style={{ paddingBottom: 0 }}>
            <span className="proj-label" style={{ fontWeight: 600, color: 'var(--text3)', fontSize: 11 }}>HDMI 1</span>
          </div>
          <Select label="Dynamic Range"  value={status.dynamicRangeH1 ?? 0} options={DYN_RANGE_OPTS} onChange={v => onSet(0x00, 0x60, v)} indent />
          <Select label="Signal Format"  value={status.hdmiFormatH1   ?? 0} options={HDMI_FMT_OPTS}  onChange={v => onSet(0x00, 0x61, v)} indent />
          <div className="proj-ctrl-row" style={{ paddingBottom: 0, paddingTop: 6 }}>
            <span className="proj-label" style={{ fontWeight: 600, color: 'var(--text3)', fontSize: 11 }}>HDMI 2</span>
          </div>
          <Select label="Dynamic Range"  value={status.dynamicRangeH2 ?? 0} options={DYN_RANGE_OPTS} onChange={v => onSet(0x00, 0x6e, v)} indent />
          <Select label="Signal Format"  value={status.hdmiFormatH2   ?? 0} options={HDMI_FMT_OPTS}  onChange={v => onSet(0x00, 0x6f, v)} indent />
          <Toggle label="Test Pattern"   value={status.testPattern     ?? 0} onChange={v => onSet(0x00, 0x63, v)} />
        </SectionCard>

        <SectionCard title="3D Settings">
          <Select label="2D-3D Display"   value={status.d3Display    ?? 0} options={D3_DISP_OPTS}  onChange={v => onSet(0x00, 0x65, v)} />
          <Select label="3D Format"       value={status.d3Format     ?? 0} options={D3_FMT_OPTS}   onChange={v => onSet(0x00, 0x66, v)} />
          <Select label="3D Brightness"   value={status.d3Brightness ?? 0} options={D3_BRI_OPTS}   onChange={v => onSet(0x00, 0x67, v)} />
        </SectionCard>
      </div>

      {/* ── Right: Power + Setup + Installation ── */}
      <div className="system-col">

        <SectionCard title="Power & Input">
          <CtrlRow label="">
            <div className="proj-btn-row">
              <button className="btn btn-sm btn-accent" onClick={() => onSet(0x01, 0x30, 1)}>&#x23FB; Power On</button>
              <button className="btn btn-sm btn-danger"  onClick={() => onSet(0x01, 0x30, 0)}>&#x23FB; Standby</button>
            </div>
          </CtrlRow>
          <Select label="Input" value={status.inputSelect ?? 1} options={INPUT_OPTS}
            onChange={v => onSet(0x00, 0x03, v)} />
        </SectionCard>

        <SectionCard title="Setup">
          <Toggle label="High Altitude Mode" value={status.altitudeMode  ?? 0} onChange={v => onSet(0x00, 0x64, v)} />
          <Toggle label="Remote Start"       value={status.remoteStart   ?? 0} onChange={v => onSet(0x00, 0x68, v)} />
          <Toggle label="Network Management" value={status.networkMgmt   ?? 0} onChange={v => onSet(0x00, 0x69, v)} />
          <Select label="Power Saving"       value={status.powerSaving   ?? 0} options={POWER_SAVING_OPTS} onChange={v => onSet(0x00, 0x6a, v)} />
        </SectionCard>

        <SectionCard title="Installation">
          <Select label="Image Flip"      value={status.imageFlip      ?? 0} options={IMAGE_FLIP_OPTS} onChange={v => onSet(0x00, 0x62, v)} />
          <Toggle label="Lens Control"    value={status.lensControl    ?? 1}                           onChange={v => onSet(0x00, 0x6b, v)} />
          <Select label="IR Receiver" value={status.irReceiver ?? 0} options={[[0,'Front+Rear'],[1,'Front'],[2,'Rear']]} onChange={v => onSet(0x00, 0x6c, v)} />
        </SectionCard>

        {/* Collapsible RESETS card */}
        <div className="proj-card">
          <div className="proj-card-header proj-card-header-toggle" onClick={() => setResetsOpen(v => !v)}>
            RESETS <span style={{ float: 'right' }}>{resetsOpen ? '▾' : '▸'}</span>
          </div>
          {resetsOpen && (
            <div className="proj-card-body">
              <CtrlRow label="Reset Preset">
                <button className="btn btn-sm btn-danger" onClick={() => {
                  if (window.confirm('Reset current preset to defaults?')) onSet(0x00, 0x00, 0);
                }}>Reset to Defaults</button>
              </CtrlRow>
              <CtrlRow label="Factory Reset">
                <button className="btn btn-sm btn-danger" onClick={() => {
                  if (window.confirm('Reset ALL settings to factory defaults?')) onFactoryReset?.();
                }}>All Reset</button>
              </CtrlRow>
              <CtrlRow label="Calibration Reset">
                <button className="btn btn-sm btn-danger" onClick={() => {
                  if (window.confirm('Reset auto-calibration data?')) onCalibReset?.();
                }}>Reset</button>
              </CtrlRow>
            </div>
          )}
        </div>

      </div>
    </div>
  );
}
