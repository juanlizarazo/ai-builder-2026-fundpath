import { Injectable, inject } from '@angular/core';
import { DocumentReference, Firestore, doc, docData } from '@angular/fire/firestore';
import { Observable, catchError, map, of } from 'rxjs';
import { FundPath } from '../../../types/firestore';

type IStats = FundPath.Firestore.CorpusMeta.IStats;

/**
 * Number of distinct upstream sources rolled into `corpusMeta/stats`.
 * Kept in lockstep with the count fields `runSync` writes in
 * `functions/src/ingest/sync.function.ts` — `countGrantsGovHydrated` is a
 * subset of `countGrantsGov`, not a distinct source, so it is excluded.
 */
export const CORPUS_SOURCE_COUNT = 6;

@Injectable({ providedIn: 'root' })
export class CorpusService {
  private readonly _firestore = inject(Firestore);

  public readonly stats$: Observable<IStats | null> = docData(
    doc(this._firestore, 'corpusMeta', 'stats') as DocumentReference<IStats>
  ).pipe(
    map((stats) => stats ?? null),
    catchError(() => of(null))
  );
}
