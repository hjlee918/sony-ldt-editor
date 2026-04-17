import { useState } from 'react';
import ConnectionPanel from './ConnectionPanel';
import ProjectorStatusBar from './ProjectorStatusBar';
import GammaSlots from './GammaSlots';
import PictureTab from './PictureTab';
import SystemTab from './SystemTab';
import InfoTab from './InfoTab';

export default function ProjectorTab({ currentChannels, projector }) {
  const { status, uploadProgress, error, lastIp, connect, disconnect, set, activateSlot, upload } = projector;
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
      <GammaSlots
        status={status}
        onUpload={handleUpload}
        onUseSlot={handleUseSlot}
        uploadProgress={uploadProgress}
        uploadingSlot={selectedSlot}
      />
      <div className="proj-tab-bar">
        {[['picture', '🎛 Picture'], ['system', '⚙️ System'], ['info', 'ℹ️ Info']].map(([id, label]) => (
          <button
            key={id}
            className={`proj-tab-btn${activeTab === id ? ' active' : ''}`}
            onClick={() => setActiveTab(id)}
          >
            {label}
          </button>
        ))}
      </div>
      {activeTab === 'picture' && <PictureTab status={status} onSet={set} />}
      {activeTab === 'system'  && <SystemTab  status={status} onSet={set} />}
      {activeTab === 'info'    && <InfoTab    status={status} />}
    </div>
  );
}
