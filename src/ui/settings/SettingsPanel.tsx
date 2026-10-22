import { useEffect, useId, useRef, useState } from 'react';
import { ANIMATION_SPEEDS } from './settings';
import type { AnimationSpeed, Settings } from './settings';
import './settings.css';

const SPEED_LABEL: Readonly<Record<AnimationSpeed, string>> = { slow: 'Slow', normal: 'Normal', fast: 'Fast' };

/**
 * Where Tab should move focus to stay inside a dialog whose tab stops are `stops` (in order):
 * from the last stop forward to the first, from the first backward to the last, or to the first
 * if focus is somewhere else. Null when the browser's own Tab already stays inside.
 */
export function wrapTab<T>(stops: readonly T[], active: T | null, backward: boolean): T | null {
  const first = stops[0];
  const last = stops[stops.length - 1];
  if (first === undefined || last === undefined) return null;
  if (active === null || !stops.includes(active)) return backward ? last : first;
  if (backward) return active === first ? last : null;
  return active === last ? first : null;
}

/** The dialog's tab stops: enabled controls, counting a radio group once (at its checked radio). */
function tabStops(root: HTMLElement): HTMLElement[] {
  return [...root.querySelectorAll<HTMLElement>('input, button, select, textarea, [tabindex]:not([tabindex="-1"])')].filter(
    (el) => !el.matches(':disabled') && !(el instanceof HTMLInputElement && el.type === 'radio' && !el.checked),
  );
}

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

  // Focus the first control once on open; Escape closes; Tab stays inside; closing hands focus
  // back to whatever opened the panel.
  useEffect(() => {
    const root = panel.current;
    const opener = document.activeElement;
    (root?.querySelector<HTMLElement>('input[type="radio"]:checked') ?? root?.querySelector<HTMLElement>('input, button'))?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') return close.current();
      if (event.key !== 'Tab' || root === null) return;
      const active = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      const target = wrapTab(tabStops(root), active, event.shiftKey);
      if (target === null) return;
      event.preventDefault();
      target.focus();
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      if (opener instanceof HTMLElement && opener.isConnected) opener.focus();
    };
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
