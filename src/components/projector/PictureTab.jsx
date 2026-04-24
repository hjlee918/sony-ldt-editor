// src/components/projector/PictureTab.jsx
import { useState, useEffect } from 'react';
import { SectionCard, Slider, Select, Toggle, CtrlRow } from './Controls';
import ColorCorrection from './ColorCorrection';
import ColorTempCustom from './ColorTempCustom';

function sdcpToSigned(val) { return val > 0x7fff ? val - 0x10000 : val; }
function signedToSdcp(val) { return val < 0 ? val + 0x10000 : val; }

function CsSlider({ value, onCommit }) {
  const [local, setLocal] = useState(value ?? 0);
  useEffect(() => { setLocal(value ?? 0); }, [value]);
  return (
    <div className="cs-slider-cell">
      <input type="range" min={-100} max={100} value={local}
        onChange={e => setLocal(Number(e.target.value))}
        onPointerUp={e => onCommit(Number(e.target.value))}
        onKeyUp={e => {
          if (['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Home','End'].includes(e.key))
            onCommit(Number(e.target.value));
        }} />
      <span className="cs-slider-val">{local > 0 ? `+${local}` : local}</span>
    </div>
  );
}

const CALIB_OPTS     = [[0,'Cinema Film 1'],[1,'Cinema Film 2'],[2,'Reference'],[3,'TV'],[4,'Photo'],[5,'Game'],[6,'Bright Cinema'],[7,'Bright TV'],[8,'User']];
const COLOR_TEMP_OPTS = [[0,'D93'],[1,'D75'],[2,'D65'],[9,'D55'],[3,'Custom 1'],[4,'Custom 2'],[5,'Custom 3'],[6,'Custom 4'],[7,'Custom 5']];
const GAMMA_OPTS     = [[0,'Off'],[1,'1.8'],[2,'2.0'],[3,'2.1'],[4,'2.2'],[5,'2.4'],[6,'2.6'],[7,'Gamma 7'],[8,'Gamma 8'],[9,'Gamma 9'],[10,'Gamma 10']];
const MOTIONFLOW_OPTS = [[0,'Off'],[1,'Smooth High'],[2,'Smooth Low'],[3,'Impulse'],[4,'Combination'],[5,'True Cinema']];
const HDR_OPTS       = [[0,'Off'],[1,'HDR10'],[3,'HLG'],[2,'Auto']];
const IRIS_OPTS      = [[0,'Off'],[2,'Full'],[3,'Limited']];
const NR_OPTS        = [[0,'Off'],[1,'Low'],[2,'Medium'],[3,'High'],[4,'Auto']];
const CONTR_ENH_OPTS = [[0,'Off'],[1,'Low'],[2,'Middle'],[3,'High']];
const LAMP_OPTS      = [[0,'Low'],[1,'High']];
const SMOOTH_GRAD_OPTS = [[0,'Off'],[1,'Low'],[2,'Middle'],[3,'High']];
const FILM_MODE_OPTS = [[0,'Auto'],[1,'Off']];
const CLEAR_WHITE_OPTS = [[0,'Off'],[1,'Low'],[2,'High']];
const COLOR_SPACE_OPTS = [[0,'BT.709'],[8,'BT.2020'],[3,'CS1'],[4,'CS2'],[5,'CS3'],[6,'Custom']];

