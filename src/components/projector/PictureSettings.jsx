import { useState, useEffect } from 'react';

const COLOR_TEMP_OPTS  = [[0,'D93'],[1,'D75'],[2,'D65'],[3,'Custom1'],[4,'Custom2'],[5,'Custom3'],[6,'Custom4'],[7,'Custom5'],[9,'D55']];
const COLOR_SPACE_OPTS = [[0,'BT.709'],[3,'CS1'],[4,'CS2'],[5,'CS3'],[6,'Custom'],[8,'BT.2020']];
const MOTIONFLOW_OPTS  = [[0,'Off'],[1,'Smooth High'],[2,'Smooth Low'],[3,'Impulse'],[4,'Combination'],[5,'True Cinema']];
const HDR_OPTS         = [[0,'Off'],[1,'On'],[2,'Auto']];
const IRIS_OPTS        = [[0,'Off'],[2,'Full'],[3,'Limited']];
const NR_OPTS          = [[0,'Off'],[1,'Low'],[2,'Medium'],[3,'High'],[4,'Auto']];

function sdcpToSigned(val) { return val > 0x7fff ? val - 0x10000 : val; }
function signedToSdcp(val) { return val < 0 ? val + 0x10000 : val; }

/** Range slider — fires onCommit only on pointer-up, not on every pixel. */
function Slider({ label, value, min, max, onCommit }) {
  const [local, setLocal] = useState(value);
  useEffect(() => { setLocal(value); }, [value]);
  return (
    <div className="proj-ctrl-row">
      <span className="proj-label">{label}</span>
      <div className="proj-slider-group">
        <input
          type="range" min={min} max={max} value={local}
          onChange={e => setLocal(Number(e.target.value))}
          onPointerUp={e => onCommit(Number(e.target.value))}
        />
        <span className="proj-slider-val">{local}</span>
      </div>
    </div>
  );
}

function Select({ label, value, options, onChange }) {
  return (
    <div className="proj-ctrl-row">
      <span className="proj-label">{label}</span>
      <select className="proj-select" value={value} onChange={e => onChange(Number(e.target.value))}>
        {options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
      </select>
    </div>
  );
}

export default function PictureSettings({ status, onSet }) {
  const isCustomCS = status.colorSpace === 6;

  return (
    <div className="proj-picture-settings">
      <div className="proj-section-label">PICTURE</div>
      <Slider label="Brightness"    value={status.brightness ?? 50}   min={0} max={100}
        onCommit={v => onSet(0x00, 0x10, v)} />
      <Slider label="Contrast"      value={status.contrast ?? 50}     min={0} max={100}
        onCommit={v => onSet(0x00, 0x11, v)} />
      <Select label="Color Temp"    value={status.colorTemp ?? 2}     options={COLOR_TEMP_OPTS}
        onChange={v => onSet(0x00, 0x17, v)} />
      <Select label="Color Space"   value={status.colorSpace ?? 0}    options={COLOR_SPACE_OPTS}
        onChange={v => onSet(0x00, 0x3b, v)} />
      {isCustomCS && (
        <>
          <Slider label="Cyan–Red"      value={sdcpToSigned(status.csCustomCyanRed ?? 0)}  min={-100} max={100}
            onCommit={v => onSet(0x00, 0x76, signedToSdcp(v))} />
          <Slider label="Magenta–Green" value={sdcpToSigned(status.csCustomMagGreen ?? 0)} min={-100} max={100}
            onCommit={v => onSet(0x00, 0x77, signedToSdcp(v))} />
        </>
      )}
      <Select label="Motionflow"    value={status.motionflow ?? 0}    options={MOTIONFLOW_OPTS}
        onChange={v => onSet(0x00, 0x59, v)} />
      <Select label="HDR"           value={status.hdr ?? 2}           options={HDR_OPTS}
        onChange={v => onSet(0x00, 0x7c, v)} />
      <Select label="Advanced Iris" value={status.advancedIris ?? 0}  options={IRIS_OPTS}
        onChange={v => onSet(0x00, 0x1d, v)} />
      <Select label="NR"            value={status.nr ?? 0}            options={NR_OPTS}
        onChange={v => onSet(0x00, 0x25, v)} />
    </div>
  );
}
