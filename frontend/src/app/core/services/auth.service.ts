import { Injectable, signal, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import { tap } from 'rxjs/operators';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';

export interface UserOut {
  id: string;
  email: string;
  full_name: string | null;
  is_active: boolean;
  created_at: string;
}

export interface TokenOut {
  access_token: string;
  refresh_token: string;
  token_type: string;
}

const USER_KEY = 'current_user';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private http   = inject(HttpClient);
  private router = inject(Router);
  private readonly apiUrl = environment.apiUrl;

  currentUser = signal<UserOut | null>(null);
  isLoggedIn  = signal(false);

  constructor() {
    if (!this.getAccessToken()) return;

    // 1. Restore user from cache instantly — no network flash.
    const cached = localStorage.getItem(USER_KEY);
    if (cached) {
      try {
        this.currentUser.set(JSON.parse(cached));
      } catch {}
    }
    this.isLoggedIn.set(true);

    // 2. Validate token and refresh user data from backend.
    //    The interceptor handles 401 → token refresh → retry automatically.
    this.fetchMe().subscribe({
      next: user => {
        this.currentUser.set(user);
        localStorage.setItem(USER_KEY, JSON.stringify(user));
      },
      error: (err) => {
        // Only fully sign out on definitive auth failures.
        // Network errors / 5xx keep the cached session alive.
        if (err?.status === 401 || err?.status === 403) {
          this.logout();
        }
      },
    });
  }

  register(email: string, password: string, fullName?: string): Observable<UserOut> {
    return this.http.post<UserOut>(`${this.apiUrl}/auth/register`, {
      email,
      password,
      full_name: fullName,
    });
  }

  login(email: string, password: string): Observable<TokenOut> {
    return this.http.post<TokenOut>(`${this.apiUrl}/auth/login`, {
      email,
      password,
    }).pipe(
      tap(tokens => {
        localStorage.setItem('access_token', tokens.access_token);
        localStorage.setItem('refresh_token', tokens.refresh_token);
        this.isLoggedIn.set(true);
        this.fetchMe().subscribe({
          next: user => {
            this.currentUser.set(user);
            localStorage.setItem(USER_KEY, JSON.stringify(user));
          },
          error: (err) => {
            if (err?.status === 401 || err?.status === 403) this.logout();
          },
        });
      })
    );
  }

  refreshToken(): Observable<TokenOut> {
    const refresh_token = localStorage.getItem('refresh_token') ?? '';
    return this.http.post<TokenOut>(`${this.apiUrl}/auth/refresh`, {
      refresh_token,
    }).pipe(
      tap(tokens => {
        localStorage.setItem('access_token', tokens.access_token);
        localStorage.setItem('refresh_token', tokens.refresh_token);
      })
    );
  }

  logout(): void {
    localStorage.removeItem('access_token');
    localStorage.removeItem('refresh_token');
    localStorage.removeItem(USER_KEY);
    this.currentUser.set(null);
    this.isLoggedIn.set(false);
    this.router.navigate(['/auth/login']);
  }

  fetchMe(): Observable<UserOut> {
    return this.http.get<UserOut>(`${this.apiUrl}/users/me`);
  }

  getAccessToken(): string | null {
    return localStorage.getItem('access_token');
  }

  forgotPassword(email: string): Observable<{ message: string }> {
    return this.http.post<{ message: string }>(`${this.apiUrl}/auth/forgot-password`, {
      email,
    });
  }

  verifyOtp(email: string, otp: string): Observable<{ reset_token: string }> {
    return this.http.post<{ reset_token: string }>(`${this.apiUrl}/auth/verify-otp`, {
      email,
      otp,
    });
  }

  resetPassword(token: string, new_password: string): Observable<{ message: string }> {
    return this.http.post<{ message: string }>(`${this.apiUrl}/auth/reset-password`, {
      token,
      new_password,
    });
  }
}
