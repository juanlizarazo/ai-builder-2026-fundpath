import { APP_INITIALIZER, ApplicationConfig, isDevMode, provideZoneChangeDetection } from '@angular/core';
import { provideRouter } from '@angular/router';
import { provideAnimationsAsync } from '@angular/platform-browser/animations/async';
import { initializeApp, provideFirebaseApp } from '@angular/fire/app';
import { getFirestore, provideFirestore } from '@angular/fire/firestore';
import { getAuth, provideAuth } from '@angular/fire/auth';
import { connectFunctionsEmulator, getFunctions, provideFunctions } from '@angular/fire/functions';
import { provideHttpClient } from '@angular/common/http';
import { routes } from './app.routes';
import { AuthService } from '@app/core';

export const firebaseConfig = {
  apiKey: 'AIzaSyDgsn5M4e0GCz1FAugpmmt0XiAN3gr7vAE',
  authDomain: 'ai-builder-2026-fundpath.firebaseapp.com',
  projectId: 'ai-builder-2026-fundpath',
  storageBucket: 'ai-builder-2026-fundpath.firebasestorage.app',
  messagingSenderId: '695847904476',
  appId: '1:695847904476:web:77abd02636ffbc2db58019',
  measurementId: 'G-YHE7CNT9PM'
};

export const appConfig: ApplicationConfig = {
  providers: [
    provideZoneChangeDetection({ eventCoalescing: true }),
    provideRouter(routes),
    provideAnimationsAsync(),
    provideFirebaseApp(() => initializeApp(firebaseConfig)),
    provideFirestore(() => getFirestore()),
    provideAuth(() => getAuth()),
    provideHttpClient(),
    provideFunctions(() => {
      const functions = getFunctions();

      if (isDevMode()) {
        connectFunctionsEmulator(functions, 'localhost', 5001);
      }

      return functions;
    }),
    {
      provide: APP_INITIALIZER,
      useFactory: (authService: AuthService) => () => authService.initializeAnonymousAuth(),
      deps: [AuthService],
      multi: true
    }
  ]
};
