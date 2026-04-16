import { useState } from 'react';
import ConnectionPanel from './ConnectionPanel';
import ProjectorStatusBar from './ProjectorStatusBar';
import GammaSlots from './GammaSlots';
import PictureSettings from './PictureSettings';

const CALIB_OPTS = [
  { value: 0, label: 'Cinema Film 1' }, { value: 1, label: 'Cinema Film 2' },
  { value: 2, label: 'Reference' }, { value: 3, label: 'TV' }, { value: 4, label: 'Photo' },
  { value: 5, label: 'Game' }, { value: 6, label: 'Bright Cinema' }, { value: 7, label: 'Bright TV' },
  { value: 8, label: 'User' },
];

export default function ProjectorTab({ currentChannels, projector }) {
  const { status, uploadProgress, error, lastIp, connect, disconnect, set, activateSlot, upload } = projector;
  const [selectedSlot, setSelectedSlot] = useState(10);

  const handleUpload = (slot) => {
    if (!currentChannels) return;
    setSelectedSlot(slot);
    upload(slot, currentChannels);
  };

  const handleUseSlot = (slot) => {
    // SET item 00 22 (Gamma Correction) to the target slot value (7–10).
    // This is how ImageDirector changes the active gamma slot.
    set(0x00, 0x22, slot);
  };

  if (!status.connected) {
    return <ConnectionPanel onConnect={connect} lastIp={lastIp} error={error} />;
  }

  return (
    <div className="projector-tab">
      <ProjectorStatusBar
        status={status}
        error={error}
        onDisconnect={disconnect}
        onUpload={handleUpload}
        selectedUploadSlot={selectedSlot}
      />
      <div className="projector-columns">
        {/* Left column */}
        <div className="projector-col-left">
          <div className="proj-section">
            <div className="proj-section-label">CALIB PRESET</div>
            <select
              className="proj-select"
              style={{ width: '100%' }}
              value={status.calibPreset ?? 0}
              onChange={e => set(0x00, 0x02, Number(e.target.value))}
            >
              {CALIB_OPTS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>
          <GammaSlots
            status={status}
            onUpload={handleUpload}
            onUseSlot={handleUseSlot}
            uploadProgress={uploadProgress}
            uploadingSlot={selectedSlot}
          />
        </div>
        {/* Right column */}
        <div className="projector-col-right">
          <PictureSettings status={status} onSet={set} />
        </div>
      </div>
    </div>
  );
}
