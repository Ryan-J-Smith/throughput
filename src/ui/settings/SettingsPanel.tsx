import { useEffect, useId, useRef, useState } from 'react';
import { ANIMATION_SPEEDS } from './settings';
import type { AnimationSpeed, Settings } from './settings';
import './settings.css';

const SPEED_LABEL: Readonly<Record<AnimationSpeed, string>> = { slow: 'Slow', normal: 'Normal', fast: 'Fast' };

export type SettingsPanelProps = {
  settings: Settings;
  onChange: (settings: Settings) => void;
  /** Shows first-run tips again; omitted when no game has tips. */
  onResetTips?: () => void;
  onClose: () => void;
};

/** Settings as a modal dialog: animation speed, reduced motion, sound, and tips. Changes apply at once. */
export function SettingsPanel({ settings, onChange, onResetTips, onClose }: SettingsPanelProps) {
  const ids = useId();
  const [tipsReset, setTipsReset] = useState(false);
  const panel = useRef<HTMLDivElement>(null);
  const close = useRef(onClose);
  close.current = onClose;
  const volumePercent = Math.round(settings.volume * 100);

  // Focus the first control once on open; Escape closes.
  useEffect(() => {
    const root = panel.current;
    (root?.querySelector<HTMLElement>('input[type="radio"]:checked') ?? root?.querySelector<HTMLElement>('input, button'))?.focus();
    const onKey = (event: KeyboardEvent) => event.key === 'Escape' && close.current();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <div className="settings" onClick={(event) => event.target === event.currentTarget && onClose()}>
      <div ref={panel} className="settings__panel" role="dialog" aria-modal="true" aria-labelledby={`${ids}-title`}>
        <h2 id={`${ids}-title`} className="settings__title">
          Settings
        </h2>

        <fieldset className="settings__group">
          <legend className="settings__label">Animation speed</legend>
          <div className="settings__choices">
            {ANIMATION_SPEEDS.map((speed) => (
              <label key={speed} className="settings__choice">
                <input type="radio" name={`${ids}-speed`} value={speed} checked={settings.speed === speed} onChange={() => onChange({ ...settings, speed })} />
                {SPEED_LABEL[speed]}
              </label>
            ))}
          </div>
        </fieldset>

        <div className="settings__group">
          <label className="settings__toggle">
            <input type="checkbox" checked={settings.reduceMotion} onChange={(event) => onChange({ ...settings, reduceMotion: event.target.checked })} />
            Reduce motion
          </label>
          <p className="settings__note">Motion is also reduced when your device asks for it.</p>
        </div>

        <div className="settings__group">
          <label className="settings__toggle">
            <input type="checkbox" checked={settings.sound} onChange={(event) => onChange({ ...settings, sound: event.target.checked })} />
            Sound
          </label>
          <label className="settings__slider">
            <span className="settings__label">Volume</span>
            <input
              type="range"
              min={0}
              max={100}
              step={5}
              value={volumePercent}
              disabled={!settings.sound}
              aria-valuetext={`${volumePercent}%`}
              onChange={(event) => onChange({ ...settings, volume: Number(event.target.value) / 100 })}
            />
          </label>
        </div>

        {onResetTips !== undefined && (
          <div className="settings__group">
            <button
              type="button"
              className="btn"
              disabled={tipsReset}
              onClick={() => {
                onResetTips();
                setTipsReset(true);
              }}
            >
              {tipsReset ? 'Tips will show again' : 'Show tips again'}
            </button>
          </div>
        )}

        <div className="settings__actions">
          <button type="button" className="btn btn--play" onClick={onClose}>
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
