import { Component, inject, signal, computed, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterLink } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { MatRippleModule } from '@angular/material/core';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { FavoritesService, ApiRecipe } from '../../core/services/favorites.service';
import { AuthService } from '../../core/services/auth.service';

// ── Helpers ───────────────────────────────────────────────────────────────────

const MEAL_EMOJI: Record<string, string> = {
  breakfast: '🍳', lunch: '🥗', dinner: '🍽️', beverage: '🫖', snack: '🥜',
};

const CARD_BG: Record<string, string> = {
  breakfast: '#fff8e1', lunch: '#e8f5e9', dinner: '#e8eaf6',
  beverage:  '#e0f2f1', snack: '#fce4ec',
};

function recipeEmoji(r: ApiRecipe): string {
  return MEAL_EMOJI[r.meal_type?.toLowerCase() ?? ''] ?? '🥘';
}

function recipeCardBg(r: ApiRecipe): string {
  return CARD_BG[r.meal_type?.toLowerCase() ?? ''] ?? '#f3e5f5';
}

function totalTime(r: ApiRecipe): string {
  const t = (r.prep_time_minutes ?? 0) + (r.cook_time_minutes ?? 0);
  return t > 0 ? `${t} min` : 'Quick';
}

function recipeTags(r: ApiRecipe): string[] {
  return [...r.dietary_labels.slice(0, 2), ...r.health_benefits.slice(0, 1)].slice(0, 3);
}

const FILTER_MEAL_MAP: Record<string, string | null> = {
  All: null, Breakfast: 'breakfast', Lunch: 'lunch',
  Dinner: 'dinner', Snacks: 'snack',
};

// ── Component ─────────────────────────────────────────────────────────────────

