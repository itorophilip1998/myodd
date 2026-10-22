'use client';

import { useSettings } from './SettingsProvider';
import type { SoundId } from '@/lib/sounds';
import { MAX_TICKETS, type UiSettings } from '@/lib/ui-settings';

const PREVIEWS: Array<{ id: SoundId; label: string; note: string }> = [
  { id: 'mic-on', label: 'Mic open', note: 'When dictation starts' },
  { id: 'mic-off', label: 'Mic close', note: 'When dictation stops' },
  { id: 'prompt', label: 'Prompt added', note: 'Voice or import lands in the box' },
  { id: 'submit', label: 'Submit', note: 'When you send a request' },
  { id: 'progress', label: 'Progress', note: 'Soft pulse while building' },
  { id: 'tick', label: 'Stage tick', note: 'When a build step advances' },
  { id: 'done', label: 'Done', note: 'When tickets are ready' },
  { id: 'error', label: 'Error', note: 'When something fails' },
  { id: 'toast', label: 'Toast', note: 'Activity confirmations' },
  { id: 'click', label: 'Click', note: 'Light UI feedback' },
  { id: 'import', label: 'Import', note: 'When a file is attached' },
];

const TICKET_OPTIONS = Array.from({ length: MAX_TICKETS }, (_, i) => i + 1);
const SPLIT_OPTIONS = Array.from({ length: MAX_TICKETS }, (_, i) => i + 1);

export function SettingsForm() {
  const { settings, update, reset, play } = useSettings();

  return (
    <div className="settings-page-body">
      <section className="settings-card" aria-labelledby="pref-heading">
        <div className="settings-card-head">
          <h3 id="pref-heading">Generation defaults</h3>
          <p>Applied when you open Create. Options on the form still override for a single run.</p>
        </div>
        <div className="settings-grid">
          <label>
            Default mode
            <select value={settings.defaultMode ?? 'INVESTOR'} onChange={e => update({ defaultMode: (e.target.value || null) as UiSettings['defaultMode'] })}>
              <option value="INVESTOR">Investor</option><option value="GAMBLER">Gambler</option><option value="JAPA">Japa</option><option value="LAGOS_LIFE">Lagos Life</option>
            </select>
          </label>
          <label>
            Default action
            <select
              value={settings.defaultOperation}
              onChange={e => {
                update({ defaultOperation: e.target.value as UiSettings['defaultOperation'] });
                play('click');
              }}
            >
              <option value="generate">Variations</option>
              <option value="split">Split</option>
            </select>
          </label>
          <label>
            Default tickets
            <select
              value={settings.defaultTickets ?? ''}
              onChange={e => {
                update({ defaultTickets: e.target.value ? Number(e.target.value) : null });
                play('click');
              }}
            >
              <option value="">Prompt</option>
              {TICKET_OPTIONS.map(n => <option key={n} value={n}>{n}</option>)}
            </select>
          </label>
          <label>
            Default games per ticket
            <select value={settings.defaultGames ?? ''} onChange={e => {
              update({ defaultGames: e.target.value ? Number(e.target.value) : null });
              play('click');
            }}>
              <option value="">Random (1–50)</option>
              {TICKET_OPTIONS.map(n => <option key={n} value={n}>{n}</option>)}
            </select>
          </label>
          <label>
            Default split parts
            <select
              value={settings.defaultSplitParts ?? ''}
              onChange={e => {
                update({ defaultSplitParts: e.target.value ? Number(e.target.value) : null });
                play('click');
              }}
            >
              <option value="">Prompt</option>
              {SPLIT_OPTIONS.map(n => <option key={n} value={n}>{n}</option>)}
            </select>
          </label>
          <label>
            Default matches
            <select
              value={settings.defaultScope}
              onChange={e => {
                update({ defaultScope: e.target.value as UiSettings['defaultScope'] });
                play('click');
              }}
            >
              <option value="prompt">Prompt</option>
              <option value="original_only">Original</option>
              <option value="upcoming">Upcoming</option>
            </select>
          </label>
        </div>
        <div className="settings-toggles-block" style={{ marginTop: 12 }}>
          <label className="settings-switch">
            <input
              type="checkbox"
              checked={settings.defaultStrict}
              onChange={e => { update({ defaultStrict: e.target.checked }); play('click'); }}
            />
            <span>
              <strong>Only requested markets</strong>
              <small>Default for the markets toggle on Create</small>
            </span>
          </label>
          <label className="settings-switch">
            <input
              type="checkbox"
              checked={settings.defaultNearest}
              onChange={e => { update({ defaultNearest: e.target.checked }); play('click'); }}
            />
            <span>
              <strong>Nearest odds OK</strong>
              <small>Default for closest available odds on Create</small>
            </span>
          </label>
        </div>
      </section>

      <section className="settings-card" aria-labelledby="sound-heading">
        <div className="settings-card-head">
          <h3 id="sound-heading">Sounds</h3>
          <p>Short blips for mic, prompt, progress, and done. Changes save immediately.</p>
        </div>
        <div className="settings-toggles-block">
          <label className="settings-switch">
            <input
              type="checkbox"
              checked={settings.soundsEnabled}
              onChange={e => {
                update({ soundsEnabled: e.target.checked });
                if (e.target.checked) play('done', { force: true });
              }}
            />
            <span>
              <strong>Enable sounds</strong>
              <small>Master switch for all UI audio</small>
            </span>
          </label>
          <label className="settings-switch">
            <input
              type="checkbox"
              checked={settings.progressSounds}
              disabled={!settings.soundsEnabled}
              onChange={e => {
                update({ progressSounds: e.target.checked });
                if (e.target.checked) play('progress', { force: true });
              }}
            />
            <span>
              <strong>Progress pulses</strong>
              <small>Soft ticks while tickets are building</small>
            </span>
          </label>
          <label className="settings-switch">
            <input
              type="checkbox"
              checked={settings.toastSounds}
              disabled={!settings.soundsEnabled}
              onChange={e => {
                update({ toastSounds: e.target.checked });
                if (e.target.checked) play('toast', { force: true });
              }}
            />
            <span>
              <strong>Toast sounds</strong>
              <small>Tiny cue when confirmations appear</small>
            </span>
          </label>
        </div>
        <label className="settings-volume">
          <span>Volume <b>{Math.round(settings.soundVolume * 100)}%</b></span>
          <input
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={settings.soundVolume}
            disabled={!settings.soundsEnabled}
            onChange={e => update({ soundVolume: Number(e.target.value) })}
            onMouseUp={() => play('tick', { force: true })}
            onTouchEnd={() => play('tick', { force: true })}
          />
        </label>
        <div className="sound-preview-grid" role="group" aria-label="Preview sounds">
          {PREVIEWS.map(item => (
            <button key={item.id} type="button" className="sound-preview-btn" onClick={() => play(item.id, { force: true })}>
              <strong>{item.label}</strong>
              <span>{item.note}</span>
            </button>
          ))}
        </div>
      </section>

      <div className="settings-page-foot">
        <button type="button" className="outline-button" onClick={() => { reset(); play('click', { force: true }); }}>
          Reset to defaults
        </button>
      </div>
    </div>
  );
}
