import { useState } from 'react';
import { Modal } from '../ui/Modal';
import type { EmulatorSession } from '../emu/session';
import { VideoTab } from './settings/VideoTab';
import { AudioTab } from './settings/AudioTab';
import { EmulationTab } from './settings/EmulationTab';
import { ControlsTab } from './settings/ControlsTab';
import { NetplayTab } from './settings/NetplayTab';
import { AchievementsTab } from './settings/AchievementsTab';
import { StorageTab } from './settings/StorageTab';

export type SettingsTab = 'video' | 'audio' | 'emulation' | 'controls' | 'netplay' | 'achievements' | 'storage';

const TABS: { id: SettingsTab; label: string }[] = [
  { id: 'video', label: 'Video' },
  { id: 'audio', label: 'Audio' },
  { id: 'emulation', label: 'Emulation' },
  { id: 'controls', label: 'Controls' },
  { id: 'netplay', label: 'Netplay' },
  { id: 'achievements', label: 'Achievements' },
  { id: 'storage', label: 'Storage' },
];

export function SettingsDialog({ open, onClose, session, initialTab = 'video' }: { open: boolean; onClose: () => void; session?: EmulatorSession | null; initialTab?: SettingsTab }) {
  const [tab, setTab] = useState<SettingsTab>(initialTab);
  const [lastInitial, setLastInitial] = useState(initialTab);
  if (initialTab !== lastInitial) {
    setLastInitial(initialTab);
    setTab(initialTab);
  }
  const liveOptions = session ? [...session.core.options.values()] : null;
  const liveTypes = session?.core.controllerTypes[0] ?? null;
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Settings"
      bodyClass="settings-body"
      header={
        <div className="tabs" role="tablist" aria-label="Settings sections">
          {TABS.map((t) => (
            <button key={t.id} type="button" role="tab" className="tab" aria-selected={tab === t.id} onClick={() => setTab(t.id)}>
              {t.label}
            </button>
          ))}
        </div>
      }
    >
      <div role="tabpanel" aria-label={TABS.find((t) => t.id === tab)?.label}>
        {tab === 'video' && <VideoTab />}
        {tab === 'audio' && <AudioTab />}
        {tab === 'emulation' && <EmulationTab liveOptions={liveOptions} inGame={!!session} />}
        {tab === 'controls' && <ControlsTab liveTypes={liveTypes} />}
        {tab === 'netplay' && <NetplayTab />}
        {tab === 'achievements' && <AchievementsTab />}
        {tab === 'storage' && <StorageTab inGame={!!session} />}
      </div>
    </Modal>
  );
}
