import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { Hud } from './Hud';
import { NextRoundPanel } from './NextRoundPanel';

const hud = { round: 4, targetScore: 300, currentScore: 0, playsLeft: 3, discardsLeft: 3, cash: 9 };

describe('Hud boss', () => {
  it('shows the boss only on boss rounds', () => {
    expect(renderToStaticMarkup(<Hud hud={hud} />)).not.toContain('hud__boss');
    const html = renderToStaticMarkup(<Hud hud={{ ...hud, boss: { name: 'Steep', description: 'Target ×1.5' } }} />);
    expect(html).toContain('Steep');
    expect(html).toContain('Target ×1.5');
  });
});

describe('NextRoundPanel', () => {
  it('shows round, target, boss and rule changes', () => {
    const html = renderToStaticMarkup(
      <NextRoundPanel
        next={{
          round: 4,
          target: 450,
          boss: { name: 'Short Hand', description: 'Hand size −2' },
          ruleChanges: [{ label: 'Hand size', from: 8, to: 6 }],
        }}
      />,
    );
    expect(html).toContain('Q4, Year 1');
    expect(html).toContain('Next round: round 4');
    expect(html).toContain('450');
    expect(html).toContain('Short Hand');
    expect(html).toContain('next-round--boss');
    expect(html).toContain('Hand size 8 → 6');
    expect(html).toContain('is-worse');
  });

  it('omits the boss and changes when there are none', () => {
    const html = renderToStaticMarkup(<NextRoundPanel next={{ round: 2, target: 174, ruleChanges: [] }} />);
    expect(html).not.toContain('next-round__boss');
    expect(html).not.toContain('next-round__changes');
  });
});
