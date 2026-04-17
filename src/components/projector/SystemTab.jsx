// src/components/projector/SystemTab.jsx
import { SectionCard, Select, Slider, Toggle, CtrlRow } from './Controls';

const ASPECT_OPTS     = [[0,'Normal'],[1,'V Stretch'],[2,'Squeeze'],[3,'Stretch'],[4,'1.85:1 Zoom'],[5,'2.35:1 Zoom']];
const DYN_RANGE_OPTS  = [[0,'Auto'],[1,'Limited'],[2,'Full']];
const HDMI_FMT_OPTS   = [[0,'Standard'],[1,'Enhanced']];
const D3_DISP_OPTS    = [[0,'Auto'],[1,'3D'],[2,'2D']];
const D3_FMT_OPTS     = [[0,'Simulated 3D'],[1,'Side-by-Side'],[2,'Over-Under']];
const D3_BRI_OPTS     = [[0,'Standard'],[1,'High']];
const IMAGE_FLIP_OPTS = [[0,'Off'],[1,'HV'],[2,'H'],[3,'V']];
const INPUT_OPTS      = [[0,'HDMI 1'],[1,'HDMI 2']];
const POWER_SAVING_OPTS = [[0,'Off'],[1,'Standby']];

export default function SystemTab({ status, onSet }) {
  return (
    <div className="system-tab">

      {/* ── Left: Screen ── */}
      <div className="system-col">
        <SectionCard title="Screen">
          <Select label="Aspect" value={status.aspect ?? 0} options={ASPECT_OPTS}
            onChange={v => onSet(0x00, 0x3c, v)} />
          <Slider label="Blanking Left"   value={status.blankLeft   ?? 0} min={0} max={20} onCommit={v => onSet(0x00, 0x78, v)} />
          <Slider label="Blanking Right"  value={status.blankRight  ?? 0} min={0} max={20} onCommit={v => onSet(0x00, 0x79, v)} />
          <Slider label="Blanking Top"    value={status.blankTop    ?? 0} min={0} max={20} onCommit={v => onSet(0x00, 0x7a, v)} />
          <Slider label="Blanking Bottom" value={status.blankBottom ?? 0} min={0} max={20} onCommit={v => onSet(0x00, 0x7b, v)} />
        </SectionCard>
      </div>

      {/* ── Center: Function ── */}
      <div className="system-col">
        <SectionCard title="Function">
          <Select label="Dynamic Range"  value={status.dynamicRange ?? 0} options={DYN_RANGE_OPTS} onChange={v => onSet(0x00, 0x60, v)} />
          <Select label="HDMI Format"    value={status.hdmiFormat   ?? 0} options={HDMI_FMT_OPTS}  onChange={v => onSet(0x00, 0x61, v)} />
          <Toggle label="Test Pattern"   value={status.testPattern  ?? 0} onChange={v => onSet(0x00, 0x63, v)} />
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
          <Select label="Input" value={status.inputSelect ?? 0} options={INPUT_OPTS}
            onChange={v => onSet(0x00, 0x03, v)} />
        </SectionCard>

        <SectionCard title="Setup">
          <Toggle label="High Altitude Mode" value={status.altitudeMode  ?? 0} onChange={v => onSet(0x00, 0x64, v)} />
          <Toggle label="Remote Start"       value={status.remoteStart   ?? 0} onChange={v => onSet(0x00, 0x68, v)} />
          <Toggle label="Network Management" value={status.networkMgmt   ?? 0} onChange={v => onSet(0x00, 0x69, v)} />
          <Select label="Power Saving"       value={status.powerSaving   ?? 0} options={POWER_SAVING_OPTS} onChange={v => onSet(0x00, 0x6a, v)} />
          <CtrlRow label="Factory Reset">
            <button className="btn btn-sm btn-danger" onClick={() => {
              if (window.confirm('Reset ALL settings to factory defaults?')) onSet(0x00, 0xff, 1);
            }}>All Reset</button>
          </CtrlRow>
        </SectionCard>

        <SectionCard title="Installation">
          <Select label="Image Flip"      value={status.imageFlip      ?? 0} options={IMAGE_FLIP_OPTS} onChange={v => onSet(0x00, 0x62, v)} />
          <Toggle label="Lens Control"    value={status.lensControl    ?? 1}                           onChange={v => onSet(0x00, 0x6b, v)} />
          <Toggle label="IR Receiver Front" value={status.irFront      ?? 1}                           onChange={v => onSet(0x00, 0x6c, v)} />
          <Toggle label="IR Receiver Rear"  value={status.irRear       ?? 1}                           onChange={v => onSet(0x00, 0x6d, v)} />
        </SectionCard>

      </div>
    </div>
  );
}
