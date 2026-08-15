import { IOpportunity } from '../firestore';
import { NON_GRANT_SIGNALS, SEQUENCING_DEFAULTS, TIER_CEILINGS } from './eligibility.constants';
import { ICandidate, ISequencedCandidate } from './route.interfaces';

export class SequencingHelper {
  public static sequence(rankedCandidates: ICandidate[]): ISequencedCandidate[] {
    const sequenced: ISequencedCandidate[] = [];
    const usedMonths = new Set<number>();
    let primaryCount = 0;

    for (const candidate of rankedCandidates) {
      if (SequencingHelper.isNonGrant(candidate.opportunity)) {
        sequenced.push({ candidate, placement: 'non-grant' });
        continue;
      }

      if (candidate.tier === TIER_CEILINGS.PROBABLY_NOT) {
        sequenced.push({ candidate, placement: 'off-route' });
        continue;
      }

      if (candidate.tier !== TIER_CEILINGS.ADJACENT && primaryCount < SEQUENCING_DEFAULTS.maxPrimaryStops) {
        const sequenceMonth = SequencingHelper.nextPrimaryMonth(candidate.opportunity, primaryCount, usedMonths);

        usedMonths.add(sequenceMonth);
        primaryCount += 1;
        sequenced.push({ candidate, placement: 'primary', sequenceMonth });
        continue;
      }

      sequenced.push({ candidate, placement: 'alongside' });
    }

    return SequencingHelper.enforceAlongsideAlignment(SequencingHelper.assignAlongsideMonths(SequencingHelper.demoteOrphanedAlongsides(sequenced)));
  }

  public static demoteOrphanedAlongsides(sequenced: ISequencedCandidate[]): ISequencedCandidate[] {
    if (SequencingHelper.primaryMonths(sequenced).length > 0) {
      return sequenced;
    }

    return sequenced.map((entry) =>
      entry.placement === 'alongside' ? { candidate: entry.candidate, placement: 'off-route' as const } : entry,
    );
  }

  public static assignAlongsideMonths(sequenced: ISequencedCandidate[]): ISequencedCandidate[] {
    const primaryMonths = SequencingHelper.primaryMonths(sequenced);

    if (primaryMonths.length === 0) {
      return sequenced.map((entry) => (entry.placement === 'alongside' ? { ...entry, sequenceMonth: undefined } : entry));
    }

    const earliest = primaryMonths[0];
    const latest = primaryMonths[primaryMonths.length - 1];

    return sequenced.map((entry) => {
      if (entry.placement !== 'alongside') {
        return entry;
      }

      const isLaterPhase = SequencingHelper.isLaterPhase(entry.candidate.opportunity);

      return { ...entry, sequenceMonth: isLaterPhase ? latest : earliest };
    });
  }

  public static enforceAlongsideAlignment(sequenced: ISequencedCandidate[]): ISequencedCandidate[] {
    const primaryMonths = SequencingHelper.primaryMonths(sequenced);

    return sequenced.map((entry) => {
      if (entry.placement !== 'alongside' || entry.sequenceMonth === undefined) {
        return entry;
      }

      if (primaryMonths.length === 0) {
        return { ...entry, sequenceMonth: undefined };
      }

      if (primaryMonths.includes(entry.sequenceMonth)) {
        return entry;
      }

      return { ...entry, sequenceMonth: SequencingHelper.nearestMonth(entry.sequenceMonth, primaryMonths) };
    });
  }

  public static primaryMonths(sequenced: ISequencedCandidate[]): number[] {
    const months = sequenced
      .filter((entry) => entry.placement === 'primary' && entry.sequenceMonth !== undefined)
      .map((entry) => entry.sequenceMonth as number);

    return [...new Set(months)].sort((first, second) => first - second);
  }

  public static stops(sequenced: ISequencedCandidate[]): ISequencedCandidate[] {
    return sequenced.filter((entry) => entry.placement === 'primary' || entry.placement === 'alongside');
  }

  public static isNonGrant(opportunity: IOpportunity): boolean {
    if (opportunity.placement === 'non-grant') {
      return true;
    }

    if (NON_GRANT_SIGNALS.sources.includes(opportunity.source)) {
      return true;
    }

    const haystack = `${opportunity.title} ${opportunity.description}`.toLowerCase();

    return NON_GRANT_SIGNALS.titleSignals.some((signal) => haystack.includes(signal));
  }

  private static isLaterPhase(opportunity: IOpportunity): boolean {
    return opportunity.programPhase !== undefined && SEQUENCING_DEFAULTS.laterPhases.includes(opportunity.programPhase);
  }

  private static nextPrimaryMonth(opportunity: IOpportunity, primaryIndex: number, usedMonths: Set<number>): number {
    const preferred = SequencingHelper.isLaterPhase(opportunity)
      ? SEQUENCING_DEFAULTS.phaseTwoMonth
      : SEQUENCING_DEFAULTS.primaryMonths[Math.min(primaryIndex, SEQUENCING_DEFAULTS.primaryMonths.length - 1)];
    let month = preferred;

    while (usedMonths.has(month) && month < SEQUENCING_DEFAULTS.horizonMonths) {
      month += 1;
    }

    return month;
  }

  private static nearestMonth(month: number, primaryMonths: number[]): number {
    return primaryMonths.reduce((closest, candidate) => {
      const currentDistance = Math.abs(candidate - month);
      const closestDistance = Math.abs(closest - month);

      if (currentDistance < closestDistance) {
        return candidate;
      }

      return currentDistance === closestDistance && candidate < closest ? candidate : closest;
    }, primaryMonths[0]);
  }
}