export default function PictureTab({ status, onSet, onKey }) {
  const hdrAuto = status.hdr === 2;
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <div className="picture-tab">

      {/* ── Left column ── */}
      <div className="picture-col">

        <SectionCard title="Calib Preset">
          <Select label="Mode" value={status.calibPreset ?? 0} options={CALIB_OPTS}
            onChange={v => onSet(0x00, 0x02, v)} />
        </SectionCard>

        <SectionCard title="Tone">
          <Slider label="Contrast"   value={status.contrast   ?? 50} min={0} max={100} onCommit={v => onSet(0x00, 0x11, v)} />
          <Slider label="Brightness" value={status.brightness ?? 50} min={0} max={100} onCommit={v => onSet(0x00, 0x10, v)} />
          <Slider label="Color"      value={status.color      ?? 50} min={0} max={100} onCommit={v => onSet(0x00, 0x12, v)} />
          <Slider label="Hue"        value={status.hue        ?? 50} min={0} max={100} onCommit={v => onSet(0x00, 0x13, v)} />
          <Slider label="Sharpness"  value={status.sharpness  ?? 10} min={0} max={100} onCommit={v => onSet(0x00, 0x24, v)} />
        </SectionCard>

        <SectionCard title="Color Temperature">
          <Select label="Preset" value={status.colorTemp ?? 2} options={COLOR_TEMP_OPTS}
            onChange={v => onSet(0x00, 0x17, v)} />
        </SectionCard>

        <ColorTempCustom status={status} onSet={onSet} />

        <SectionCard title="Cinema Black Pro">
          <Select label="Advanced Iris"     value={status.advancedIris     ?? 0} options={IRIS_OPTS}      onChange={v => onSet(0x00, 0x1d, v)} />
          <Slider label="Brightness"        value={status.irisAperture     ?? 0} min={0} max={100}        onCommit={v => onSet(0x00, 0x1a, v)} />
          <Select label="Contrast Enhancer" value={status.contrastEnhancer ?? 0} options={CONTR_ENH_OPTS} onChange={v => onSet(0x00, 0x1e, v)} />
          <Select label="Lamp Control"      value={status.lampControl      ?? 1} options={LAMP_OPTS}      onChange={v => onSet(0x00, 0x1f, v)} />
        </SectionCard>

      </div>

      {/* ── Center column ── */}
      <div className="picture-col">

        <SectionCard title="Processing">
          <Select label="Motionflow" value={status.motionflow ?? 0} options={MOTIONFLOW_OPTS}
            onChange={v => onSet(0x00, 0x59, v)} />
          <Toggle label="Reality Creation" value={status.realityCreation ?? 1}
            onChange={v => onSet(0x00, 0x20, v)} />
        </SectionCard>

        <SectionCard title="Expert — Noise">
          <Select label="NR"               value={status.nr              ?? 0} options={NR_OPTS}         onChange={v => onSet(0x00, 0x25, v)} />
          <Select label="MPEG NR"          value={status.mpegNr          ?? 0} options={NR_OPTS}         onChange={v => onSet(0x00, 0x26, v)} />
          <Select label="Smooth Gradation" value={status.smoothGradation ?? 0} options={SMOOTH_GRAD_OPTS} onChange={v => onSet(0x00, 0x27, v)} />
          <Select label="Film Mode"        value={status.filmMode        ?? 0} options={FILM_MODE_OPTS}  onChange={v => onSet(0x00, 0x23, v)} />
        </SectionCard>

        <SectionCard title="Expert — Gamma & HDR">
          <div className={hdrAuto ? 'proj-hdr-auto-group' : ''}>
            <Select label="Gamma Correction" value={status.gammaCorrection ?? 0} options={GAMMA_OPTS}
              onChange={v => onSet(0x00, 0x22, v)} />
            {hdrAuto && <div className="proj-hdr-auto-note">Auto-managed when HDR = Auto</div>}
          </div>
          <Select label="HDR" value={status.hdr ?? 3} options={HDR_OPTS}
            onChange={v => onSet(0x00, 0x7c, v)} />
          <div className={hdrAuto ? 'proj-hdr-auto-group' : ''}>
            <Select label="Color Space" value={status.colorSpace ?? 0} options={COLOR_SPACE_OPTS}
              onChange={v => onSet(0x00, 0x3b, v)} />
            {hdrAuto && <div className="proj-hdr-auto-note">Auto-managed when HDR = Auto</div>}
          </div>
          <div className="cs-channel-grid">
            <span className="cs-ch-hdr" />
            <span className="cs-ch-hdr">Cyan–Red</span>
            <span className="cs-ch-hdr">Mag–Green</span>
            {[
              ['R', 0x76, 0x77, 'csRCyanRed', 'csRMagGreen'],
              ['G', 0xa1, 0xa3, 'csGCyanRed', 'csGMagGreen'],
              ['B', 0xa2, 0xa4, 'csBCyanRed', 'csBMagGreen'],
            ].map(([ch, xCode, yCode, xField, yField]) => (
              <><span key={`${ch}-lbl`} className="cs-ch-label">{ch}</span>
              <CsSlider key={`${ch}-x`}
                value={sdcpToSigned(status[xField] ?? 0)}
                onCommit={v => onSet(0x00, xCode, signedToSdcp(v))} />
              <CsSlider key={`${ch}-y`}
                value={sdcpToSigned(status[yField] ?? 0)}
                onCommit={v => onSet(0x00, yCode, signedToSdcp(v))} /></>
            ))}
          </div>
          <Toggle label="Input Lag Reduction" value={status.inputLagReduction ?? 0}
            onChange={v => onSet(0x00, 0x99, v)} />
          <Select label="Clear White" value={status.clearWhite ?? 0} options={CLEAR_WHITE_OPTS}
            onChange={v => onSet(0x00, 0x28, v)} />
          <Toggle label="x.v.Color" value={status.xvColor ?? 0}
            onChange={v => onSet(0x00, 0x29, v)} />
        </SectionCard>

      </div>

      {/* ── Right column ── */}
      <div className="picture-col-wide">

        <ColorCorrection status={status} onSet={onSet} />

        <SectionCard title="Advanced Picture — Auto Calibration">
          <div className="proj-note">Requires 30+ min warm-up. Lens moves during Adjust.</div>
          <CtrlRow label="">
            <div className="proj-btn-row">
              <button className="btn btn-sm" onClick={() => onSet(0x00, 0xa0, 1)}>Pre Check</button>
              <button className="btn btn-sm" onClick={() => onSet(0x00, 0xa0, 2)}>Adjust</button>
              <button className="btn btn-sm" onClick={() => onSet(0x00, 0xa0, 3)}>Before/After</button>
            </div>
          </CtrlRow>
        </SectionCard>

        <SectionCard title="Menu Control">
          <CtrlRow label="">
            <button
              className={`btn btn-sm${menuOpen ? ' btn-accent' : ''}`}
              onClick={() => { onKey('menu'); setMenuOpen(v => !v); }}
            >&#9776; {menuOpen ? 'Close Menu' : 'Open Menu'}</button>
          </CtrlRow>
          <div className="menu-nav-dpad">
            <button className="btn btn-sm menu-nav-up"    onClick={() => onKey('up')}>▲</button>
            <button className="btn btn-sm menu-nav-left"  onClick={() => onKey('left')}>◀</button>
            <button className="btn btn-sm menu-nav-ok"    onClick={() => onKey('enter')}>OK</button>
            <button className="btn btn-sm menu-nav-right" onClick={() => onKey('right')}>▶</button>
            <button className="btn btn-sm menu-nav-down"  onClick={() => onKey('down')}>▼</button>
          </div>
        </SectionCard>

      </div>
    </div>
  );
}
