import { Component, signal, inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { catchError, of } from 'rxjs';
import { environment } from '../../../environments/environment';

interface InsightsData {
  total_sessions: number;
  total_likes: number;
  total_saves: number;
  total_dislikes: number;
  health_score: number | null;
  active_days: number;
  top_ailments: { ailment: string; count: number }[];
  session_trend: { date: string; count: number }[];
  recent_queries: { session_id: string; query: string; ailments: string[]; created_at: string }[];
  saved_recipes: { recipe_id: string; title: string; saved_at: string }[];
}

@Component({
  selector: 'app-insights',
  standalone: true,
  imports: [CommonModule, RouterLink, MatIconModule, MatButtonModule, MatProgressSpinnerModule],
  template: `
<div class="insights-page">

  <!-- Header -->
  <div class="page-header">
    <h1 class="page-title">Health Insights</h1>
    <p class="page-sub">Your real wellness data</p>
  </div>

  @if (loading()) {
    <div class="loading-center">
      <mat-spinner diameter="48"></mat-spinner>
      <p>Loading your insights...</p>
    </div>
  } @else if (!data()) {
    <div class="empty-state">
      <mat-icon>bar_chart</mat-icon>
      <h3>No data yet</h3>
      <p>Get a few recommendations to see your health insights.</p>
      <a mat-raised-button color="primary" routerLink="/recommendations">Get Recommendations</a>
    </div>
  } @else {

    <!-- Health score hero -->
    <div class="score-hero-wrap">
      <div class="score-hero">
        <div class="score-ring-outer">
          <div class="score-ring-inner">
            @if (data()!.health_score !== null) {
              <div class="score-number">{{ data()!.health_score }}</div>
              <div class="score-max">/100</div>
            } @else {
              <div class="score-number" style="font-size:18px">—</div>
            }
          </div>
        </div>
        <div class="score-info">
          <div class="score-label">Wellness Score</div>
          <div class="score-status">{{ scoreStatus() }}</div>
          <div class="score-days">{{ data()!.active_days }} active days tracked 🌿</div>
        </div>
      </div>
    </div>

    <!-- Stat cards -->
    <div class="section-pad">
      <div class="stat-grid">
        <div class="stat-card" style="background:#e8f5e9">
          <mat-icon style="color:#2e7d32">tips_and_updates</mat-icon>
          <div class="stat-val" style="color:#2e7d32">{{ data()!.total_sessions }}</div>
          <div class="stat-label">Consultations</div>
        </div>
        <div class="stat-card" style="background:#fff3e0">
          <mat-icon style="color:#f57c00">thumb_up</mat-icon>
          <div class="stat-val" style="color:#f57c00">{{ data()!.total_likes }}</div>
          <div class="stat-label">Liked Recipes</div>
        </div>
        <div class="stat-card" style="background:#e3f2fd">
          <mat-icon style="color:#1565c0">bookmark</mat-icon>
          <div class="stat-val" style="color:#1565c0">{{ data()!.total_saves }}</div>
          <div class="stat-label">Saved Recipes</div>
        </div>
        <div class="stat-card" style="background:#f3e5f5">
          <mat-icon style="color:#6a1b9a">calendar_today</mat-icon>
          <div class="stat-val" style="color:#6a1b9a">{{ data()!.active_days }}</div>
          <div class="stat-label">Active Days</div>
        </div>
      </div>
    </div>

    <!-- 14-day activity trend -->
    <div class="section-pad">
      <div class="section-header">
        <h2 class="section-title">14-Day Activity</h2>
        <span class="avg-badge">{{ data()!.total_sessions }} total sessions</span>
      </div>
      <div class="trend-chart">
        @for (day of data()!.session_trend; track day.date) {
          <div class="trend-col" [title]="day.date + ': ' + day.count + ' session(s)'">
            <div class="trend-bar-wrap">
              <div class="trend-bar"
                [style.height.%]="trendBarHeight(day.count)"
                [class.trend-bar-active]="day.count > 0">
              </div>
            </div>
            <div class="trend-label">{{ day.date | date:'d' }}</div>
          </div>
        }
      </div>
    </div>

    <!-- Top ailments -->
    @if (data()!.top_ailments.length > 0) {
      <div class="section-pad">
        <h2 class="section-title">Your Top Concerns</h2>
        <div class="ailment-list">
          @for (a of data()!.top_ailments; track a.ailment) {
            <div class="ailment-row">
              <div class="ailment-name">{{ a.ailment }}</div>
              <div class="ailment-bar-bg">
                <div class="ailment-bar-fill"
                  [style.width.%]="ailmentBarWidth(a.count)">
                </div>
              </div>
              <div class="ailment-count">{{ a.count }}×</div>
            </div>
          }
        </div>
      </div>
    }

    <!-- Recent queries -->
    @if (data()!.recent_queries.length > 0) {
      <div class="section-pad">
        <h2 class="section-title">Recent Consultations</h2>
        <div class="query-list">
          @for (q of data()!.recent_queries; track q.session_id) {
            <div class="query-row">
              <mat-icon class="query-icon">chat_bubble_outline</mat-icon>
              <div class="query-content">
                <div class="query-text">"{{ q.query }}"</div>
                <div class="query-meta">
                  <span class="query-date">{{ q.created_at | date:'MMM d, h:mm a' }}</span>
                  @for (ailment of q.ailments.slice(0, 3); track ailment) {
                    <span class="ailment-chip">{{ ailment }}</span>
                  }
                </div>
              </div>
            </div>
          }
        </div>
      </div>
    }

    <!-- Saved recipes -->
    @if (data()!.saved_recipes.length > 0) {
      <div class="section-pad">
        <h2 class="section-title">Saved Recipes</h2>
        <div class="saved-list">
          @for (r of data()!.saved_recipes; track r.recipe_id) {
            <div class="saved-row">
              <mat-icon class="saved-icon">eco</mat-icon>
              <div class="saved-content">
                <div class="saved-title">{{ r.title }}</div>
                <div class="saved-date">Saved {{ r.saved_at | date:'MMM d' }}</div>
              </div>
              <mat-icon class="saved-arrow">chevron_right</mat-icon>
            </div>
          }
        </div>
      </div>
    }

    <!-- CTA -->
    <div class="section-pad">
      <div class="tips-cta" routerLink="/recommendations">
        <mat-icon>tips_and_updates</mat-icon>
        <div>
          <div class="tips-title">Get Personalized Recommendations</div>
          <div class="tips-sub">Tell us how you feel — we'll find the right meals</div>
        </div>
        <mat-icon class="tips-arrow">chevron_right</mat-icon>
      </div>
    </div>

  }
</div>
  `,
  styles: [`
    .insights-page { padding: 0 0 80px; }

    .page-header { padding: 20px 16px 12px; background: #fff; border-bottom: 1px solid #e8f0e8; }
    .page-title { font-size: 22px; font-weight: 800; color: #1a2a1a; margin: 0 0 2px; }
    .page-sub { font-size: 13px; color: #6b7c6b; margin: 0; }

    .loading-center { display: flex; flex-direction: column; align-items: center; gap: 16px; padding: 64px; color: #888; }

    .empty-state {
      text-align: center; padding: 64px 24px; color: #999;
      mat-icon { font-size: 56px; width: 56px; height: 56px; display: block; margin: 0 auto 16px; }
      h3 { color: #444; margin: 0 0 8px; }
      p { margin: 0 0 24px; }
    }

    /* Score hero */
    .score-hero-wrap { padding: 16px; }
    .score-hero {
      background: linear-gradient(135deg, #2e7d32 0%, #4caf50 100%);
      border-radius: 20px; padding: 24px;
      display: flex; align-items: center; gap: 20px; color: #fff;
    }
    .score-ring-outer {
      width: 90px; height: 90px; border-radius: 50%;
      background: rgba(255,255,255,.2);
      display: flex; align-items: center; justify-content: center; flex-shrink: 0;
    }
    .score-ring-inner {
      width: 72px; height: 72px; border-radius: 50%;
      background: rgba(255,255,255,.15);
      display: flex; flex-direction: column; align-items: center; justify-content: center;
    }
    .score-number { font-size: 28px; font-weight: 800; line-height: 1; }
    .score-max { font-size: 12px; opacity: .8; }
    .score-label { font-size: 13px; opacity: .85; margin-bottom: 4px; }
    .score-status { font-size: 18px; font-weight: 700; margin-bottom: 6px; }
    .score-days { font-size: 12px; opacity: .85; }

    /* Section */
    .section-pad { padding: 0 16px 20px; }
    .section-title { font-size: 16px; font-weight: 700; color: #1a2a1a; margin: 0 0 12px; }
    .section-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 12px; }
    .avg-badge { background: #e8f5e9; color: #2e7d32; font-size: 12px; font-weight: 600; padding: 4px 10px; border-radius: 12px; }

    /* Stat cards */
    .stat-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 10px; }
    .stat-card {
      border-radius: 14px; padding: 14px 12px;
      display: flex; flex-direction: column; gap: 4px;
      mat-icon { font-size: 22px; width: 22px; height: 22px; }
    }
    .stat-val { font-size: 24px; font-weight: 800; line-height: 1; }
    .stat-label { font-size: 11px; color: #6b7c6b; }

    /* 14-day trend chart */
    .trend-chart {
      background: #fff; border-radius: 16px; padding: 14px 12px 8px;
      box-shadow: 0 2px 8px rgba(0,0,0,.06);
      display: flex; align-items: flex-end; gap: 4px; height: 120px;
    }
    .trend-col { flex: 1; display: flex; flex-direction: column; align-items: center; height: 100%; }
    .trend-bar-wrap { flex: 1; width: 100%; display: flex; align-items: flex-end; justify-content: center; }
    .trend-bar {
      width: 10px; border-radius: 3px 3px 0 0; min-height: 3px;
      background: #e0e0e0; transition: height .4s ease;
    }
    .trend-bar-active { background: #4caf50; }
    .trend-label { font-size: 9px; color: #9e9e9e; margin-top: 4px; }

    /* Ailment bars */
    .ailment-list { background: #fff; border-radius: 16px; padding: 14px 16px; box-shadow: 0 2px 8px rgba(0,0,0,.06); display: flex; flex-direction: column; gap: 12px; }
    .ailment-row { display: flex; align-items: center; gap: 10px; }
    .ailment-name { font-size: 12px; font-weight: 600; color: #333; width: 110px; flex-shrink: 0; text-transform: capitalize; }
    .ailment-bar-bg { flex: 1; height: 8px; background: #f0f4f0; border-radius: 4px; overflow: hidden; }
    .ailment-bar-fill { height: 100%; background: linear-gradient(90deg, #4caf50, #81c784); border-radius: 4px; transition: width .5s ease; }
    .ailment-count { font-size: 11px; color: #888; width: 24px; text-align: right; flex-shrink: 0; }

    /* Query list */
    .query-list { background: #fff; border-radius: 16px; padding: 4px 0; box-shadow: 0 2px 8px rgba(0,0,0,.06); }
    .query-row { display: flex; align-items: flex-start; gap: 10px; padding: 12px 14px; border-bottom: 1px solid #f5f5f5; &:last-child { border-bottom: none; } }
    .query-icon { color: #a5d6a7; font-size: 20px; margin-top: 2px; flex-shrink: 0; }
    .query-content { flex: 1; }
    .query-text { font-size: 13px; color: #333; margin-bottom: 4px; font-style: italic; }
    .query-meta { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; }
    .query-date { font-size: 11px; color: #9e9e9e; }
    .ailment-chip { background: #e8f5e9; color: #2e7d32; font-size: 10px; padding: 2px 7px; border-radius: 10px; }

    /* Saved list */
    .saved-list { background: #fff; border-radius: 16px; box-shadow: 0 2px 8px rgba(0,0,0,.06); }
    .saved-row { display: flex; align-items: center; gap: 10px; padding: 12px 14px; border-bottom: 1px solid #f5f5f5; cursor: pointer; &:last-child { border-bottom: none; } &:hover { background: #f9fbe7; } }
    .saved-icon { color: #4caf50; font-size: 20px; flex-shrink: 0; }
    .saved-content { flex: 1; }
    .saved-title { font-size: 13px; font-weight: 600; color: #1a2a1a; }
    .saved-date { font-size: 11px; color: #9e9e9e; margin-top: 2px; }
    .saved-arrow { color: #c8e6c9; font-size: 20px; }

    /* Tips CTA */
    .tips-cta {
      background: linear-gradient(135deg, #1b5e20, #2e7d32);
      border-radius: 14px; padding: 16px;
      display: flex; align-items: center; gap: 12px;
      cursor: pointer; color: #fff;
      mat-icon { font-size: 26px; flex-shrink: 0; }
    }
    .tips-title { font-size: 15px; font-weight: 700; }
    .tips-sub { font-size: 12px; opacity: .85; }
    .tips-arrow { margin-left: auto; opacity: .7; }

    /* ══════════ DESKTOP (≥768px) ══════════ */
    @media (min-width: 768px) {
      .insights-page { max-width: 1000px; margin: 0 auto; padding-bottom: 40px; }
      .page-header { padding: 28px 32px 16px; }
      .page-title { font-size: 28px; }
      .section-pad { padding: 0 32px 28px; }
      .score-hero-wrap { padding: 24px 32px 0; }
      .score-hero { padding: 32px 36px; }
      .score-ring-outer { width: 110px; height: 110px; }
      .score-ring-inner { width: 88px; height: 88px; }
      .score-number { font-size: 34px; }
      .score-status { font-size: 22px; }
      .stat-grid { grid-template-columns: repeat(4, 1fr); gap: 16px; }
      .stat-val { font-size: 28px; }
      .trend-chart { height: 160px; }
      .ailment-name { width: 140px; font-size: 13px; }
      .query-text { font-size: 14px; }
    }
  `],
})
export class InsightsComponent implements OnInit {
  private http = inject(HttpClient);

  loading = signal(true);
  data = signal<InsightsData | null>(null);

  ngOnInit() {
    this.http.get<InsightsData>(`${environment.apiUrl}/insights`)
      .pipe(catchError(() => of(null)))
      .subscribe(d => {
        this.data.set(d);
        this.loading.set(false);
      });
  }

  scoreStatus(): string {
    const s = this.data()?.health_score;
    if (s === null || s === undefined) return 'Rate recipes to score';
    if (s >= 90) return 'Excellent! 🌟';
    if (s >= 75) return 'Great Progress 💚';
    if (s >= 50) return 'Good Start';
    return 'Keep Exploring';
  }

  trendBarHeight(count: number): number {
    const max = Math.max(...(this.data()?.session_trend.map(d => d.count) ?? [1]), 1);
    return Math.max((count / max) * 100, count > 0 ? 6 : 0);
  }

  ailmentBarWidth(count: number): number {
    const max = Math.max(...(this.data()?.top_ailments.map(a => a.count) ?? [1]), 1);
    return Math.max((count / max) * 100, 4);
  }
}
