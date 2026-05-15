import { Component, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { CommonModule } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators, AbstractControl, ValidationErrors } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { AuthService } from '../../../core/services/auth.service';

function passwordsMatch(group: AbstractControl): ValidationErrors | null {
  const pw      = group.get('password')?.value;
  const confirm = group.get('confirmPassword')?.value;
  return pw && confirm && pw !== confirm ? { mismatch: true } : null;
}

type Step = 'email' | 'otp' | 'password' | 'done';

@Component({
  selector: 'app-forgot-password',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, RouterLink, MatIconModule],
  template: `
    <div class="min-vh-100 d-flex align-items-center justify-content-center py-5 px-3" style="background:#f2f5f0">
      <div class="card shadow border-0 w-100" style="max-width:440px;border-radius:16px">
        <div class="card-body p-4 p-sm-5">

          <!-- Header -->
          <div class="text-center mb-4">
            <mat-icon style="font-size:44px;width:44px;height:44px;color:#4caf50">eco</mat-icon>
            <h4 class="fw-bold mt-2 mb-1">
              @switch (step()) {
                @case ('email')    { Forgot your password? }
                @case ('otp')      { Enter verification code }
                @case ('password') { Set a new password }
                @case ('done')     { Password updated! }
              }
            </h4>
            <p class="text-muted small mb-0">
              @switch (step()) {
                @case ('email')    { Enter your email and we'll send a 6-digit code. }
                @case ('otp')      { We sent a 6-digit code to <strong>{{ sentEmail() }}</strong>. }
                @case ('password') { Choose a strong new password for your account. }
                @case ('done')     { You can now sign in with your new password. }
              }
            </p>
          </div>

          <!-- Step indicator -->
          @if (step() !== 'done') {
            <div class="d-flex align-items-center justify-content-center gap-2 mb-4">
              @for (s of steps; track s.key) {
                <div class="step-dot" [class.active]="step() === s.key" [class.done]="isStepDone(s.key)">
                  @if (isStepDone(s.key)) { <mat-icon style="font-size:13px;color:#fff">check</mat-icon> }
                  @else { {{ s.num }} }
                </div>
                @if (!$last) { <div class="step-line" [class.done]="isStepDone(s.key)"></div> }
              }
            </div>
          }

          <!-- ── STEP 1: Email ── -->
          @if (step() === 'email') {
            <form [formGroup]="emailForm" (ngSubmit)="submitEmail()" novalidate>
              <div class="mb-3">
                <label class="form-label fw-semibold small">Email address</label>
                <input type="email" class="form-control form-control-lg"
                  [class.is-invalid]="emailForm.get('email')?.invalid && emailForm.get('email')?.touched"
                  formControlName="email" autocomplete="email" placeholder="you@example.com">
                <div class="invalid-feedback">Enter a valid email address</div>
              </div>
              @if (error()) {
                <div class="alert alert-danger py-2 small mb-3">{{ error() }}</div>
              }
              <button type="submit" class="btn btn-primary w-100 py-2 fw-semibold"
                [disabled]="emailForm.invalid || loading()">
                @if (loading()) { <span class="spinner-border spinner-border-sm me-2"></span> }
                Send Verification Code
              </button>
            </form>
          }

          <!-- ── STEP 2: OTP ── -->
          @if (step() === 'otp') {
            <form [formGroup]="otpForm" (ngSubmit)="submitOtp()" novalidate>
              <div class="mb-3">
                <label class="form-label fw-semibold small">6-digit code</label>
                <input type="text" class="form-control form-control-lg text-center otp-input"
                  [class.is-invalid]="otpForm.get('otp')?.invalid && otpForm.get('otp')?.touched"
                  formControlName="otp" autocomplete="one-time-code"
                  placeholder="• • • • • •" maxlength="6" inputmode="numeric">
                <div class="invalid-feedback">Enter the 6-digit code from your email</div>
              </div>
              @if (error()) {
                <div class="alert alert-danger py-2 small mb-3">{{ error() }}</div>
              }
              <button type="submit" class="btn btn-primary w-100 py-2 fw-semibold"
                [disabled]="otpForm.invalid || loading()">
                @if (loading()) { <span class="spinner-border spinner-border-sm me-2"></span> }
                Verify Code
              </button>
              <button type="button" class="btn btn-link w-100 mt-2 small text-muted"
                [disabled]="loading()" (click)="resendOtp()">
                Didn't receive it? Resend code
              </button>
            </form>
          }

          <!-- ── STEP 3: New password ── -->
          @if (step() === 'password') {
            <form [formGroup]="passwordForm" (ngSubmit)="submitPassword()" novalidate>
              <div class="mb-3">
                <label class="form-label fw-semibold small">New Password</label>
                <div class="input-group">
                  <input [type]="showPw() ? 'text' : 'password'"
                    class="form-control form-control-lg"
                    [class.is-invalid]="passwordForm.get('password')?.hasError('minlength') && passwordForm.get('password')?.touched"
                    formControlName="password" autocomplete="new-password" placeholder="Min. 8 characters">
                  <button type="button" class="btn btn-outline-secondary" (click)="showPw.set(!showPw())">
                    <mat-icon style="font-size:20px;line-height:1;vertical-align:middle">
                      {{ showPw() ? 'visibility_off' : 'visibility' }}
                    </mat-icon>
                  </button>
                  <div class="invalid-feedback">Password must be at least 8 characters</div>
                </div>
              </div>
              <div class="mb-3">
                <label class="form-label fw-semibold small">Confirm Password</label>
                <input [type]="showPw() ? 'text' : 'password'"
                  class="form-control form-control-lg"
                  [class.is-invalid]="passwordForm.hasError('mismatch') && passwordForm.get('confirmPassword')?.touched"
                  formControlName="confirmPassword" autocomplete="new-password" placeholder="Repeat password">
                <div class="invalid-feedback">Passwords do not match</div>
              </div>
              @if (error()) {
                <div class="alert alert-danger py-2 small mb-3">{{ error() }}</div>
              }
              <button type="submit" class="btn btn-primary w-100 py-2 fw-semibold"
                [disabled]="passwordForm.invalid || loading()">
                @if (loading()) { <span class="spinner-border spinner-border-sm me-2"></span> }
                Reset Password
              </button>
            </form>
          }

          <!-- ── STEP 4: Done ── -->
          @if (step() === 'done') {
            <div class="text-center py-2">
              <div style="font-size:56px">✅</div>
              <div class="alert alert-success fw-semibold mt-3 mb-4">
                Password updated successfully
              </div>
              <a routerLink="/auth/login" class="btn btn-primary w-100 py-2 fw-semibold">
                Go to Sign In
              </a>
            </div>
          }

          <hr class="my-4">
          <div class="text-center">
            <a routerLink="/auth/login" class="text-muted small text-decoration-none">
              ← Back to Sign In
            </a>
          </div>

        </div>
      </div>
    </div>
  `,
  styles: [`
    .step-dot {
      width: 28px; height: 28px; border-radius: 50%;
      background: #e0e0e0; color: #9e9e9e;
      display: flex; align-items: center; justify-content: center;
      font-size: 12px; font-weight: 700; flex-shrink: 0;
      transition: all 0.2s;
      &.active { background: #2e7d32; color: #fff; }
      &.done   { background: #4caf50; color: #fff; }
    }
    .step-line {
      flex: 1; height: 2px; background: #e0e0e0; border-radius: 2px;
      &.done { background: #4caf50; }
    }
    .otp-input {
      font-size: 28px; font-weight: 700; letter-spacing: 12px;
      font-family: monospace; text-align: center;
    }
  `],
})
export class ForgotPasswordComponent {
  private fb   = inject(FormBuilder);
  private auth = inject(AuthService);

