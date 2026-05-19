import { Injectable, signal, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
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

@Injectable({ providedIn: 'root' })
export class AuthService {
  private http = inject(HttpClient);
  private readonly apiUrl = environment.apiUrl;

  currentUser = signal<UserOut | null>(null);
  isLoggedIn = signal(false);

  constructor() {
    if (this.getAccessToken()) {
      this.fetchMe().subscribe({
        next: user => {
          this.currentUser.set(user);
          this.isLoggedIn.set(true);
        },
        error: () => this.logout(),
      });
    }
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
        this.fetchMe().subscribe(user => this.currentUser.set(user));
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

  logout() {
    localStorage.removeItem('access_token');
    localStorage.removeItem('refresh_token');
    this.currentUser.set(null);
    this.isLoggedIn.set(false);
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