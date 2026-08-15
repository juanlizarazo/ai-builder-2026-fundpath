import { inject } from '@angular/core';
import { CanActivateFn, Router, RouterStateSnapshot } from '@angular/router';
import { Auth } from '@angular/fire/auth';

export const authGuard: CanActivateFn = async (_route, state: RouterStateSnapshot) => {
  const auth = inject(Auth);
  const router = inject(Router);

  await auth.authStateReady();

  if (auth.currentUser && !auth.currentUser.isAnonymous) {
    return true;
  }

  return router.createUrlTree(['/auth/login'], { queryParams: { redirectTo: state.url } });
};