  step      = signal<Step>('email');
  loading   = signal(false);
  error     = signal('');
  sentEmail = signal('');
  showPw    = signal(false);
  private resetToken = '';

  steps = [
    { key: 'email'    as Step, num: '1' },
    { key: 'otp'      as Step, num: '2' },
    { key: 'password' as Step, num: '3' },
  ];

  emailForm = this.fb.group({
    email: ['', [Validators.required, Validators.email]],
  });

  otpForm = this.fb.group({
    otp: ['', [Validators.required, Validators.pattern(/^\d{6}$/)]],
  });

  passwordForm = this.fb.group({
    password:        ['', [Validators.required, Validators.minLength(8)]],
    confirmPassword: ['', Validators.required],
  }, { validators: passwordsMatch });

  isStepDone(key: Step): boolean {
    const order: Step[] = ['email', 'otp', 'password', 'done'];
    return order.indexOf(this.step()) > order.indexOf(key);
  }

  submitEmail() {
    if (this.emailForm.invalid) return;
    this.loading.set(true);
    this.error.set('');
    const email = this.emailForm.value.email!;

    this.auth.forgotPassword(email).subscribe({
      next: () => {
        this.sentEmail.set(email);
        this.step.set('otp');
        this.loading.set(false);
      },
      error: () => {
        // Always advance — don't reveal whether email exists
        this.sentEmail.set(email);
        this.step.set('otp');
        this.loading.set(false);
      },
    });
  }

  resendOtp() {
    this.otpForm.reset();
    this.error.set('');
    this.auth.forgotPassword(this.sentEmail()).subscribe();
  }

  submitOtp() {
    if (this.otpForm.invalid) return;
    this.loading.set(true);
    this.error.set('');

    this.auth.verifyOtp(this.sentEmail(), this.otpForm.value.otp!).subscribe({
      next: res => {
        this.resetToken = res.reset_token;
        this.step.set('password');
        this.loading.set(false);
      },
      error: err => {
        this.error.set(err.error?.detail || 'Invalid or expired code. Please try again.');
        this.loading.set(false);
      },
    });
  }

  submitPassword() {
    if (this.passwordForm.invalid || !this.resetToken) return;
    this.loading.set(true);
    this.error.set('');

    this.auth.resetPassword(this.resetToken, this.passwordForm.value.password!).subscribe({
      next: () => {
        this.step.set('done');
        this.loading.set(false);
      },
      error: err => {
        this.error.set(err.error?.detail || 'Reset failed. Please start over.');
        this.loading.set(false);
      },
    });
  }
}
