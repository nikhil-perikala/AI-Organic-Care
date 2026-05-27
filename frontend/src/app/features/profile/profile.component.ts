
import { Component, inject, signal, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatChipsModule, MatChipInputEvent } from '@angular/material/chips';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatSelectModule } from '@angular/material/select';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatDividerModule } from '@angular/material/divider';
import { MatTooltipModule } from '@angular/material/tooltip';
import { COMMA, ENTER } from '@angular/cdk/keycodes';
import { HttpClient } from '@angular/common/http';
import { AuthService } from '../../core/services/auth.service';
import { environment } from '../../../environments/environment';

@Component({
  selector: 'app-profile',
  standalone: true,
  imports: [
    CommonModule, ReactiveFormsModule,
    MatCardModule, MatButtonModule, MatIconModule, MatInputModule,
    MatFormFieldModule, MatChipsModule, MatSnackBarModule, MatSelectModule,
    MatProgressBarModule, MatProgressSpinnerModule, MatDividerModule, MatTooltipModule,
  ],
  template: `
    <div class="page-container profile-page">
      <div class="page-header">
        <div class="header-left">
          <h1><mat-icon>spa</mat-icon> Wellness Profile</h1>
          <p class="subtitle">Your preferences shape every recommendation we make.</p>
        </div>
        <div class="completeness-badge" [class.complete]="completeness() === 100">
          <span class="pct">{{ completeness() }}%</span>
          <span class="label">complete</span>
        </div>
      </div>

      <div class="profile-completeness">
        <mat-progress-bar mode="determinate" [value]="completeness()" color="primary"></mat-progress-bar>
        @if (completeness() < 100) {
          <p class="complete-hint">Complete your profile to get more personalized meal recommendations.</p>
        } @else {
          <p class="complete-hint complete-done">
            <mat-icon style="font-size:16px;vertical-align:middle">check_circle</mat-icon>
            Profile complete — your recommendations are fully personalized.
          </p>
        }
      </div>

      @if (loading()) {
        <div class="loading-state">
          <mat-spinner diameter="48"></mat-spinner>
          <p>Loading your profile...</p>
        </div>
      } @else {
        <form [formGroup]="form" (ngSubmit)="save()">
          <div class="profile-grid">

            <!-- Dietary & Allergies -->
            <mat-card class="profile-card card-elevation">
              <mat-card-header>
                <mat-icon mat-card-avatar class="section-icon">restaurant_menu</mat-icon>
                <mat-card-title>Diet & Allergies</mat-card-title>
                <mat-card-subtitle>Filters applied to every recommendation</mat-card-subtitle>
              </mat-card-header>
              <mat-card-content>

                <mat-form-field appearance="outline" class="full-width">
                  <mat-label>Dietary preferences</mat-label>
                  <mat-select formControlName="dietary_preferences" multiple>
                    @for (p of dietaryOptions; track p) {
                      <mat-option [value]="p">{{ p }}</mat-option>
                    }
                  </mat-select>
                  <mat-hint>Recipes matching your diet get ranked higher</mat-hint>
                </mat-form-field>

                <mat-form-field appearance="outline" class="full-width">
                  <mat-label>Allergies & intolerances</mat-label>
                  <mat-select formControlName="allergies" multiple>
                    @for (a of allergyOptions; track a) {
                      <mat-option [value]="a">{{ a }}</mat-option>
                    }
                  </mat-select>
                  <mat-hint>Recipes conflicting with your allergies are deprioritized</mat-hint>
                </mat-form-field>

                <!-- Disliked ingredients chip input -->
                <mat-form-field appearance="outline" class="full-width">
                  <mat-label>Disliked ingredients</mat-label>
                  <mat-chip-grid #chipGrid>
                    @for (ing of dislikedIngredients(); track ing) {
                      <mat-chip [removable]="true" (removed)="removeDisliked(ing)">
                        {{ ing }}
                        <mat-icon matChipRemove>cancel</mat-icon>
                      </mat-chip>
                    }
                    <input placeholder="Type & press Enter..."
                      [matChipInputFor]="chipGrid"
                      [matChipInputSeparatorKeyCodes]="separatorKeys"
                      (matChipInputTokenEnd)="addDisliked($event)">
                  </mat-chip-grid>
                  <mat-hint>The AI will avoid these when explaining meals</mat-hint>
                </mat-form-field>

              </mat-card-content>
            </mat-card>

            <!-- Health Goals & Cuisines -->
            <mat-card class="profile-card card-elevation">
              <mat-card-header>
                <mat-icon mat-card-avatar class="section-icon goals-icon">track_changes</mat-icon>
                <mat-card-title>Health Goals & Tastes</mat-card-title>
                <mat-card-subtitle>Shapes the explanation and recipe scoring</mat-card-subtitle>
              </mat-card-header>
              <mat-card-content>

                <div class="goals-chips">
                  @for (goal of goalOptions; track goal) {
                    <button type="button" class="goal-chip"
                      [class.selected]="isGoalSelected(goal)"
                      (click)="toggleGoal(goal)">
                      <mat-icon>{{ goalIcon(goal) }}</mat-icon>
                      {{ goal }}
                    </button>
                  }
                </div>

                <mat-divider class="my-divider"></mat-divider>

                <mat-form-field appearance="outline" class="full-width">
                  <mat-label>Preferred cuisines</mat-label>
                  <mat-select formControlName="liked_cuisines" multiple>
                    @for (c of cuisineOptions; track c) {
                      <mat-option [value]="c">{{ c }}</mat-option>
                    }
                  </mat-select>
                </mat-form-field>

                <mat-form-field appearance="outline" class="serving-field">
                  <mat-label>Default serving size</mat-label>
                  <input matInput type="number" formControlName="serving_size" min="1" max="20">
                  <span matSuffix>people</span>
                </mat-form-field>

              </mat-card-content>
            </mat-card>

          </div>

          <div class="save-row">
            @if (saved()) {
              <span class="save-success">
                <mat-icon>check_circle</mat-icon> Profile saved — recommendations updated!
              </span>
            }
            <button mat-raised-button color="primary" type="submit" [disabled]="saving() || form.invalid">
              @if (saving()) {
                <mat-spinner diameter="18" style="display:inline-block;margin-right:6px"></mat-spinner>
                Saving...
              } @else {
                <mat-icon>save</mat-icon> Save Profile
              }
            </button>
          </div>
        </form>

        <!-- Account Info -->
        <mat-card class="account-card card-elevation">
          <mat-card-header>
            <div class="avatar-circle" mat-card-avatar>
              {{ initials() }}
            </div>
            <mat-card-title>{{ auth.currentUser()?.full_name || 'Your Account' }}</mat-card-title>
            <mat-card-subtitle>{{ auth.currentUser()?.email }}</mat-card-subtitle>
          </mat-card-header>
          <mat-card-content>
            <div class="account-row">
              <mat-icon>calendar_today</mat-icon>
              <span>Member since {{ auth.currentUser()?.created_at | date:'longDate' }}</span>
            </div>
          </mat-card-content>
        </mat-card>
      }
    </div>
  `,
  styles: [`
    .profile-page { padding: 32px 24px; max-width: 900px; }
    .page-header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 16px;
      h1 { display: flex; align-items: center; gap: 8px; color: #2e7d32; margin: 0 0 6px; }
    }
    .subtitle { color: #666; margin: 0; }
    .completeness-badge {
      text-align: center; background: #f1f8e9; border: 2px solid #a5d6a7;
      border-radius: 50%; width: 68px; height: 68px; display: flex; flex-direction: column;
      justify-content: center; flex-shrink: 0;
      .pct { font-size: 20px; font-weight: 700; color: #2e7d32; line-height: 1; }
      .label { font-size: 10px; color: #777; text-transform: uppercase; }
      &.complete { background: #e8f5e9; border-color: #4caf50; }
    }
    .profile-completeness { margin-bottom: 28px;
      mat-progress-bar { height: 6px; border-radius: 3px; margin-bottom: 6px; }
      .complete-hint { font-size: 13px; color: #888; margin: 0; }
      .complete-done { color: #2e7d32; display: flex; align-items: center; gap: 4px; }
    }
    .loading-state { display: flex; flex-direction: column; align-items: center; gap: 16px; padding: 64px; color: #888; }
    .profile-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 24px; margin-bottom: 20px; }
    .profile-card { height: 100%; }
    .full-width { width: 100%; margin-bottom: 16px; }
    .section-icon { color: #4caf50; background: #e8f5e9; border-radius: 50%; padding: 6px; font-size: 20px; width: 36px; height: 36px; display: flex; align-items: center; justify-content: center; }
    .goals-icon { color: #1565c0; background: #e3f2fd; }
    .goals-chips { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 16px; }
    .goal-chip {
      display: inline-flex; align-items: center; gap: 4px;
      padding: 6px 12px; border-radius: 20px; border: 1.5px solid #c8e6c9;
      background: white; cursor: pointer; font-size: 13px; color: #555;
      transition: all 0.15s;
      mat-icon { font-size: 15px; width: 15px; height: 15px; }
      &:hover { border-color: #4caf50; color: #2e7d32; }
      &.selected { background: #e8f5e9; border-color: #4caf50; color: #2e7d32; font-weight: 600; }
    }
    .my-divider { margin: 12px 0 16px; }
    .serving-field { width: 160px; }
    .save-row { display: flex; align-items: center; gap: 16px; justify-content: flex-end; margin-bottom: 24px; }
    .save-success { color: #2e7d32; font-size: 14px; display: flex; align-items: center; gap: 4px; }
    .account-card { }
    .avatar-circle {
      width: 40px; height: 40px; border-radius: 50%; background: #4caf50; color: white;
      display: flex; align-items: center; justify-content: center; font-weight: 700; font-size: 16px;
    }
    .account-row { display: flex; align-items: center; gap: 8px; color: #666; font-size: 14px; margin-top: 8px;
      mat-icon { font-size: 18px; color: #aaa; }
    }
    /* Mobile: single column, tighter padding */
    @media (max-width: 767px) {
      .profile-page { padding: 16px; }
      .page-header { flex-direction: column; gap: 12px; align-items: flex-start; }
      .profile-grid { grid-template-columns: 1fr; gap: 16px; margin-bottom: 16px; }
      .macros-grid { grid-template-columns: repeat(2, 1fr); }
    }

    /* Desktop */
    @media (min-width: 768px) {
      .profile-page { padding: 32px 40px; max-width: 1000px; }
      .profile-grid { gap: 28px; }
      .goals-chips { gap: 10px; }
      .save-row { margin-bottom: 28px; }
    }
  `],
})
export class ProfileComponent implements OnInit {
  private fb = inject(FormBuilder);
  private http = inject(HttpClient);
  private snackBar = inject(MatSnackBar);
  auth = inject(AuthService);