@Component({
  selector: 'app-meals',
  standalone: true,
  imports: [CommonModule, RouterLink, MatIconModule, MatRippleModule, MatProgressSpinnerModule],
  template: `
<div class="meals-page">

  <!-- ── Header ───────────────────────────────────────── -->
  <div class="page-header">
    <div>
      <h1 class="page-title">My Favorites</h1>
      <p class="page-sub">{{ filtered().length }} saved recipe{{ filtered().length !== 1 ? 's' : '' }}</p>
    </div>
    <a routerLink="/recommendations" class="add-btn" matRipple>
      <mat-icon>add</mat-icon>
    </a>
  </div>

  <!-- ── Filter tabs ───────────────────────────────────── -->
  <div class="filter-tabs">
    @for (f of filters; track f) {
      <button class="filter-tab" [class.active]="activeFilter() === f"
        (click)="activeFilter.set(f)">{{ f }}</button>
    }
  </div>

  @if (!auth.isLoggedIn()) {
    <div class="empty-state">
      <div class="empty-emoji">🔐</div>
      <h2>Sign in to see your favorites</h2>
      <p>Save recipes you love and access them anytime.</p>
      <a routerLink="/auth/login" class="action-btn">Sign In</a>
    </div>
  } @else if (favSvc.favouriteRecipes().length === 0 && loading()) {
    <div class="loading-center">
      <mat-spinner diameter="40"></mat-spinner>
    </div>
  } @else if (favSvc.favouriteRecipes().length === 0) {
    <div class="empty-state">
      <div class="empty-emoji">🤍</div>
      <h2>No favorites yet</h2>
      <p>Heart any recipe to save it here for quick access.</p>
      <a routerLink="/recommendations" class="action-btn">Explore Recipes</a>
    </div>
  } @else if (filtered().length === 0) {
    <div class="empty-state">
      <div class="empty-emoji">🍽️</div>
      <h2>No {{ activeFilter() }} recipes saved</h2>
      <p>Try a different filter or save more recipes.</p>
    </div>
  } @else {
    <div class="recipe-list">
      @for (r of filtered(); track r.id) {
        <div class="recipe-card" (click)="openDetail(r)" matRipple>

          <!-- Left: emoji thumbnail -->
          <div class="recipe-thumb" [style.background]="recipeCardBg(r)">
            <span class="recipe-emoji">{{ recipeEmoji(r) }}</span>
          </div>

          <!-- Center: info -->
          <div class="recipe-info">
            <div class="recipe-title">{{ r.title }}</div>
            @if (r.description) {
              <div class="recipe-desc">{{ r.description | slice:0:70 }}{{ r.description!.length > 70 ? '…' : '' }}</div>
            }
            <div class="recipe-meta">
              <mat-icon class="meta-icon">schedule</mat-icon>
              {{ totalTime(r) }}
              @if (r.meal_type) {
                <span class="meta-dot">·</span>
                <span class="meal-type-chip">{{ r.meal_type | titlecase }}</span>
              }
            </div>
            <div class="tag-row">
              @for (tag of recipeTags(r); track tag) {
                <span class="tag">{{ tag }}</span>
              }
            </div>
          </div>

          <!-- Right: heart button -->
          <button class="heart-btn hearted"
            (click)="$event.stopPropagation(); favSvc.toggle(r.id, r)"
            title="Remove from favorites">
            <mat-icon>favorite</mat-icon>
          </button>

        </div>
      }
    </div>
  }

  <!-- ── CTA ───────────────────────────────────────────── -->
  @if (auth.isLoggedIn() && favSvc.favouriteRecipes().length > 0) {
    <div class="cta-wrap">
      <a routerLink="/recommendations" class="cta-card" matRipple>
        <mat-icon class="cta-icon">auto_awesome</mat-icon>
        <div>
          <div class="cta-title">Discover More Recipes</div>
          <div class="cta-sub">Tailored to how you feel today</div>
        </div>
        <mat-icon style="margin-left:auto;color:rgba(255,255,255,0.7)">chevron_right</mat-icon>
      </a>
    </div>
  }

  <!-- ── Recipe detail sheet ───────────────────────────── -->
  @if (detailOpen() && detailRecipe()) {
    <div class="detail-backdrop" (click)="closeDetail()">
      <div class="detail-sheet" (click)="$event.stopPropagation()">

        <div class="detail-thumb" [style.background]="recipeCardBg(detailRecipe()!)">
          <span style="font-size:64px">{{ recipeEmoji(detailRecipe()!) }}</span>
          <button class="detail-close" (click)="closeDetail()">
            <mat-icon>close</mat-icon>
          </button>
          <button class="detail-heart hearted" (click)="favSvc.toggle(detailRecipe()!.id, detailRecipe()!)">
            <mat-icon>favorite</mat-icon>
          </button>
        </div>

        <div class="detail-body">
          <h2 class="detail-title">{{ detailRecipe()!.title }}</h2>

          <div class="detail-meta-row">
            @if (totalTime(detailRecipe()!) !== 'Quick') {
              <div class="detail-meta-chip">
                <mat-icon>schedule</mat-icon> {{ totalTime(detailRecipe()!) }}
              </div>
            }
            @if (detailRecipe()!.servings) {
              <div class="detail-meta-chip">
                <mat-icon>people</mat-icon> {{ detailRecipe()!.servings }} servings
              </div>
            }
            @if (detailRecipe()!.meal_type) {
              <div class="detail-meta-chip">
                <mat-icon>restaurant</mat-icon> {{ detailRecipe()!.meal_type | titlecase }}
              </div>
            }
          </div>

          @if (detailRecipe()!.description) {
            <p class="detail-desc">{{ detailRecipe()!.description }}</p>
          }

          @if (detailRecipe()!.dietary_labels.length > 0 || detailRecipe()!.health_benefits.length > 0) {
            <div class="detail-tags">
              @for (t of detailRecipe()!.dietary_labels; track t) {
                <span class="tag tag-diet">{{ t }}</span>
              }
              @for (t of detailRecipe()!.health_benefits.slice(0, 3); track t) {
                <span class="tag tag-benefit">{{ t }}</span>
              }
            </div>
          }

          @if (detailRecipe()!.recipe_ingredients.length > 0) {
            <h3 class="detail-section-title">Ingredients</h3>
            <ul class="ingredient-list">
              @for (ing of detailRecipe()!.recipe_ingredients; track ing.ingredient.name) {
                <li>
                  <span class="ing-qty">{{ ing.quantity ?? '' }} {{ ing.unit ?? '' }}</span>
                  {{ ing.ingredient.name }}
                </li>
              }
            </ul>
          }

          <button class="remove-fav-btn" (click)="favSvc.toggle(detailRecipe()!.id, detailRecipe()!); closeDetail()">
            <mat-icon>heart_broken</mat-icon> Remove from Favorites
          </button>
        </div>

      </div>
    </div>
  }

</div>
  `,
  styles: [`
    .meals-page { padding-bottom: 80px; min-height: 100vh; background: #f9fbf9; }

    /* ── Header ──────────────────────────────────── */
    .page-header {
      display: flex; align-items: center; justify-content: space-between;
      padding: 20px 16px 12px; background: #fff; border-bottom: 1px solid #e8f0e8;
    }
    .page-title { font-size: 22px; font-weight: 800; color: #1a2a1a; margin: 0 0 2px; }
    .page-sub   { font-size: 13px; color: #6b7c6b; margin: 0; }
    .add-btn {
      width: 40px; height: 40px; border-radius: 50%; background: #2e7d32; border: none;
      color: #fff; cursor: pointer; display: flex; align-items: center; justify-content: center;
      text-decoration: none;
      mat-icon { font-size: 22px; }
    }

    /* ── Filters ─────────────────────────────────── */
    .filter-tabs {
      display: flex; gap: 8px; padding: 12px 16px; overflow-x: auto;
      scrollbar-width: none; background: #fff; border-bottom: 1px solid #f0f0f0;
      &::-webkit-scrollbar { display: none; }
    }
    .filter-tab {
      flex-shrink: 0; padding: 6px 18px; border-radius: 20px;
      border: 1.5px solid #e8f0e8; background: transparent;
      font-size: 13px; font-weight: 500; cursor: pointer; color: #6b7c6b;
      transition: all 0.15s;
      &.active { background: #2e7d32; border-color: #2e7d32; color: #fff; font-weight: 600; }
    }

    /* ── Loading / empty ─────────────────────────── */
    .loading-center { text-align: center; padding: 60px 16px; }
    .empty-state { text-align: center; padding: 60px 32px; }
    .empty-emoji { font-size: 64px; margin-bottom: 16px; }
    .empty-state h2 { font-size: 20px; font-weight: 700; color: #1a2a1a; margin: 0 0 8px; }
    .empty-state p  { font-size: 14px; color: #6b7c6b; margin: 0 0 24px; }
    .action-btn {
      display: inline-block; background: #2e7d32; color: #fff; border: none;
      border-radius: 12px; padding: 12px 28px; font-size: 15px; font-weight: 600;
      text-decoration: none; cursor: pointer; transition: background 0.15s;
      &:hover { background: #1b5e20; }
    }

    /* ── Recipe list ─────────────────────────────── */
    .recipe-list { padding: 12px 16px; display: flex; flex-direction: column; gap: 12px; }
    .recipe-card {
      background: #fff; border-radius: 16px; padding: 12px;
      display: flex; align-items: center; gap: 14px;
      box-shadow: 0 2px 8px rgba(0,0,0,0.06); cursor: pointer;
      transition: box-shadow 0.15s;
      &:hover { box-shadow: 0 4px 16px rgba(0,0,0,0.1); }
    }
    .recipe-thumb {
      width: 72px; height: 72px; border-radius: 14px; flex-shrink: 0;
      display: flex; align-items: center; justify-content: center;
    }
    .recipe-emoji { font-size: 34px; }
    .recipe-info  { flex: 1; min-width: 0; }
    .recipe-title { font-size: 14px; font-weight: 700; color: #1a2a1a; margin-bottom: 3px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .recipe-desc  { font-size: 11px; color: #6b7c6b; margin-bottom: 5px; line-height: 1.4; }
    .recipe-meta  { display: flex; align-items: center; gap: 4px; font-size: 11px; color: #9e9e9e; margin-bottom: 6px; }
    .meta-icon    { font-size: 13px; color: #9e9e9e; }
    .meta-dot     { margin: 0 2px; }
    .meal-type-chip { font-size: 11px; color: #2e7d32; font-weight: 600; }
    .tag-row { display: flex; flex-wrap: wrap; gap: 4px; }
    .tag {
      font-size: 10px; font-weight: 600; padding: 2px 8px; border-radius: 8px;
      background: #e8f5e9; color: #2e7d32;
    }

    /* ── Heart button ────────────────────────────── */
    .heart-btn {
      width: 38px; height: 38px; border-radius: 50%; border: none;
      background: #fff0f0; cursor: pointer; flex-shrink: 0;
      display: flex; align-items: center; justify-content: center;
      transition: transform 0.15s, background 0.15s;
      mat-icon { font-size: 20px; color: #e53935; }
      &:hover { background: #ffebee; transform: scale(1.1); }
    }

    /* ── CTA ─────────────────────────────────────── */
    .cta-wrap { padding: 8px 16px 16px; }
    .cta-card {
      background: linear-gradient(135deg, #2e7d32, #4caf50); border-radius: 14px;
      padding: 16px; display: flex; align-items: center; gap: 12px;
      cursor: pointer; color: #fff; text-decoration: none;
    }
    .cta-icon  { font-size: 28px; color: rgba(255,255,255,0.9); flex-shrink: 0; }
    .cta-title { font-size: 15px; font-weight: 700; }
    .cta-sub   { font-size: 12px; opacity: 0.85; }

    /* ── Detail sheet ────────────────────────────── */
    .detail-backdrop {
      position: fixed; inset: 0; background: rgba(0,0,0,0.45); z-index: 400;
      display: flex; align-items: flex-end;
    }
    .detail-sheet {
      width: 100%; max-height: 88vh; background: #fff;
      border-radius: 24px 24px 0 0; overflow-y: auto;
      animation: slideUp 0.28s ease-out;
    }
    .detail-thumb {
      height: 160px; display: flex; align-items: center; justify-content: center;
      position: relative; border-radius: 24px 24px 0 0;
    }
    .detail-close {
      position: absolute; top: 12px; left: 12px;
      width: 32px; height: 32px; border-radius: 50%;
      background: rgba(255,255,255,0.85); border: none; cursor: pointer;
      display: flex; align-items: center; justify-content: center;
      mat-icon { font-size: 18px; color: #555; }
    }
    .detail-heart {
      position: absolute; top: 12px; right: 12px;
      width: 36px; height: 36px; border-radius: 50%;
      background: rgba(255,255,255,0.85); border: none; cursor: pointer;
      display: flex; align-items: center; justify-content: center;
      &.hearted mat-icon { color: #e53935; }
      mat-icon { font-size: 20px; }
    }
    .detail-body { padding: 20px 20px 32px; }
    .detail-title { font-size: 20px; font-weight: 800; color: #1a2a1a; margin: 0 0 12px; }
    .detail-meta-row { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 14px; }
    .detail-meta-chip {
      display: flex; align-items: center; gap: 4px;
      background: #f2f5f0; border-radius: 10px; padding: 5px 10px;
      font-size: 12px; font-weight: 600; color: #3a4a3a;
      mat-icon { font-size: 14px; color: #2e7d32; }
    }
    .detail-desc { font-size: 14px; color: #555; line-height: 1.6; margin-bottom: 14px; }
    .detail-tags { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 16px; }
    .tag-diet    { background: #e3f2fd; color: #1565c0; }
    .tag-benefit { background: #e8f5e9; color: #2e7d32; }
    .detail-section-title { font-size: 15px; font-weight: 700; color: #1a2a1a; margin: 16px 0 8px; }
    .ingredient-list {
      list-style: none; padding: 0; margin: 0 0 20px;
      display: flex; flex-direction: column; gap: 6px;
      li { font-size: 13px; color: #444; display: flex; gap: 6px; }
    }
    .ing-qty { font-weight: 600; color: #2e7d32; min-width: 48px; }
    .remove-fav-btn {
      width: 100%; display: flex; align-items: center; justify-content: center; gap: 8px;
      border: 1.5px solid #ef9a9a; background: #fff; color: #c62828;
      border-radius: 12px; padding: 12px; font-size: 14px; font-weight: 600;
      cursor: pointer; transition: background 0.15s;
      mat-icon { font-size: 18px; }
      &:hover { background: #ffebee; }
    }

    /* ── Desktop ─────────────────────────────────── */
    @media (min-width: 768px) {
      .meals-page { padding-bottom: 32px; }
      .recipe-list { max-width: 720px; margin: 0 auto; padding: 16px 24px; }
      .detail-backdrop { align-items: center; }
      .detail-sheet {
        max-width: 520px; margin: 0 auto; border-radius: 24px; max-height: 82vh;
      }
    }

    @keyframes slideUp {
      from { transform: translateY(40px); opacity: 0; }
      to   { transform: translateY(0);    opacity: 1; }
    }
  `],
})
export class MealsComponent implements OnInit {
  router  = inject(Router);
  auth    = inject(AuthService);
  favSvc  = inject(FavoritesService);

  filters     = ['All', 'Breakfast', 'Lunch', 'Dinner', 'Snacks'];
  activeFilter = signal('All');
  loading     = signal(true);

  detailOpen   = signal(false);
  detailRecipe = signal<ApiRecipe | null>(null);

  filtered = computed(() => {
    const mealType = FILTER_MEAL_MAP[this.activeFilter()];
    const all = this.favSvc.favouriteRecipes();
    if (!mealType) return all;
    return all.filter(r => r.meal_type?.toLowerCase() === mealType);
  });

  readonly recipeEmoji   = recipeEmoji;
  readonly recipeCardBg  = recipeCardBg;
  readonly totalTime     = totalTime;
  readonly recipeTags    = recipeTags;

  ngOnInit() {
    if (this.auth.isLoggedIn()) {
      this.favSvc.load();
      this.loading.set(false);
    } else {
      this.loading.set(false);
    }
  }

  openDetail(r: ApiRecipe) {
    this.detailRecipe.set(r);
    this.detailOpen.set(true);
  }

  closeDetail() {
    this.detailOpen.set(false);
    this.detailRecipe.set(null);
  }
}
