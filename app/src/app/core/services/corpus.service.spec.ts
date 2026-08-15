import { TestBed } from '@angular/core/testing';
import { firstValueFrom, of, throwError } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@angular/fire/firestore', () => ({
  Firestore: class {},
  doc: vi.fn((_firestore: unknown, ...pathSegments: string[]) => ({ path: pathSegments.join('/') })),
  docData: vi.fn()
}));

import { Firestore, doc, docData } from '@angular/fire/firestore';

import { CORPUS_SOURCE_COUNT, CorpusService } from './corpus.service';

function createService(): CorpusService {
  TestBed.configureTestingModule({ providers: [{ provide: Firestore, useValue: {} }] });

  return TestBed.inject(CorpusService);
}

describe('CorpusService', () => {
  it('reads the corpusMeta/stats document', async () => {
    (docData as ReturnType<typeof vi.fn>).mockReturnValue(of({ totalCount: 2143 }));

    const service = createService();
    const stats = await firstValueFrom(service.stats$);

    expect(doc).toHaveBeenCalledWith(expect.anything(), 'corpusMeta', 'stats');
    expect(stats).toEqual({ totalCount: 2143 });
  });

  it('maps a missing document to null', async () => {
    (docData as ReturnType<typeof vi.fn>).mockReturnValue(of(undefined));

    const service = createService();
    const stats = await firstValueFrom(service.stats$);

    expect(stats).toBeNull();
  });

  it('swallows read errors and emits null', async () => {
    (docData as ReturnType<typeof vi.fn>).mockReturnValue(throwError(() => new Error('permission-denied')));

    const service = createService();
    const stats = await firstValueFrom(service.stats$);

    expect(stats).toBeNull();
  });

  it('exposes the number of distinct upstream sources rolled into the stats doc', () => {
    expect(CORPUS_SOURCE_COUNT).toBe(6);
  });
});