  loading = signal(true);
  saving = signal(false);
  saved = signal(false);
  dislikedIngredients = signal<string[]>([]);
  separatorKeys = [ENTER, COMMA] as const;

  form = this.fb.group({
    dietary_preferences: [[] as string[]],
    allergies: [[] as string[]],
    health_goals: [[] as string[]],
    liked_cuisines: [[] as string[]],
    serving_size: [2, [Validators.min(1), Validators.max(20)]],
  });

  dietaryOptions = ['Vegan', 'Vegetarian', 'Pescatarian', 'Paleo', 'Keto', 'Gluten-Free', 'Dairy-Free', 'Halal', 'Kosher'];
  allergyOptions = ['Gluten', 'Dairy', 'Nuts', 'Peanuts', 'Shellfish', 'Fish', 'Eggs', 'Soy', 'Sesame'];
  goalOptions = ['Better sleep', 'Stress reduction', 'More energy', 'Gut health', 'Immune support', 'Anti-inflammatory', 'Weight loss', 'Muscle gain', 'Heart health'];
  cuisineOptions = ['Mediterranean', 'Asian', 'Indian', 'Mexican', 'Middle Eastern', 'Western', 'Ayurvedic'];

  completeness = signal(0);

  ngOnInit() {
    this.http.get<any>(`${environment.apiUrl}/users/me/profile`).subscribe({
      next: profile => {
        if (profile && Object.keys(profile).length) {
          this.form.patchValue({
            dietary_preferences: profile.dietary_preferences || [],
            allergies: profile.allergies || [],
            health_goals: profile.health_goals || [],
            liked_cuisines: profile.liked_cuisines || [],
            serving_size: profile.serving_size ?? 2,
          });
          this.dislikedIngredients.set(profile.disliked_ingredients || []);
        }
        this.loading.set(false);
        this.updateCompleteness();
      },
      error: () => this.loading.set(false),
    });

    this.form.valueChanges.subscribe(() => this.updateCompleteness());
  }

