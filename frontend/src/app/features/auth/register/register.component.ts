import { Component, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { CommonModule } from '@angular/common';
import { AbstractControl, FormBuilder, ReactiveFormsModule, ValidationErrors, Validators } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { AuthService } from '../../../core/services/auth.service';

function passwordsMatch(group: AbstractControl): ValidationErrors | null {
  const pw      = group.get('password')?.value;
  const confirm = group.get('confirmPassword')?.value;
  return pw && confirm && pw !== confirm ? { mismatch: true } : null;
}

@Component({
  selector: 'app-register',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, RouterLink, MatIconModule],
  template: `
    <div class="min-vh-100 d-flex align-items-center justify-content-center py-5 px-3" style="background:#f2f5f0">
      <div class="card shadow border-0 w-100" style="max-width:480px;border-radius:16px">
        <div class="card-body p-4 p-sm-5">

          <div class="text-center mb-4">
            <mat-icon style="font-size:44px;width:44px;height:44px;color:#4caf50">eco</mat-icon>
            <h4 class="fw-bold mt-2 mb-1">Create Your Wellness Profile</h4>
            <p class="text-muted small mb-0">Get personalized organic meal recommendations</p>
          </div>

          <form [formGroup]="form" (ngSubmit)="onSubmit()" novalidate>

            <div class="mb-3">
              <label class="form-label fw-semibold small">Full Name <span class="text-muted fw-normal">(optional)</span></label>
              <input type="text" class="form-control form-control-lg"
                formControlName="fullName" placeholder="Jane Doe">
            </div>

            <div class="mb-3">
              <label class="form-label fw-semibold small">Email address</label>
              <input type="email" class="form-control form-control-lg"
                [class.is-invalid]="form.get('email')?.hasError('email') && form.get('email')?.touched"
                formControlName="email" autocomplete="email" placeholder="you@example.com">
              <div class="invalid-feedback">Enter a valid email address</div>
            </div>

            <div class="mb-3">
              <label class="form-label fw-semibold small">Password</label>
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
            @if (success()) {
              <div class="alert alert-success py-2 small mb-3">
                <mat-icon style="font-size:16px;vertical-align:middle">check_circle</mat-icon>
                Account created! Redirecting to sign in...
              </div>
            }

            <button type="submit" class="btn btn-primary w-100 py-2 fw-semibold mt-1"
              [disabled]="form.invalid || loading() || success()">
              @if (loading()) {
                <span class="spinner-border spinner-border-sm me-2"></span>
              }
              Create Account
            </button>

          </form>

          <hr class="my-4">

          <div class="text-center">
            <p class="small mb-0">
              Already have an account?
              <a routerLink="/auth/login" class="fw-semibold text-decoration-none" style="color:#2e7d32">Sign in</a>
            </p>
          </div>

        </div>
      </div>
    </div>
  `,
  styles: [],
})
export class RegisterComponent {
  private fb    = inject(FormBuilder);
  private auth  = inject(AuthService);
  private router = inject(Router);

  form = this.fb.group({
    fullName:        [''],
    email:           ['', [Validators.required, Validators.email]],
    password:        ['', [Validators.required, Validators.minLength(8)]],
    confirmPassword: ['', Validators.required],
  }, { validators: passwordsMatch });

  loading      = signal(false);
  error        = signal('');
  success      = signal(false);
  showPassword = signal(false);

  onSubmit() {
    if (this.form.invalid) return;
    this.loading.set(true);
    this.error.set('');

    const { email, password, fullName } = this.form.value;
    this.auth.register(email!, password!, fullName || undefined).subscribe({
      next: () => {
        this.success.set(true);
        this.loading.set(false);
        setTimeout(() => this.router.navigate(['/auth/login']), 1500);
      },
      error: err => {
        this.error.set(err.error?.detail || 'Registration failed. Please try again.');
        this.loading.set(false);
      },
    });
  }
}
