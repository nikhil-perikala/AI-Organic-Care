import { inject } from '@angular/core';
import { CanActivateFn, Router, RouterStateSnapshot, ActivatedRouteSnapshot } from '@angular/router';
import { AuthService } from '../services/auth.service';

export const authGuard: CanActivateFn = (_route: ActivatedRouteSnapshot, state: RouterStateSnapshot) => {
  const auth = inject(AuthService);
  const router = inject(Router);

  // Already confirmed logged in
  if (auth.isLoggedIn()) return true;

  // Token exists in localStorage — session is still being restored after refresh.
  // Allow through; the interceptor will refresh the token if expired.
  if (auth.getAccessToken()) return true;

  return router.createUrlTree(['/auth/login'], {
    queryParams: { returnUrl: state.url },
  });
};