  updateCompleteness() {
    const v = this.form.value;
    let filled = 0;
    if ((v.dietary_preferences?.length ?? 0) > 0) filled++;
    if ((v.allergies?.length ?? 0) > 0) filled++;
    if ((v.health_goals?.length ?? 0) > 0) filled++;
    if ((v.liked_cuisines?.length ?? 0) > 0) filled++;
    if (this.dislikedIngredients().length > 0) filled++;
    this.completeness.set(Math.round((filled / 5) * 100));
  }

  isGoalSelected(goal: string): boolean {
    return (this.form.value.health_goals || []).includes(goal);
  }

  toggleGoal(goal: string) {
    const current = [...(this.form.value.health_goals || [])];
    const idx = current.indexOf(goal);
    if (idx >= 0) current.splice(idx, 1);
    else current.push(goal);
    this.form.patchValue({ health_goals: current });
  }

  goalIcon(goal: string): string {
    const map: Record<string, string> = {
      'Better sleep': 'bedtime', 'Stress reduction': 'self_improvement',
      'More energy': 'bolt', 'Gut health': 'favorite',
      'Immune support': 'shield', 'Anti-inflammatory': 'healing',
      'Weight loss': 'monitor_weight', 'Muscle gain': 'fitness_center', 'Heart health': 'favorite_border',
    };
    return map[goal] ?? 'star';
  }

  addDisliked(event: MatChipInputEvent) {
    const value = (event.value || '').trim();
    if (value) this.dislikedIngredients.update(list => [...list, value]);
    event.chipInput?.clear();
    this.updateCompleteness();
  }

  removeDisliked(ing: string) {
    this.dislikedIngredients.update(list => list.filter(i => i !== ing));
    this.updateCompleteness();
  }

  initials(): string {
    const name = this.auth.currentUser()?.full_name || this.auth.currentUser()?.email || '?';
    return name.split(' ').map((w: string) => w[0]).join('').toUpperCase().slice(0, 2);
  }

  save() {
    this.saving.set(true);
    this.saved.set(false);
    const payload = {
      ...this.form.value,
      disliked_ingredients: this.dislikedIngredients(),
    };
    this.http.put(`${environment.apiUrl}/users/me/profile`, payload).subscribe({
      next: () => {
        this.saved.set(true);
        this.saving.set(false);
        setTimeout(() => this.saved.set(false), 4000);
      },
      error: () => {
        this.snackBar.open('Failed to save profile', '', { duration: 3000 });
        this.saving.set(false);
      },
    });
  }
}
