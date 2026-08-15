import { Timestamp } from 'firebase-admin/firestore';
import { describe, expect, it } from 'vitest';
import { ITask } from '../firestore';
import { resolveDocuments } from './application.constants';
import { StarterKitService } from './starter-kit.service';

describe('resolveDocuments — gating logic', () => {
  it('returns only the general federal baseline for a non-SBIR/STTR grant', () => {
    const documents = resolveDocuments({});
    const ids = documents.map(doc => doc.id);

    expect(ids).toEqual([
      'sf424',
      'sf424a-budget',
      'sf424a-justification',
      'project-narrative',
      'facilities-equipment',
      'letters-of-support',
    ]);
  });

  it('adds SBIR/STTR-specific documents when isSbir is true', () => {
    const documents = resolveDocuments({ isSbir: true });
    const ids = documents.map(doc => doc.id);

    expect(ids).toContain('biosketches');
    expect(ids).toContain('current-pending-support');
    expect(ids).toContain('sbir-sttr-certification');
    expect(ids).not.toContain('commercialization-plan');
  });

  it('adds SBIR/STTR-specific documents when isSttr is true (independent of isSbir)', () => {
    const documents = resolveDocuments({ isSttr: true });
    const ids = documents.map(doc => doc.id);

    expect(ids).toContain('biosketches');
    expect(ids).toContain('sbir-sttr-certification');
  });

  it('adds the commercialization plan only for Phase II', () => {
    const phaseOne = resolveDocuments({ isSbir: true, programPhase: 'I' });
    const phaseTwo = resolveDocuments({ isSbir: true, programPhase: 'II' });

    expect(phaseOne.map(doc => doc.id)).not.toContain('commercialization-plan');
    expect(phaseTwo.map(doc => doc.id)).toContain('commercialization-plan');
  });

  it('never invents a formUrl for agency-specific documents, only SF-424/SF-424A', () => {
    const documents = resolveDocuments({ isSbir: true, programPhase: 'II' });

    for (const doc of documents) {
      if (doc.id === 'sf424' || doc.id === 'sf424a-budget') {
        expect(doc.formUrl).toBeDefined();
      } else {
        expect(doc.formUrl).toBeUndefined();
      }
    }
  });
});

describe('StarterKitService.dedupeTasks', () => {
  const existing: ITask[] = [
    { id: 'stop-1-kit-sam-gov-registration', label: 'old label', completed: true, category: 'registration', source: 'kit' },
  ];

  it('appends new tasks that are not already present by id', () => {
    const incoming: ITask[] = [
      { id: 'stop-1-kit-sam-gov-registration', label: 'new label', completed: false, category: 'registration', source: 'kit' },
      { id: 'stop-1-kit-sf424', label: 'Prepare: SF-424', completed: false, category: 'document', source: 'kit' },
    ];

    const result = StarterKitService.dedupeTasks(existing, incoming);

    expect(result).toHaveLength(2);
    expect(result[0]).toEqual(existing[0]);
    expect(result[1].id).toBe('stop-1-kit-sf424');
  });

  it('is idempotent across repeated kit regeneration', () => {
    const incoming: ITask[] = [
      { id: 'stop-1-kit-sam-gov-registration', label: 'new label', completed: false, category: 'registration', source: 'kit' },
    ];

    const once = StarterKitService.dedupeTasks(existing, incoming);
    const twice = StarterKitService.dedupeTasks(once, incoming);

    expect(twice).toHaveLength(1);
  });

  it('preserves the completed flag of an existing task rather than resetting it', () => {
    const incoming: ITask[] = [
      { id: 'stop-1-kit-sam-gov-registration', label: 'new label', completed: false, category: 'registration', source: 'kit' },
    ];

    const result = StarterKitService.dedupeTasks(existing, incoming);

    expect(result[0].completed).toBe(true);
  });
});

describe('StarterKitService.buildKitTasks', () => {
  it('builds one registration task per timeline step and one document task per document', () => {
    const timeline = {
      mode: 'earliest-ready' as const,
      submitBy: Timestamp.now(),
      steps: [
        {
          key: 'sam-gov-registration',
          label: 'SAM.gov UEI + entity registration',
          system: 'SAM.gov',
          durationBusinessDays: 15,
          startBy: Timestamp.now(),
          completeBy: Timestamp.now(),
        },
      ],
      feasible: true,
      slackBusinessDays: 0,
      headline: 'headline',
    };
    const documents = resolveDocuments({});
    const stop = {
      id: 'stop-1',
      title: 'Program',
      agency: 'Agency',
      fitTier: 'likely' as const,
      fitTierLabel: 'Likely fit',
      placement: 'primary' as const,
      eligibilityFlags: [],
      tasks: [],
    };

    const tasks = StarterKitService.buildKitTasks(stop, timeline, documents);

    expect(tasks).toHaveLength(1 + documents.length);
    expect(tasks[0].id).toBe('stop-1-kit-sam-gov-registration');
    expect(tasks[0].category).toBe('registration');
    expect(tasks[0].dueDate).toBe(timeline.steps[0].completeBy);
    expect(tasks[1].category).toBe('document');
    expect(tasks[1].dueDate).toBe(timeline.submitBy);
    expect(tasks.every(task => task.source === 'kit')).toBe(true);
  });

  it('skips the SAM.gov and SBA Company Registry kit tasks when RouteBuilderService already put the legacy task on the stop', () => {
    const timeline = {
      mode: 'earliest-ready' as const,
      submitBy: Timestamp.now(),
      steps: [
        {
          key: 'sam-gov-registration',
          label: 'SAM.gov UEI + entity registration',
          system: 'SAM.gov',
          durationBusinessDays: 15,
          startBy: Timestamp.now(),
          completeBy: Timestamp.now(),
        },
        {
          key: 'sba-company-registry',
          label: 'SBA Company Registry (SBC control ID)',
          system: 'SBA Company Registry',
          durationBusinessDays: 5,
          startBy: Timestamp.now(),
          completeBy: Timestamp.now(),
        },
      ],
      feasible: true,
      slackBusinessDays: 0,
      headline: 'headline',
    };
    const documents = resolveDocuments({});
    const stop = {
      id: 'stop-1',
      title: 'Program',
      agency: 'Agency',
      fitTier: 'likely' as const,
      fitTierLabel: 'Likely fit',
      placement: 'primary' as const,
      eligibilityFlags: [],
      isSbir: true,
      tasks: [
        {
          id: 'stop-1-uei',
          label: 'Confirm an active SAM.gov UEI registration (allow 10–15 business days)',
          completed: true,
          category: 'registration' as const,
        },
        {
          id: 'stop-1-registry',
          label: 'Register in the SBA Company Registry and obtain your SBC control ID',
          completed: false,
          category: 'registration' as const,
        },
      ],
    };

    const tasks = StarterKitService.buildKitTasks(stop, timeline, documents);

    expect(tasks.map(task => task.id)).not.toContain('stop-1-kit-sam-gov-registration');
    expect(tasks.map(task => task.id)).not.toContain('stop-1-kit-sba-company-registry');
    expect(tasks).toHaveLength(documents.length);
  });
});
