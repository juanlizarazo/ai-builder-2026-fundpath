import { IEligibilityFlag } from '../firestore';
import { FLAG_CODES } from './eligibility.constants';
import { IAbstentionVerdict, ISequencedCandidate } from './route.interfaces';
import { SequencingHelper } from './sequencing.helper';
import { TieringHelper } from './tiering.helper';

export class AbstentionHelper {
  public static decide(sequenced: ISequencedCandidate[]): IAbstentionVerdict {
    const stops = SequencingHelper.stops(sequenced);

    if (stops.length === 0) {
      return {
        abstain: true,
        verdictLine: 'We found no strong federal grant match for this company right now.',
        reason: AbstentionHelper.abstentionReason(sequenced),
      };
    }

    const leadStop = stops[0];
    const leadOpportunity = leadStop.candidate.opportunity;
    const alongsideCount = stops.filter((entry) => entry.placement === 'alongside').length;
    const alongsideClause = alongsideCount > 0 ? `, with ${alongsideCount} program${alongsideCount === 1 ? '' : 's'} to run alongside it` : '';

    return {
      abstain: false,
      verdictLine: `Your strongest federal route starts with ${leadOpportunity.title} at ${leadOpportunity.agency} — ${TieringHelper.label(
        leadStop.candidate.tier,
      )}${alongsideClause}.`,
      reason: `${stops.length} program${stops.length === 1 ? '' : 's'} survived every eligibility rule we apply, and they are sequenced across the next 12 months so each application builds on the last.`,
    };
  }

  public static abstentionReason(sequenced: ISequencedCandidate[]): string {
    const rejected = sequenced.filter((entry) => entry.placement === 'off-route');

    if (rejected.length === 0) {
      return 'Nothing in the federal corpus we searched matched this company closely enough to recommend. Rather than stretch a weak match into a strong-sounding one, we are recommending non-grant paths instead — state programs, SBA lending, and private capital.';
    }

    const blockingFlags = rejected.flatMap((entry) => entry.candidate.flags).filter((flag) => flag.severity === 'block');
    const explanation = AbstentionHelper.summarizeBlockers(blockingFlags);

    return `We evaluated ${rejected.length} federal program${
      rejected.length === 1 ? '' : 's'
    } and every one failed a hard eligibility rule. ${explanation} Forcing a match here would be a guess, so we are pointing to non-grant alternatives instead.`;
  }

  private static summarizeBlockers(blockingFlags: IEligibilityFlag[]): string {
    const codes = new Set(blockingFlags.map((flag) => flag.code));
    const reasons: string[] = [];

    if (codes.has(FLAG_CODES.APPLICANT_TYPE_INELIGIBLE)) {
      reasons.push('the relevant programs are restricted to state and local governments, nonprofits, or higher education, so a for-profit startup cannot be the applicant');
    }

    if (codes.has(FLAG_CODES.NO_RD_CORE)) {
      reasons.push('SBIR and STTR require a genuine research-and-development core, which this product does not present');
    }

    if (codes.has(FLAG_CODES.SBIR_EMPLOYEE_LIMIT)) {
      reasons.push('headcount exceeds the 500-employee SBIR size standard');
    }

    if (codes.has(FLAG_CODES.US_OWNERSHIP_REQUIRED)) {
      reasons.push('the ownership structure does not meet the 51% US ownership and control requirement');
    }

    if (reasons.length === 0) {
      return 'Each was ruled out by a documented eligibility rule rather than by a scoring threshold.';
    }

    return `Specifically: ${reasons.join('; ')}.`;
  }
}
