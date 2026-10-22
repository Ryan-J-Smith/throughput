import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { MemoryStore } from '../storage';
import { DEFAULT_SETTINGS, SettingsPanel, SettingsStore, applySettings } from '.';
import type { SettingsTarget } from '.';

describe('settings', () => {
  it('load the defaults, then what was saved; unreadable or odd values fall back', () => {
    const store = new MemoryStore();
    const settings = new SettingsStore(store);
    expect(settings.load()).toEqual(DEFAULT_SETTINGS);
    settings.save({ speed: 'fast', reduceMotion: true });
    expect(new SettingsStore(store).load()).toEqual({ speed: 'fast', reduceMotion: true });
    store.set('settings', JSON.stringify({ speed: 'ludicrous', reduceMotion: 'yes' }));
    expect(settings.load()).toEqual(DEFAULT_SETTINGS);
    store.set('settings', '{oops');
    expect(settings.load()).toEqual(DEFAULT_SETTINGS);
  });

  it('apply as data attributes on the page root', () => {
    const root: SettingsTarget = { dataset: {} };
    applySettings({ speed: 'slow', reduceMotion: true }, root);
    expect(root.dataset).toEqual({ speed: 'slow', motion: 'reduced' });
    applySettings({ speed: 'normal', reduceMotion: false }, root);
    expect(root.dataset).toEqual({ speed: 'normal' });
  });

  it('the panel shows the speed choices, Reduce motion and, when a game has tips, Show tips again', () => {
    const html = renderToStaticMarkup(<SettingsPanel settings={{ speed: 'fast', reduceMotion: true }} onChange={() => {}} onResetTips={() => {}} onClose={() => {}} />);
    expect(html).toContain('role="dialog"');
    expect(html.match(/type="radio"/g)).toHaveLength(3);
    expect(html).toMatch(/checked="" value="fast"/);
    expect(html).toMatch(/type="checkbox" checked=""/);
    expect(html).toContain('Show tips again');
    const noTips = renderToStaticMarkup(<SettingsPanel settings={DEFAULT_SETTINGS} onChange={() => {}} onClose={() => {}} />);
    expect(noTips).not.toContain('Show tips again');
  });
});
