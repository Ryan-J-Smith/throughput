import { EngineError } from '../../../engine/errors';
import { SUB_RND_GRADE, makePart } from '../model';
import type { BomRule, FabContext, OwnedBlueprint, Part } from '../model';

export type FabResult = {
  readonly output: Part;
  /** Half-grade copies (Kitting Station); benched only if there is room. */
  readonly copies: readonly Part[];
};

/** Output grade = 2 × the sum of input grades + 3 per R&D level + rule bonuses. */
export function fabricate(sub: OwnedBlueprint, inputs: readonly Part[], rules: readonly BomRule[]): FabResult {
  if (sub.def.kind !== 'sub') throw new EngineError(`${sub.def.name} is not a Sub`);
  const context: FabContext = { sub, inputs, bonus: SUB_RND_GRADE * sub.subLevels, copies: 0 };
  for (const rule of rules) rule.onFabricate(context);
  const grade = 2 * inputs.reduce((sum, p) => sum + p.grade, 0) + context.bonus;
  const output = makePart(sub.def.output, grade, { fabricated: true });
  const copies = Array.from({ length: context.copies }, () => makePart(output.category, Math.floor(grade / 2), { fabricated: true }));
  return { output, copies };
}
