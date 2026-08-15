import { IStartupProfile } from '../firestore';
import { STACKING_DEFAULTS } from './eligibility.constants';
import { EligibilityRulesHelper } from './eligibility.rules';
import { IStackingPlan, ISequencedCandidate } from './route.interfaces';
import { SequencingHelper } from './sequencing.helper';

export class StackingHelper {
  public static plan(profile: IStartupProfile, sequenced: ISequencedCandidate[]): IStackingPlan {
    const askTarget = StackingHelper.askTarget(profile);
    const stops = SequencingHelper.stops(sequenced);
    const contributions = stops
      .map((entry) => ({
        title: entry.candidate.opportunity.title,
        ceiling: EligibilityRulesHelper.readAmount(entry.candidate.opportunity.maxAward) ?? 0,
        sequenceMonth: entry.sequenceMonth,
      }))
      .filter((contribution) => contribution.ceiling > 0)
      .sort((first, second) => second.ceiling - first.ceiling)
      .slice(0, STACKING_DEFAULTS.maxStackedStops);
    const cumulativeCeiling = contributions.reduce((total, contribution) => total + contribution.ceiling, 0);

    if (askTarget === 0) {
      return {
        askCovered: false,
        cumulativeCeiling,
        askTarget,
        note:
          contributions.length === 0
            ? 'No funding target was provided and no published award ceilings were available, so we cannot judge whether this route covers your need.'
            : `No funding target was provided. The mapped stops carry published ceilings totalling ${StackingHelper.money(
                cumulativeCeiling,
              )} — tell us your ask and we will show whether that covers it.`,
      };
    }

    if (contributions.length === 0) {
      return {
        askCovered: false,
        cumulativeCeiling,
        askTarget,
        note: `None of the mapped stops publish an award ceiling, so we cannot confirm coverage of your ${StackingHelper.money(
          askTarget,
        )} ask. Treat the amounts in each notice as the source of truth.`,
      };
    }

    const entryMonth = Math.min(
      ...contributions.map(contribution => contribution.sequenceMonth ?? STACKING_DEFAULTS.defaultEntryMonth)
    );
    const entryContributions = contributions.filter(
      contribution => (contribution.sequenceMonth ?? STACKING_DEFAULTS.defaultEntryMonth) === entryMonth
    );
    const largest = entryContributions[0] ?? contributions[0];

    if (largest.ceiling >= askTarget) {
      return {
        askCovered: true,
        cumulativeCeiling,
        askTarget,
        note: `A single award covers your ask: ${largest.title} has a ceiling of ${StackingHelper.money(
          largest.ceiling,
        )} against a ${StackingHelper.money(askTarget)} need. Stacking is optional here, not required.`,
      };
    }

    const combination = contributions.map((contribution) => `${contribution.title} (${StackingHelper.money(contribution.ceiling)})`).join(' + ');

    if (cumulativeCeiling >= askTarget) {
      return {
        askCovered: true,
        cumulativeCeiling,
        askTarget,
        note: `No single award covers your ${StackingHelper.money(askTarget)} ask — the largest ceiling on this route is ${StackingHelper.money(
          largest.ceiling,
        )}. Sequencing ${combination} reaches ${StackingHelper.money(
          cumulativeCeiling,
        )}, which does cover it. Plan this as a multi-award path rather than one application.`,
      };
    }

    return {
      askCovered: false,
      cumulativeCeiling,
      askTarget,
      note: `No single award covers your ${StackingHelper.money(askTarget)} ask, and even stacked the mapped stops (${combination}) reach only ${StackingHelper.money(
        cumulativeCeiling,
      )}. Expect to pair this non-dilutive route with a bridge such as STRATFI/TACFI matching, state programs, or private capital to close the remaining ${StackingHelper.money(
        askTarget - cumulativeCeiling,
      )}.`,
    };
  }

  public static askTarget(profile: IStartupProfile): number {
    return EligibilityRulesHelper.readAmount(profile.askMax) ?? EligibilityRulesHelper.readAmount(profile.askMin) ?? 0;
  }

  private static money(amount: number): string {
    return `$${Math.round(amount).toLocaleString('en-US')}`;
  }
}
