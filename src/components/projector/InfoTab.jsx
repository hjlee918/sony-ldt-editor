// src/components/projector/InfoTab.jsx

function InfoCard({ title, children }) {
  return (
    <div className="info-card">
      <div className="info-card-header">{title}</div>
      {children}
    </div>
  );
}

function InfoRow({ label, value, highlight = false }) {
  return (
    <div className="info-row">
      <span className="info-key">{label}</span>
      <span className={`info-val${highlight ? ' info-val-highlight' : ''}`}>{value ?? '—'}</span>
    </div>
  );
}

const GAMMA_LABELS = { 0:'Off', 1:'1.8', 2:'2.0', 3:'2.1', 4:'2.2', 5:'2.4', 6:'2.6', 7:'Gamma 7', 8:'Gamma 8', 9:'Gamma 9', 10:'Gamma 10' };
const HDR_LABELS   = { 0:'Off', 1:'HDR10', 2:'HLG', 3:'Auto' };
const TEMP_LABELS  = { 0:'D93', 1:'D75', 2:'D65', 9:'D55', 3:'Custom 1', 4:'Custom 2', 5:'Custom 3', 6:'Custom 4', 7:'Custom 5' };
const CS_LABELS    = { 0:'BT.709', 8:'BT.2020', 3:'CS1', 4:'CS2', 5:'CS3', 6:'Custom' };
const CALIB_LABELS = { 0:'Cinema Film 1', 1:'Cinema Film 2', 2:'Reference', 3:'TV', 4:'Photo', 5:'Game', 6:'Bright Cinema', 7:'Bright TV', 8:'User' };
const MF_LABELS    = { 0:'Off', 1:'Smooth High', 2:'Smooth Low', 3:'Impulse', 4:'Combination', 5:'True Cinema' };

export default function InfoTab({ status }) {
  return (
    <div className="info-tab">

      <InfoCard title="Active Picture Settings">
        <InfoRow label="Calib. Preset"     value={CALIB_LABELS[status.calibPreset]}  highlight />
        <InfoRow label="Gamma Correction"  value={GAMMA_LABELS[status.gammaCorrection]} highlight />
        <InfoRow label="Color Temperature" value={TEMP_LABELS[status.colorTemp]} />
        <InfoRow label="Color Space"       value={CS_LABELS[status.colorSpace]} />
        <InfoRow label="HDR Mode"          value={HDR_LABELS[status.hdr]} />
        <InfoRow label="Motionflow"        value={MF_LABELS[status.motionflow]} />
      </InfoCard>

      <InfoCard title="Input Signal">
        <InfoRow label="Signal Type"   value={status.signalType   ?? 'No signal'} highlight />
        <InfoRow label="Color Format"  value={status.colorFormat} />
        <InfoRow label="Color Space"   value={status.signalColorSpace} />
        <InfoRow label="HDR Format"    value={status.hdrFormat} />
      </InfoCard>

      <InfoCard title="Projector Identity">
        <InfoRow label="Model Name"       value={status.modelName ?? 'VPL-VW385ES'} />
        <InfoRow label="Serial Number"    value={status.serialNo} />
        <InfoRow label="Software Version" value={status.softwareVersion} />
        <InfoRow label="Lamp Timer"       value={status.lampTimer != null ? `${status.lampTimer} h` : null} highlight />
      </InfoCard>

      <InfoCard title="Network">
        <InfoRow label="IP Address"    value={status.ip} />
        <InfoRow label="Connection"    value="● Connected" highlight />
        <InfoRow label="Protocol"      value="SDCP / TCP 53484" />
        <InfoRow label="Poll Interval" value="5 s" />
      </InfoCard>

    </div>
  );
}
