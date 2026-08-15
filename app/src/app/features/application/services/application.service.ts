import { Injectable, inject } from '@angular/core';
import { Functions, httpsCallable } from '@angular/fire/functions';
import { DocumentReference, Firestore, doc, docData, updateDoc } from '@angular/fire/firestore';
import { Observable, catchError, map, of } from 'rxjs';
import { FundPath } from '../../../../types/firestore';

// Backend callables (Task 5) run in 120s or less; give the client some
// headroom above that without going all the way to buildRoute's 300s
// (buildRoute does far more work — multiple LLM passes + search).
const STARTER_KIT_TIMEOUT_MS = 150000;
const SF424_TIMEOUT_MS = 150000;

interface IGenerateStarterKitRequest {
  routeId: string;
  stopId: string;
}

interface IGenerateStarterKitResponse {
  routeId: string;
  stopId: string;
  kit: FundPath.Firestore.Applications.IStarterKit;
}

/**
 * `applicantDetails` travels as plain JSON over the callable wire, so
 * `projectStartDate`/`projectEndDate` can't be sent as
 * `IApplicantDetails`'s Firestore `Timestamp` type — a client-constructed
 * `Timestamp`-shaped object would arrive server-side as a plain object, not
 * a real `Timestamp` instance (see `functions/src/types/index.ts`'s
 * `IGenerateSf424ApplicantDetails`, which this mirrors). We send these two
 * fields as `YYYY-MM-DD` strings straight from the `<input type="date">`
 * elements; `generateSf424` converts them to real `Timestamp`s server-side.
 */
export type IApplicantDetailsWire = Omit<FundPath.Firestore.Applications.IApplicantDetails, 'projectStartDate' | 'projectEndDate'> & {
  projectStartDate?: string;
  projectEndDate?: string;
};

interface IGenerateSf424Request {
  routeId: string;
  stopId: string;
  applicantDetails: IApplicantDetailsWire;
}

export interface IGenerateSf424Response {
  url?: string;
  base64?: string;
  expiresAt?: string;
}

@Injectable({ providedIn: 'root' })
export class ApplicationService {
  private readonly _functions = inject(Functions);
  private readonly _firestore = inject(Firestore);

  public async generateStarterKit(routeId: string, stopId: string): Promise<FundPath.Firestore.Applications.IStarterKit> {
    const fn = httpsCallable<IGenerateStarterKitRequest, IGenerateStarterKitResponse>(
      this._functions,
      'generateStarterKit',
      { timeout: STARTER_KIT_TIMEOUT_MS }
    );
    const result = await fn({ routeId, stopId });

    return result.data.kit;
  }

  public async generateSf424(
    routeId: string,
    stopId: string,
    applicantDetails: IApplicantDetailsWire
  ): Promise<IGenerateSf424Response> {
    const fn = httpsCallable<IGenerateSf424Request, IGenerateSf424Response>(
      this._functions,
      'generateSf424',
      { timeout: SF424_TIMEOUT_MS }
    );
    const result = await fn({ routeId, stopId, applicantDetails });

    return result.data;
  }

  public async setTaskState(routeId: string, taskId: string, done: boolean): Promise<void> {
    const routeRef = doc(this._firestore, 'routes', routeId);

    await updateDoc(routeRef, { [`taskState.${taskId}`]: done });
  }

  /** Shared checkbox-state logic used by both StopComponent and ApplicationComponent. */
  public isTaskChecked(taskState: Record<string, boolean>, task: FundPath.Firestore.Routes.ITask): boolean {
    return task.id in taskState ? taskState[task.id] : task.completed;
  }

  /** Fire-and-forget write, matching how this app doesn't block on Firestore writes elsewhere. */
  public toggleTask(routeId: string, taskId: string, currentState: boolean): void {
    this.setTaskState(routeId, taskId, !currentState).catch((err: unknown) => {
      console.error('Failed to persist task state', err);
    });
  }

  public watchApplicantDetails(uid: string): Observable<FundPath.Firestore.Applications.IApplicantDetails | undefined> {
    const profileRef = doc(this._firestore, 'profiles', uid) as DocumentReference<FundPath.Firestore.Profiles.IStartupProfile>;

    return docData(profileRef).pipe(
      map((profile) => profile?.applicantDetails),
      catchError(() => of(undefined))
    );
  }
}
