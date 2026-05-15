import { Component, inject, signal, OnInit } from '@angular/core';
import { Router, RouterLink, ActivatedRoute } from '@angular/router';
import { CommonModule } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators, AbstractControl, ValidationErrors } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { AuthService } from '../../../core/services/auth.service';

function passwordsMatch(group: AbstractControl): ValidationErrors | null {
  const pw      = group.get('password')?.value;
  const confirm = group.get('confirmPassword')?.value;
  return pw && confirm && pw !== confirm ? { mismatch: true } : null;
}

@Component({
  selector: 'app-reset-password',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, RouterLink, MatIconModule],
  template: `
    <div class="min-vh-100 d-flex align-items-center justify-content-center py-5 px-3" style="background:#f2f5f0">
      <div class="card shadow border-0 w-100" style="max-width:440px;border-radius:16px">
        <div class="card-body p-4 p-sm-5">

          <div class="text-center mb-4">
            <mat-icon style="font-size:44px;width:44px;height:44px;color:#4caf50">eco</mat-icon>
            <h4 class="fw-bold mt-2 mb-1">Set a new password</h4>
            <p class="text-muted small mb-0">Choose a strong password for your account.</p>
          </div>

          @if (!token()) {
            <div class="alert alert-danger text-center">
              Invalid or missing reset link. Please request a new one.
            </div>
            <div class="text-center mt-3">
              <a routerLink="/auth/forgot-password" class="btn btn-primary">Request new link</a>
            </div>
          } @else if (success()) {
            <div class="text-center py-3">
              <div style="font-size:52px">✅</div>
              <h5 class="fw-bold mt-3 mb-2">Password updated!</h5>
              <p class="text-muted small mb-4">You can now sign in with your new password.</p>
              <a routerLink="/auth/login" class="btn btn-primary w-100 fw-semibold py-2">Go to Sign In</a>
            </div>
          } @else {
            <form [formGroup]="form" (ngSubmit)="onSubmit()" novalidate>

              <div class="mb-3">
                <label class="form-label fw-semibold small">New Password</label>
                <div class="input-group">
                  <input [type]="showPassword() ? 'text' : 'password'"
                    class="form-control form-control-lg"
                    [class.is-invalid]="form.get('password')?.hasError('minlength') && form.get('password')?.touched"
                    formControlName="password" autocomplete="new-password" placeholder="Min. 8 characters">
                  <button type="button" class="btn btn-outline-secondary"
                    (click)="showPassword.set(!showPassword())">
                    <mat-icon style="font-size:20px;line-height:1;vertical-align:middle">
                      {{ showPassword() ? 'visibility_off' : 'visibility' }}
                    </mat-icon>
                  </button>
                  <div class="invalid-feedback">Password must be at least 8 characters</div>
                </div>
              </div>

              <div class="mb-3">
                <label class="form-label fw-semibold small">Confirm Password</label>
                <input [type]="showPassword() ? 'text' : 'password'"
                  class="form-control form-control-lg"
                  [class.is-invalid]="form.hasError('mismatch') && form.get('confirmPassword')?.touched"
                  formControlName="confirmPassword" autocomplete="new-password" placeholder="Repeat password">
                <div class="invalid-feedback">Passwords do not match</div>
              </div>

              @if (error()) {
                <div class="alert alert-danger py-2 small mb-3">{{ error() }}</div>
              }

              <button type="submit" class="btn btn-primary w-100 py-2 fw-semibold"
                [disabled]="form.invalid || loading()">
                @if (loading()) {
                  <span class="spinner-border spinner-border-sm me-2"></span>
                }
                Reset Password
              </button>

            </form>
          }

          @if (!success()) {
            <hr class="my-4">
            <div class="text-center">
              <a routerLink="/auth/login" class="text-muted small text-decoration-none">
                ← Back to Sign In
              </a>
            </div>
          }

        </div>
      </div>
    </div>
  `,
  styles: [],
})
export class ResetPasswordComponent implements OnInit {
  private fb    = inject(FormBuilder);
  private auth  = inject(AuthService);
  private route = inject(ActivatedRoute);
  private router = inject(Router);

  form = this.fb.group({
    password:        ['', [Validators.required, Validators.minLength(8)]],
    confirmPassword: ['', Validators.required],
  }, { validators: passwordsMatch });

  token        = signal('');
  loading      = signal(false);
  error        = signal('');
  success      = signal(false);
  showPassword = signal(false);

  ngOnInit() {
    const t = this.route.snapshot.queryParamMap.get('token') ?? '';
    this.token.set(t);
  }

  onSubmit() {
    if (this.form.invalid || !this.token()) return;
    this.loading.set(true);
    this.error.set('');

    this.auth.resetPassword(this.token(), this.form.value.password!).subscribe({
      next: () => {
        this.success.set(true);
        this.loading.set(false);
      },
      error: err => {
        this.error.set(err.error?.detail || 'Reset failed. The link may have expired. Please request a new one.');
        this.loading.set(false);
      },
    });
  }
}
