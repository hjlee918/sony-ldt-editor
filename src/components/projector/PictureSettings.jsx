
const COLOR_TEMP_OPTS = [
  { value: 0, label: 'D93' }, { value: 1, label: 'D75' }, { value: 2, label: 'D65' },
  { value: 3, label: 'Custom1' }, { value: 4, label: 'Custom2' }, { value: 5, label: 'Custom3' },
  { value: 6, label: 'Custom4' }, { value: 7, label: 'Custom5' }, { value: 9, label: 'D55' },
];

const COLOR_SPACE_OPTS = [
  { value: 0, label: 'BT.709' }, { value: 3, label: 'CS1' }, { value: 4, label: 'CS2' },
  { value: 5, label: 'CS3' }, { value: 6, label: 'Custom' }, { value: 8, label: 'BT.2020' },
];

const MOTIONFLOW_OPTS = [
  { value: 0, label: 'Off' }, { value: 1, label: 'Smooth High' }, { value: 2, label: 'Smooth Low' },
  { value: 3, label: 'Impulse' }, { value: 4, label: 'Combination' }, { value: 5, label: 'True Cinema' },
];

const HDR_OPTS = [
  { value: 0, label: 'Off' }, { value: 1, label: 'On' }, { value: 2, label: 'Auto' },
];

const IRIS_OPTS = [
  { value: 0, label: 'Off' }, { value: 2, label: 'Full' }, { value: 3, label: 'Limited' },
];

const NR_OPTS = [
  { value: 0, label: 'Off' }, { value: 1, label: 'Low' }, { value: 2, label: 'Medium' },
  { value: 3, label: 'High' }, { value: 4, label: 'Auto' },
];

// Color correction: 6 axes × 3 params. Item codes 00h 87h-98h (see spec table).
const CC_AXES = ['Red', 'Yellow', 'Green', 'Cyan', 'Blue', 'Magenta'];
const CC_PARAMS = ['Hue', 'Sat', 'Bri'];
// Item codes start at 0x87 for Red Hue, sequential through 0x98 for Magenta Brightness
function ccItemCode(axisIndex, paramIndex) {
  return 0x87 + axisIndex * 3 + paramIndex;
}
function ccRange(paramIndex) {
  // Hue/Sat: -50 to +50 (FFCEh-0032h), Bri: -30 to +30 (FFE2h-001Eh)
  return paramIndex < 2 ? { min: -50, max: 50 } : { min: -30, max: 30 };
}
function sdcpToSigned(val) {
  // Convert uint16 SDCP value to signed int16
  return val > 0x7fff ? val - 0x10000 : val;
}
function signedToSdcp(val) {
  return val < 0 ? val + 0x10000 : val;
}

function Dropdown({ label, value, opts, upper, lower, onSet }) {
  return (
    <div className="proj-row">
      <span className="proj-label">{label}</span>
      <select
        value={value ?? ''}
        onChange={(e) => onSet(upper, lower, parseInt(e.target.value))}
        className="proj-select"
      >
        {opts.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </div>
  );
}

function Slider({ label, value, min, max, upper, lower, onSet, transform }) {
  return (
    <div className="proj-slider-row">
      <div className="proj-slider-header">
        <span className="proj-label">{label}</span>
        <span className="proj-value">{value ?? '–'}</span>
      </div>
      <input
        type="range" min={min} max={max}
        value={value ?? min}
        onChange={(e) => {
          const v = parseInt(e.target.value);
          onSet(upper, lower, transform ? transform(v) : v);
        }}
        className="proj-slider"
      />
    </div>
  );
}

export default function PictureSettings({ status, onSet }) {
  const isCustomColorSpace = status.colorSpace === 6;

  return (
    <div className="proj-picture-settings">
      <div className="proj-section-label">PICTURE</div>
      <Slider label="Brightness" value={status.brightness} min={0} max={100} upper={0x00} lower={0x10} onSet={onSet} />
      <Slider label="Contrast"   value={status.contrast}   min={0} max={100} upper={0x00} lower={0x11} onSet={onSet} />
      <Dropdown label="Color Temp"  value={status.colorTemp}  opts={COLOR_TEMP_OPTS}  upper={0x00} lower={0x17} onSet={onSet} />
      <Dropdown label="Color Space" value={status.colorSpace} opts={COLOR_SPACE_OPTS} upper={0x00} lower={0x3b} onSet={onSet} />
      {isCustomColorSpace && (
        <>
          <Slider label="Cyan–Red"      value={sdcpToSigned(status.csCustomCyanRed ?? 0)}    min={-50} max={50} upper={0x00} lower={0x76} onSet={onSet} transform={signedToSdcp} />
          <Slider label="Magenta–Green" value={sdcpToSigned(status.csCustomMagGreen ?? 0)}   min={-50} max={50} upper={0x00} lower={0x77} onSet={onSet} transform={signedToSdcp} />
        </>
      )}
      <Dropdown label="Motionflow"   value={status.motionflow}       opts={MOTIONFLOW_OPTS} upper={0x00} lower={0x59} onSet={onSet} />
      <Dropdown label="HDR"          value={status.hdr}              opts={HDR_OPTS}        upper={0x00} lower={0x7c} onSet={onSet} />
      <Dropdown label="Advanced Iris" value={status.advancedIris}   opts={IRIS_OPTS}       upper={0x00} lower={0x1d} onSet={onSet} />
      <Dropdown label="NR"           value={status.nr}               opts={NR_OPTS}         upper={0x00} lower={0x25} onSet={onSet} />

      <div className="proj-section-label" style={{ marginTop: 16 }}>COLOR CORRECTION</div>
      <div className="cc-grid">
        <div className="cc-header-row">
          <span></span>
          {CC_PARAMS.map(p => <span key={p} className="cc-col-label">{p}</span>)}
        </div>
        {CC_AXES.map((axis, ai) => (
          <div key={axis} className="cc-row">
            <span className="cc-axis-label">{axis}</span>
            {CC_PARAMS.map((_, pi) => {
              const { min, max } = ccRange(pi);
              const rawVal = status[`cc_${axis.toLowerCase()}_${CC_PARAMS[pi].toLowerCase()}`] ?? 0;
              const signedVal = sdcpToSigned(rawVal);
              return (
                <input
                  key={pi}
                  type="range"
                  min={min} max={max}
                  value={signedVal}
                  onChange={(e) => onSet(0x00, ccItemCode(ai, pi), signedToSdcp(parseInt(e.target.value)))}
                  className="cc-slider"
                />
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}
