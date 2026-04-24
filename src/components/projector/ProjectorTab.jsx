import { useState } from 'react';
import ConnectionPanel from './ConnectionPanel';
import ProjectorStatusBar from './ProjectorStatusBar';
import GammaSlots from './GammaSlots';
import PictureTab from './PictureTab';
import SystemTab from './SystemTab';

const GAMMA_LABELS = { 0:'Off', 1:'1.8', 2:'2.0', 3:'2.1', 4:'2.2', 5:'2.4', 6:'2.6', 7:'Gamma 7', 8:'Gamma 8', 9:'Gamma 9', 10:'Gamma 10' };
const HDR_LABELS   = { 0:'Off', 1:'HDR10', 3:'HLG', 2:'Auto' };
const TEMP_LABELS  = { 0:'D93', 1:'D75', 2:'D65', 9:'D55', 3:'Custom 1', 4:'Custom 2', 5:'Custom 3', 6:'Custom 4', 7:'Custom 5' };
const CS_LABELS    = { 0:'BT.709', 8:'BT.2020', 3:'CS1', 4:'CS2', 5:'CS3', 6:'Custom' };
const CALIB_LABELS = { 0:'Cinema Film 1', 1:'Cinema Film 2', 2:'Reference', 3:'TV', 4:'Photo', 5:'Game', 6:'Bright Cinema', 7:'Bright TV', 8:'User' };
const MF_LABELS    = { 0:'Off', 1:'Smooth High', 2:'Smooth Low', 3:'Impulse', 4:'Combination', 5:'True Cinema' };

function PinnedItem({ label, value, accent = false }) {
  return (
    <div className="proj-pinned-item">
      <span className="proj-pinned-label">{label}</span>
      <span className={`proj-pinned-val${accent ? ' proj-pinned-accent' : ''}`}>{value ?? '—'}</span>
    </div>
  );
}


function PinnedInfo({ status }) {
  const hasSignal = !!status.signalType;
  return (
    <div className="proj-pinned-info">
      {/* Active picture settings */}
      <div className="proj-pinned-group">
        <PinnedItem label="Preset"      value={CALIB_LABELS[status.calibPreset]}  accent />
        <PinnedItem label="Gamma"       value={GAMMA_LABELS[status.gammaCorrection]} accent />
        <PinnedItem label="Color Temp"  value={TEMP_LABELS[status.colorTemp]} />
        <PinnedItem label="Color Space" value={CS_LABELS[status.colorSpace]} />
        <PinnedItem label="HDR"         value={HDR_LABELS[status.hdr]} />
        <PinnedItem label="Motionflow"  value={MF_LABELS[status.motionflow]} />
      </div>
      <div className="proj-pinned-divider" />
      {/* Input signal */}
      <div className="proj-pinned-group">
        <PinnedItem label="Signal"      value={status.signalType ?? (hasSignal ? '—' : 'No signal')} />
        {status.colorFormat && <PinnedItem label="Format" value={status.colorFormat} />}
      </div>
      <div className="proj-pinned-divider" />
      {/* Projector identity */}
      <div className="proj-pinned-group">
        <PinnedItem label="Model" value={status.modelName ?? 'VPL-VW385ES'} />
        <PinnedItem label="Lamp"  value={status.lampTimer != null ? `${status.lampTimer} h` : null} accent />
        <PinnedItem label="IP"    value={status.ip} />
      </div>
    </div>
  );
}

export default function ProjectorTab({ currentChannels, projector }) {
  const { status, uploadProgress, error, lastIp, connect, disconnect, set, upload, picPos, key } = projector;
  const [selectedSlot, setSelectedSlot] = useState(10);
  const [activeTab, setActiveTab] = useState('picture');

  const handleUpload = (slot) => {
    if (!currentChannels) return;
    setSelectedSlot(slot);
    upload(slot, currentChannels);
  };

  const handleUseSlot = (slot) => {
    set(0x00, 0x22, slot);
  };

  if (!status.connected) {
    return <ConnectionPanel onConnect={connect} lastIp={lastIp} error={error} />;
  }

  return (
    <div className="projector-tab">
      <ProjectorStatusBar status={status} error={error} onDisconnect={disconnect} />
      <PinnedInfo status={status} />
      <GammaSlots
        status={status}
        onUpload={handleUpload}
        onUseSlot={handleUseSlot}
        uploadProgress={uploadProgress}
        uploadingSlot={selectedSlot}
      />
      <div className="proj-tab-bar">
        {[['picture', '🎛 Picture'], ['system', '⚙️ System']].map(([id, label]) => (
          <button
            key={id}
            className={`proj-tab-btn${activeTab === id ? ' active' : ''}`}
            onClick={() => setActiveTab(id)}
          >
            {label}
          </button>
        ))}
      </div>
      <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
        {activeTab === 'picture' && <PictureTab status={status} onSet={set} onKey={key} />}
        {activeTab === 'system'  && <SystemTab  status={status} onSet={set} onPicPos={picPos} onKey={key} onFactoryReset={() => set(0x00, 0xff, 1)} onCalibReset={() => set(0x00, 0xa0, 0)} />}
      </div>
    </div>
  );
}
