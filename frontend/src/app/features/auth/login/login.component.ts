import { Component, inject, signal } from '@angular/core';
import { Router, RouterLink, ActivatedRoute } from '@angular/router';
import { CommonModule } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { AuthService } from '../../../core/services/auth.service';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, RouterLink, MatIconModule],
  template: `
    <div class="min-vh-100 d-flex align-items-center justify-content-center py-5 px-3" style="background:#f2f5f0">
      <div class="card shadow border-0 w-100" style="max-width:440px;border-radius:16px">
        <div class="card-body p-4 p-sm-5">

          <div class="text-center mb-4">
            <mat-icon style="font-size:44px;width:44px;height:44px;color:#4caf50">eco</mat-icon>
            <h4 class="fw-bold mt-2 mb-0">Sign In to Organic Care AI</h4>
            <p class="text-muted small mt-1">Eat Organic, Live Healthy</p>
          </div>

          <form [formGroup]="form" (ngSubmit)="onSubmit()" novalidate>

            <div class="mb-3">
              <label class="form-label fw-semibold small">Email address</label>
              <input type="email" class="form-control form-control-lg"
                [class.is-invalid]="form.get('email')?.hasError('email') && form.get('email')?.touched"
                formControlName="email" autocomplete="email" placeholder="you@example.com">
              <div class="invalid-feedback">Enter a valid email address</div>
            </div>

            <div class="mb-3">
              <div class="d-flex justify-content-between align-items-center">
                <label class="form-label fw-semibold small mb-0">Password</label>
                <a routerLink="/auth/forgot-password" class="text-decoration-none small" style="color:#2e7d32">
                  Forgot password?
                </a>
              </div>
              <div class="input-group mt-1">
                <input [type]="showPassword() ? 'text' : 'password'"
                  class="form-control form-control-lg" formControlName="password"
                  autocomplete="current-password" placeholder="Your password">
                <button type="button" class="btn btn-outline-secondary"
                  (click)="showPassword.set(!showPassword())">
                  <mat-icon style="font-size:20px;line-height:1;vertical-align:middle">
                    {{ showPassword() ? 'visibility_off' : 'visibility' }}
                  </mat-icon>
                </button>
              </div>
            </div>

            @if (error()) {
              <div class="alert alert-danger py-2 small mb-3">{{ error() }}</div>
            }

            <button type="submit" class="btn btn-primary w-100 py-2 fw-semibold mt-1"
              [disabled]="form.invalid || loading()">
              @if (loading()) {
                <span class="spinner-border spinner-border-sm me-2"></span>
              }
              Sign In
            </button>

          </form>

          <hr class="my-4">

          <div class="text-center">
            <p class="small mb-1">
              Don't have an account?
              <a routerLink="/auth/register" class="fw-semibold text-decoration-none" style="color:#2e7d32">Create one</a>
            </p>
            <p class="small mb-0">
              <a routerLink="/" class="text-muted text-decoration-none">Continue without account</a>
            </p>
          </div>

        </div>
      </div>
    </div>
  `,
  styles: [],
})
export class LoginComponent {
  private fb    = inject(FormBuilder);
  private auth  = inject(AuthService);
  private router = inject(Router);
  private route  = inject(ActivatedRoute);

  form = this.fb.group({
    email:    ['', [Validators.required, Validators.email]],
    password: ['', Validators.required],
  });

  loading      = signal(false);
  error        = signal('');
  showPassword = signal(false);

  onSubmit() {
    if (this.form.invalid) return;
    this.loading.set(true);
    this.error.set('');

    const { email, password } = this.form.value;
    this.auth.login(email!, password!).subscribe({
      next: () => {
        const returnUrl = this.route.snapshot.queryParamMap.get('returnUrl') || '/';
        this.router.navigateByUrl(returnUrl);
      },
      error: err => {
        this.error.set(err.error?.detail || 'Invalid credentials. Please try again.');
        this.loading.set(false);
      },
    });
  }
}
