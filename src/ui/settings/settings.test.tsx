import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { MemoryStore } from '../storage';
import { DEFAULT_SETTINGS, SettingsPanel, SettingsStore, applySettings, wrapTab } from '.';
import type { SettingsTarget } from '.';

describe('settings', () => {
  it('load the defaults, then what was saved; unreadable or odd values fall back', () => {
    const store = new MemoryStore();
    const settings = new SettingsStore(store);
    expect(settings.load()).toEqual(DEFAULT_SETTINGS);
    settings.save({ speed: 'fast', reduceMotion: true, sound: false, volume: 0.75 });
    expect(new SettingsStore(store).load()).toEqual({ speed: 'fast', reduceMotion: true, sound: false, volume: 0.75 });
    store.set('settings', JSON.stringify({ speed: 'ludicrous', reduceMotion: 'yes', sound: 'loud', volume: 2 }));
    expect(settings.load()).toEqual(DEFAULT_SETTINGS);
    // Settings saved before sound existed keep their choices and get sound at the defaults.
    store.set('settings', JSON.stringify({ speed: 'slow', reduceMotion: true }));
    expect(settings.load()).toEqual({ speed: 'slow', reduceMotion: true, sound: true, volume: DEFAULT_SETTINGS.volume });
    store.set('settings', '{oops');
    expect(settings.load()).toEqual(DEFAULT_SETTINGS);
  });

  it('apply as data attributes on the page root', () => {
    const root: SettingsTarget = { dataset: {} };
    applySettings({ ...DEFAULT_SETTINGS, speed: 'slow', reduceMotion: true }, root);
    expect(root.dataset).toEqual({ speed: 'slow', motion: 'reduced' });
    applySettings({ ...DEFAULT_SETTINGS, speed: 'normal', reduceMotion: false }, root);
    expect(root.dataset).toEqual({ speed: 'normal' });
  });

  it('Tab wraps around inside the panel instead of leaving it for the page behind', () => {
    const stops = ['speed', 'motion', 'sound', 'done'];
    expect(wrapTab(stops, 'done', false)).toBe('speed');
    expect(wrapTab(stops, 'speed', true)).toBe('done');
    // Between the ends the browser's own Tab order stays inside.
    expect(wrapTab(stops, 'motion', false)).toBeNull();
    expect(wrapTab(stops, 'done', true)).toBeNull();
    // Focus outside the panel comes back in at the near end.
    expect(wrapTab(stops, 'menu', false)).toBe('speed');
    expect(wrapTab(stops, null, true)).toBe('done');
    expect(wrapTab([], 'menu', false)).toBeNull();
  });

  it('sound starts on at a low volume', () => {
    expect(DEFAULT_SETTINGS.sound).toBe(true);
    expect(DEFAULT_SETTINGS.volume).toBeGreaterThan(0);
    expect(DEFAULT_SETTINGS.volume).toBeLessThanOrEqual(0.5);
  });

  it('the panel shows the speed choices, Reduce motion, Sound with its volume and, when a game has tips, Show tips again', () => {
    const settings = { speed: 'fast', reduceMotion: true, sound: true, volume: 0.35 } as const;
    const html = renderToStaticMarkup(<SettingsPanel settings={settings} onChange={() => {}} onResetTips={() => {}} onClose={() => {}} />);
    expect(html).toContain('role="dialog"');
    expect(html.match(/type="radio"/g)).toHaveLength(3);
    expect(html).toMatch(/checked="" value="fast"/);
    expect(html.match(/type="checkbox" checked=""/g)).toHaveLength(2);
    expect(html).toContain('Sound</label>');
    expect(html).toMatch(/<input type="range" min="0" max="100" step="5" aria-valuetext="35%" value="35"\/>/);
    const muted = renderToStaticMarkup(<SettingsPanel settings={{ ...settings, sound: false }} onChange={() => {}} onClose={() => {}} />);
    expect(muted).toMatch(/<input type="range"[^>]* disabled=""/);
    expect(html).toContain('Show tips again');
    const noTips = renderToStaticMarkup(<SettingsPanel settings={DEFAULT_SETTINGS} onChange={() => {}} onClose={() => {}} />);
    expect(noTips).not.toContain('Show tips again');
  });
});
