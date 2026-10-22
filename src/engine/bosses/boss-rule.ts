import type { EngineEvent } from '../modifiers';
import type { RoundRules } from '../run';

export type BossInfo = {
  readonly id: string;
  readonly name: string;
  /** Player-facing rules text. */
  readonly description: string;
};

/**
 * A rule that applies only during a boss round. It can reshape the round's rules up front
 * and react to the same events as modifiers; during its round it receives each event
 * before the modifiers do.
 */
export abstract class BossRule<TCard> {
  readonly id: string;
  readonly name: string;
  readonly description: string;

  constructor(info: BossInfo) {
    this.id = info.id;
    this.name = info.name;
    this.description = info.description;
  }

  /** Returns this round's rules, e.g. fewer plays or a higher target. Default: unchanged. */
  adjustRoundConfig(rules: RoundRules): RoundRules {
    return rules;
  }

  /** Called for every engine event during the boss round. Default: ignore. */
  onEvent(_event: EngineEvent<TCard>): void {}
}
