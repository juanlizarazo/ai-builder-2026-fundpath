import { Injectable, inject } from '@angular/core';
import {
  Auth,
  GoogleAuthProvider,
  User,
  authState,
  signInAnonymously,
  signInWithPopup,
  signOut
} from '@angular/fire/auth';
import { Firestore, doc, serverTimestamp, setDoc } from '@angular/fire/firestore';
import { Observable, map } from 'rxjs';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly _auth = inject(Auth);
  private readonly _firestore = inject(Firestore);

  public readonly user$: Observable<User | null> = authState(this._auth);
  public readonly isAnonymous$: Observable<boolean> = this.user$.pipe(
    map((user) => user?.isAnonymous ?? true)
  );
  public readonly isAuthenticated$: Observable<boolean> = this.user$.pipe(
    map((user) => !!user && !user.isAnonymous)
  );

  public async initializeAnonymousAuth(): Promise<void> {
    await this._auth.authStateReady();

    if (!this._auth.currentUser) {
      await signInAnonymously(this._auth);
    }
  }

  public async signInWithGoogle(): Promise<void> {
    const provider = new GoogleAuthProvider();
    const credential = await signInWithPopup(this._auth, provider);

    await this._upsertUser(credential.user);
  }

  public async signOut(): Promise<void> {
    await signOut(this._auth);
  }

  private async _upsertUser(user: User): Promise<void> {
    const userRef = doc(this._firestore, 'users', user.uid);

    await setDoc(
      userRef,
      {
        uid: user.uid,
        email: user.email ?? '',
        displayName: user.displayName ?? '',
        photoURL: user.photoURL ?? null,
        createdAt: serverTimestamp()
      },
      { merge: true }
    );
  }
}
