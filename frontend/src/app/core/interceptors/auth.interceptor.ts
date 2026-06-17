import { HttpInterceptorFn, HttpRequest, HttpHandlerFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { BehaviorSubject, catchError, filter, switchMap, take, throwError } from 'rxjs';
import { AuthService } from '../services/auth.service';

// Module-level state — shared across all interceptor invocations
let isRefreshing = false;
const refreshDone$ = new BehaviorSubject<string | null>(null);

export const authInterceptor: HttpInterceptorFn = (req: HttpRequest<unknown>, next: HttpHandlerFn) => {
  const auth   = inject(AuthService);
  const router = inject(Router);

  const withBearer = (r: HttpRequest<unknown>, token: string) =>
    r.clone({ setHeaders: { Authorization: `Bearer ${token}` } });

  const token = auth.getAccessToken();
  const authReq = token ? withBearer(req, token) : req;

  return next(authReq).pipe(
    catchError(err => {
      // Only intercept 401s that are NOT from auth endpoints (avoids infinite loops)
      if (err.status !== 401 || req.url.includes('/auth/')) {
        return throwError(() => err);
      }

      if (!isRefreshing) {
        isRefreshing = true;
        refreshDone$.next(null);

        return auth.refreshToken().pipe(
          switchMap(tokens => {
            isRefreshing = false;
            refreshDone$.next(tokens.access_token);
            return next(withBearer(req, tokens.access_token));
          }),
          catchError(refreshErr => {
            isRefreshing = false;
            auth.logout();
            router.navigate(['/auth/login']);
            return throwError(() => refreshErr);
          }),
        );
      }

      // Another request hit 401 while refresh is in flight — wait for new token
      return refreshDone$.pipe(
        filter((t): t is string => t !== null),
        take(1),
        switchMap(newToken => next(withBearer(req, newToken))),
      );
    }),
  );
};
