import { Component, signal, computed, inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { RouterLink } from '@angular/router';
import { catchError, of } from 'rxjs';
import { environment } from '../../../environments/environment';
import { AuthService } from '../../core/services/auth.service';
import { ApiRecipe } from '../../core/services/favorites.service';

// ── Types ─────────────────────────────────────────────────────────────────────

interface PantryItem {
  id: string;
  ingredient_name: string;
  quantity: string | null;
  unit: string | null;
}

interface PantryMatch {
  recipe: ApiRecipe;
  matchPct: number;
  missingNames: string[];
}

interface GeneratedRecipe {
  id: string | null;
  is_ai_generated: boolean;
  title: string;
  description: string | null;
  prep_time_minutes: number | null;
  cook_time_minutes: number | null;
  servings: number;
  meal_type: string | null;
  cuisine_type: string | null;
  ingredients: { name: string; quantity: string | null; unit: string | null }[];
  instructions: string[];
  nutritional_info: Record<string, number> | null;
  cooking_tips: string[];
  dietary_labels: string[];
  health_benefits: string[];
  ailment_tags: string[];
  image_url: string | null;
}

type ExploreDetail =
  | { kind: 'api'; recipe: ApiRecipe }
  | { kind: 'gen'; recipe: GeneratedRecipe };

// ── Helpers ───────────────────────────────────────────────────────────────────

function totalMin(r: { prep_time_minutes: number | null; cook_time_minutes: number | null }): number {
  return (r.prep_time_minutes ?? 0) + (r.cook_time_minutes ?? 0);
}

function parseInstructions(raw: string | null | undefined): string[] {
  if (!raw) return [];
  return raw
    .split('\n')
    .map(l => l.replace(/^\d+[\.\)\-:\s]+/, '').trim())
    .filter(Boolean);
}

// ── Component ─────────────────────────────────────────────────────────────────

@Component({
  selector: 'app-meals',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  template: `
<div class="app">

  <!-- Header -->
  <header class="header">
    <a routerLink="/" class="back-link">
      <i class="ti ti-arrow-left"></i> Back
    </a>
    <div class="header-title">
      <i class="ti ti-chef-hat"></i> Browse Recipes
    </div>
  </header>

  <!-- Tabs -->
  <nav class="tabs">
    <button class="tab" [class.tab-active]="activeTab() === 'pantry'" (click)="setTab('pantry')">
      <i class="ti ti-basket"></i> Based on Pantry
    </button>
    <button class="tab" [class.tab-active]="activeTab() === 'explore'" (click)="setTab('explore')">
      <i class="ti ti-compass"></i> Explore Recipes
    </button>
  </nav>

  <!-- ══ PANTRY TAB ══════════════════════════════════════════════════════════ -->
  @if (activeTab() === 'pantry') {

    <!-- Login gate -->
    @if (!auth.isLoggedIn()) {
      <div class="pane">
        <div class="empty-state">
          <i class="ti ti-lock empty-ico"></i>
          <h3>Sign in to view pantry recipes</h3>
          <p>We'll match recipes with ingredients you already have at home.</p>
          <a routerLink="/auth/login" class="primary-btn">Sign In</a>
        </div>
      </div>
    }

    <!-- Loading -->
    @else if (pantryLoading()) {
      <div class="pane">
        <div class="loading-box">
          <i class="ti ti-loader-2 spin"></i>
          <span>Loading your pantry…</span>
        </div>
      </div>
    }

    <!-- Detail view -->
    @else if (pantryDetail()) {
      <div class="pane detail-pane">
        <button class="back-detail" (click)="pantryDetail.set(null)">
          <i class="ti ti-arrow-left"></i> Back to Recipes
        </button>
        <ng-container *ngTemplateOutlet="apiDetail; context: { r: pantryDetail() }"></ng-container>
      </div>
    }

    <!-- List view -->
    @else {
      <div class="pane">

        <!-- Empty pantry -->
        @if (pantryItems().length === 0) {
          <div class="empty-state">
            <i class="ti ti-basket empty-ico"></i>
            <h3>Your pantry is empty</h3>
            <p>Add ingredients to your pantry to get personalised recipe recommendations.</p>
            <a routerLink="/pantry" class="primary-btn">Add Pantry Items</a>
          </div>
        }

        @else {
          <!-- Pantry chips summary -->
          <div class="pantry-card">
            <div class="pantry-card-row">
              <i class="ti ti-basket pantry-ico"></i>
              <span class="pantry-count">
                <strong>{{ pantryItems().length }}</strong>
                ingredient{{ pantryItems().length !== 1 ? 's' : '' }} in your pantry
              </span>
            </div>
            <div class="chips mt-2">
              @for (p of pantryItems().slice(0, 6); track p.id) {
                <span class="chip">{{ p.ingredient_name }}</span>
              }
              @if (pantryItems().length > 6) {
                <span class="chip chip-more">+{{ pantryItems().length - 6 }} more</span>
              }
            </div>
          </div>

          <!-- No matching recipes -->
          @if (pantryMatches().length === 0) {
            <div class="empty-state mt-4">
              <i class="ti ti-search-off empty-ico"></i>
              <h3>No matching recipes found</h3>
              <p>Add more ingredients to your pantry to unlock more recipes.</p>
              <a routerLink="/pantry" class="primary-btn">Update Pantry</a>
            </div>
          }

          @else {
            <!-- AI insight bar -->
            <div class="insight-bar mt-3">
              <i class="ti ti-sparkles insight-ico"></i>
              <div>
                <div class="insight-title">
                  You can make <strong>{{ pantryMatches().length }}</strong> recipes
                </div>
                <div class="insight-sub">Based on your current pantry items</div>
              </div>
            </div>

            <!-- Recipe cards -->
            <div class="recipe-list mt-3">
              @for (m of pantryMatches(); track m.recipe.id) {
                <div class="recipe-card" (click)="pantryDetail.set(m.recipe)">
                  <div class="card-icon">
                    <i class="ti ti-bowl-chopsticks"></i>
                  </div>
                  <div class="card-body">
                    <div class="card-name">{{ m.recipe.title }}</div>
                    <div class="card-meta">
                      @if (totalMin(m.recipe) > 0) {
                        <span><i class="ti ti-clock"></i> {{ totalMin(m.recipe) }} min</span>
                      }
                      @if (m.recipe.cuisine_type) {
                        <span><i class="ti ti-world"></i> {{ m.recipe.cuisine_type }}</span>
                      }
                    </div>
                    @if (m.missingNames.length > 0) {
                      <div class="missing-row">
                        <i class="ti ti-circle-minus miss-ico"></i>
                        <span>Missing: {{ m.missingNames.join(', ') }}</span>
                      </div>
                    } @else {
                      <div class="ready-tag"><i class="ti ti-circle-check"></i> Ready to cook!</div>
                    }
                  </div>
                  <span class="match-badge"
                    [class.match-high]="m.matchPct >= 80"
                    [class.match-mid]="m.matchPct >= 50 && m.matchPct < 80">
                    {{ m.matchPct }}%
                  </span>
                </div>
              }
            </div>
          }
        }

      </div>
    }

  }

  <!-- ══ EXPLORE TAB ═════════════════════════════════════════════════════════ -->
  @if (activeTab() === 'explore') {

    <!-- Detail view -->
    @if (exploreDetail()) {
      <div class="pane detail-pane">
        <button class="back-detail" (click)="exploreDetail.set(null)">
          <i class="ti ti-arrow-left"></i> Back to Recipes
        </button>

        @if (exploreDetail()!.kind === 'api') {
          <ng-container *ngTemplateOutlet="apiDetail; context: { r: exploreDetail()!.recipe }"></ng-container>
        } @else {
          <ng-container *ngTemplateOutlet="genDetail; context: { r: exploreDetail()!.recipe }"></ng-container>
        }
      </div>
    }

    <!-- List + search view -->
    @else {
      <div class="pane">

        <!-- Search bar -->
        <div class="search-wrap" [class.search-focused]="searchFocused">
          <i class="ti ti-search search-icon"></i>
          <input
            class="search-input"
            [(ngModel)]="searchQuery"
            placeholder="Search any recipe — e.g. Egg Curry, Pasta…"
            (keydown.enter)="doSearch()"
            (focus)="searchFocused = true"
            (blur)="searchFocused = false">
          @if (searchQuery) {
            <button class="search-clear" (click)="searchQuery = ''; searchError = false">
              <i class="ti ti-x"></i>
            </button>
          }
        </div>

        <!-- Search loading -->
        @if (searchLoading()) {
          <div class="loading-box">
            <i class="ti ti-loader-2 spin"></i>
            <span>Finding recipe…</span>
          </div>
        }

        <!-- Search error -->
        @if (searchError && !searchLoading()) {
          <div class="error-banner">
            <i class="ti ti-alert-circle"></i>
            Could not generate recipe. Try a different search.
          </div>
        }

        <!-- Featured label -->
        @if (!searchLoading()) {
          <div class="section-label mt-3">
            <i class="ti ti-star"></i>
            @if (exploreLoading()) { Loading recipes… }
            @else { {{ featuredRecipes().length }} Featured Recipes }
          </div>
        }

        <!-- Featured skeleton -->
        @if (exploreLoading()) {
          <div class="recipe-list mt-2">
            @for (s of [1,2,3,4,5]; track s) {
              <div class="recipe-card skeleton-card">
                <div class="skeleton" style="width:48px;height:48px;border-radius:14px;flex-shrink:0"></div>
                <div class="card-body">
                  <div class="skeleton mb-2" style="height:14px;width:65%;border-radius:6px"></div>
                  <div class="skeleton" style="height:11px;width:40%;border-radius:4px"></div>
                </div>
              </div>
            }
          </div>
        }

        <!-- Featured recipe cards -->
        @else if (!searchLoading()) {
          <div class="recipe-list mt-2">
            @for (r of featuredRecipes(); track r.id) {
              <div class="recipe-card" (click)="openFeaturedDetail(r)">
                <div class="card-icon">
                  <i class="ti ti-bowl-chopsticks"></i>
                </div>
                <div class="card-body">
                  <div class="card-name">{{ r.title }}</div>
                  <div class="card-meta">
                    @if (totalMin(r) > 0) {
                      <span><i class="ti ti-clock"></i> {{ totalMin(r) }} min</span>
                    }
                    @if (r.servings) {
                      <span><i class="ti ti-users"></i> {{ r.servings }} servings</span>
                    }
                    @if (r.cuisine_type) {
                      <span><i class="ti ti-world"></i> {{ r.cuisine_type }}</span>
                    }
                  </div>
                  @if (r.description) {
                    <p class="card-desc">{{ r.description }}</p>
                  }
                </div>
                <i class="ti ti-chevron-right chevron-ico"></i>
              </div>
            }
          </div>
        }

      </div>
    }
  }

  <!-- ══ SHARED DETAIL TEMPLATES ════════════════════════════════════════════ -->

  <!-- ApiRecipe detail (pantry + featured cards) -->
  <ng-template #apiDetail let-r="r">
    <div class="detail-header">
      <div class="detail-icon"><i class="ti ti-bowl-chopsticks"></i></div>
      <h2 class="detail-name">{{ r.title }}</h2>
      <div class="detail-chips">
        @if (totalMin(r) > 0) {
          <span class="detail-chip"><i class="ti ti-clock"></i> {{ totalMin(r) }} min</span>
        }
        @if (r.servings) {
          <span class="detail-chip"><i class="ti ti-users"></i> {{ r.servings }} servings</span>
        }
        @if (r.cuisine_type) {
          <span class="detail-chip"><i class="ti ti-world"></i> {{ r.cuisine_type }}</span>
        }
      </div>
    </div>

    @if (r.description) {
      <p class="detail-desc">{{ r.description }}</p>
    }

    <!-- Nutrition -->
    @if (r.nutritional_info) {
      <section class="detail-section">
        <h3 class="section-title"><i class="ti ti-chart-bar"></i> Nutrition</h3>
        <div class="nutrition-grid">
          @if (r.nutritional_info['calories']) {
            <div class="nutr-card nutr-cal">
              <div class="nutr-val">{{ r.nutritional_info['calories'] }}</div>
              <div class="nutr-label">Calories</div>
            </div>
          }
          @if (r.nutritional_info['protein_g']) {
            <div class="nutr-card nutr-pro">
              <div class="nutr-val">{{ r.nutritional_info['protein_g'] }}g</div>
              <div class="nutr-label">Protein</div>
            </div>
          }
          @if (r.nutritional_info['carbs_g']) {
            <div class="nutr-card nutr-carb">
              <div class="nutr-val">{{ r.nutritional_info['carbs_g'] }}g</div>
              <div class="nutr-label">Carbs</div>
            </div>
          }
          @if (r.nutritional_info['fat_g']) {
            <div class="nutr-card nutr-fat">
              <div class="nutr-val">{{ r.nutritional_info['fat_g'] }}g</div>
              <div class="nutr-label">Fat</div>
            </div>
          }
          @if (r.nutritional_info['fiber_g']) {
            <div class="nutr-card nutr-fib">
              <div class="nutr-val">{{ r.nutritional_info['fiber_g'] }}g</div>
              <div class="nutr-label">Fiber</div>
            </div>
          }
        </div>
      </section>
    }

    <!-- Ingredients -->
    @if (r.recipe_ingredients?.length > 0) {
      <section class="detail-section">
        <h3 class="section-title"><i class="ti ti-list-details"></i> Ingredients</h3>
        <ul class="ing-list">
          @for (ri of r.recipe_ingredients; track ri.ingredient.name) {
            <li>
              <span class="ing-qty">{{ ri.quantity ?? '' }} {{ ri.unit ?? '' }}</span>
              {{ ri.ingredient.name }}
            </li>
          }
        </ul>
      </section>
    }

    <!-- Instructions -->
    @if (r.instructions) {
      <section class="detail-section">
        <h3 class="section-title"><i class="ti ti-list-numbers"></i> Instructions</h3>
        <ol class="steps-list">
          @for (step of parseInstructions(r.instructions); track $index) {
            <li>
              <span class="step-num">{{ $index + 1 }}</span>
              <span class="step-text">{{ step }}</span>
            </li>
          }
        </ol>
      </section>
    }
  </ng-template>

  <!-- GeneratedRecipe detail (search results) -->
  <ng-template #genDetail let-r="r">
    <div class="detail-header">
      <div class="detail-icon">
        @if (r.is_ai_generated) {
          <i class="ti ti-sparkles"></i>
        } @else {
          <i class="ti ti-bowl-chopsticks"></i>
        }
      </div>
      <h2 class="detail-name">{{ r.title }}</h2>
      @if (r.is_ai_generated) {
        <div class="ai-badge"><i class="ti ti-sparkles"></i> AI Generated</div>
      }
      <div class="detail-chips">
        @if (totalMin(r) > 0) {
          <span class="detail-chip"><i class="ti ti-clock"></i> {{ totalMin(r) }} min</span>
        }
        @if (r.servings) {
          <span class="detail-chip"><i class="ti ti-users"></i> {{ r.servings }} servings</span>
        }
        @if (r.cuisine_type) {
          <span class="detail-chip"><i class="ti ti-world"></i> {{ r.cuisine_type }}</span>
        }
      </div>
    </div>

    @if (r.description) {
      <p class="detail-desc">{{ r.description }}</p>
    }

    <!-- Nutrition -->
    @if (r.nutritional_info) {
      <section class="detail-section">
        <h3 class="section-title"><i class="ti ti-chart-bar"></i> Nutrition</h3>
        <div class="nutrition-grid">
          @if (r.nutritional_info['calories']) {
            <div class="nutr-card nutr-cal">
              <div class="nutr-val">{{ r.nutritional_info['calories'] }}</div>
              <div class="nutr-label">Calories</div>
            </div>
          }
          @if (r.nutritional_info['protein_g']) {
            <div class="nutr-card nutr-pro">
              <div class="nutr-val">{{ r.nutritional_info['protein_g'] }}g</div>
              <div class="nutr-label">Protein</div>
            </div>
          }
          @if (r.nutritional_info['carbs_g']) {
            <div class="nutr-card nutr-carb">
              <div class="nutr-val">{{ r.nutritional_info['carbs_g'] }}g</div>
              <div class="nutr-label">Carbs</div>
            </div>
          }
          @if (r.nutritional_info['fat_g']) {
            <div class="nutr-card nutr-fat">
              <div class="nutr-val">{{ r.nutritional_info['fat_g'] }}g</div>
              <div class="nutr-label">Fat</div>
            </div>
          }
          @if (r.nutritional_info['fiber_g']) {
            <div class="nutr-card nutr-fib">
              <div class="nutr-val">{{ r.nutritional_info['fiber_g'] }}g</div>
              <div class="nutr-label">Fiber</div>
            </div>
          }
        </div>
      </section>
    }

    <!-- Ingredients -->
    @if (r.ingredients?.length > 0) {
      <section class="detail-section">
        <h3 class="section-title"><i class="ti ti-list-details"></i> Ingredients</h3>
        <ul class="ing-list">
          @for (ing of r.ingredients; track ing.name) {
            <li>
              <span class="ing-qty">{{ ing.quantity ?? '' }} {{ ing.unit ?? '' }}</span>
              {{ ing.name }}
            </li>
          }
        </ul>
      </section>
    }

    <!-- Instructions -->
    @if (r.instructions?.length > 0) {
      <section class="detail-section">
        <h3 class="section-title"><i class="ti ti-list-numbers"></i> Instructions</h3>
        <ol class="steps-list">
          @for (step of r.instructions; track $index) {
            <li>
              <span class="step-num">{{ $index + 1 }}</span>
              <span class="step-text">{{ step }}</span>
            </li>
          }
        </ol>
      </section>
    }

    <!-- Chef's tips -->
    @if (r.cooking_tips?.length > 0) {
      <div class="tip-card">
        <i class="ti ti-bulb tip-icon"></i>
        <div>
          <div class="tip-label">Chef's Tips</div>
          @for (tip of r.cooking_tips; track $index) {
            <div class="tip-text">{{ tip }}</div>
          }
        </div>
      </div>
    }
  </ng-template>

</div>
  `,
  styles: [`
    /* ── CSS variables ──────────────────────────────────────────────────────── */
    :host {
      --bg:         #f8fafc;
      --surface:    #ffffff;
      --surface-2:  #f1f5f9;
      --text:       #0f172a;
      --text-muted: #64748b;
      --border:     #e2e8f0;
      --info:       #0ea5e9;
      --info-light: #e0f2fe;
      --info-dark:  #0284c7;
      --green:      #16a34a;
      --green-light:#dcfce7;
      --amber:      #f59e0b;
      --radius:     12px;
      --shadow:     0 1px 3px rgba(0,0,0,0.08), 0 1px 2px rgba(0,0,0,0.05);
      --shadow-md:  0 4px 6px rgba(0,0,0,0.07), 0 2px 4px rgba(0,0,0,0.05);
      display: block; min-height: 100vh; background: var(--bg);
      font-family: 'Inter', system-ui, sans-serif;
    }
    @media (prefers-color-scheme: dark) {
      :host {
        --bg: #0f172a; --surface: #1e293b; --surface-2: #263548;
        --text: #f1f5f9; --text-muted: #94a3b8; --border: #334155;
        --info-light: #0c4a6e; --info-dark: #7dd3fc; --green-light: #052e16;
      }
    }
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

    /* ── Header ─────────────────────────────────────────────────────────────── */
    .header {
      display: flex; align-items: center; justify-content: center;
      padding: 14px 20px; background: var(--surface);
      border-bottom: 1px solid var(--border); position: relative; box-shadow: var(--shadow);
    }
    .back-link {
      position: absolute; left: 20px; display: flex; align-items: center; gap: 5px;
      color: var(--info); text-decoration: none; font-size: 14px; font-weight: 500;
    }
    .back-link:hover { color: var(--info-dark); }
    .header-title {
      display: flex; align-items: center; gap: 8px;
      font-size: 17px; font-weight: 700; color: var(--text);
    }
    .header-title i { font-size: 22px; color: var(--info); }

    /* ── Tabs ────────────────────────────────────────────────────────────────── */
    .tabs {
      display: flex; background: var(--surface);
      border-bottom: 1px solid var(--border); position: sticky; top: 0; z-index: 10;
    }
    .tab {
      flex: 1; display: flex; align-items: center; justify-content: center; gap: 7px;
      padding: 14px 12px; border: none; border-bottom: 3px solid transparent;
      background: transparent; color: var(--text-muted);
      font-size: 14px; font-weight: 500; cursor: pointer;
      transition: color 0.15s, border-color 0.15s;
    }
    .tab.tab-active { color: var(--info); border-bottom-color: var(--info); font-weight: 600; }
    .tab i { font-size: 18px; }

    /* ── Pane ────────────────────────────────────────────────────────────────── */
    .pane { max-width: 600px; margin: 0 auto; padding: 20px 16px 100px; }
    .detail-pane { max-width: 600px; margin: 0 auto; padding: 16px 16px 100px; animation: fadeIn 0.2s ease-out; }
    @keyframes fadeIn { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: translateY(0); } }
    @media (min-width: 768px) { .pane, .detail-pane { padding-left: 24px; padding-right: 24px; } }
    .mt-2 { margin-top: 8px; }
    .mt-3 { margin-top: 14px; }
    .mt-4 { margin-top: 20px; }

    /* ── Loading ─────────────────────────────────────────────────────────────── */
    .loading-box {
      display: flex; align-items: center; justify-content: center; gap: 12px;
      padding: 48px 0; color: var(--text-muted); font-size: 14px;
    }
    .spin { font-size: 24px; display: inline-block; animation: spin 0.9s linear infinite; }
    @keyframes spin { to { transform: rotate(360deg); } }

    /* ── Empty state ─────────────────────────────────────────────────────────── */
    .empty-state { text-align: center; padding: 56px 24px; }
    .empty-ico { font-size: 52px; display: block; margin-bottom: 14px; color: var(--text-muted); opacity: 0.35; }
    .empty-state h3 { font-size: 18px; font-weight: 700; color: var(--text); margin-bottom: 8px; }
    .empty-state p  { font-size: 14px; color: var(--text-muted); margin-bottom: 22px; line-height: 1.6; }
    .primary-btn {
      display: inline-flex; align-items: center; justify-content: center;
      background: var(--info); color: #fff; border: none;
      border-radius: var(--radius); padding: 12px 28px;
      font-size: 14px; font-weight: 600; cursor: pointer; text-decoration: none;
      transition: background 0.15s;
    }
    .primary-btn:hover { background: var(--info-dark); }

    /* ── Pantry summary card ─────────────────────────────────────────────────── */
    .pantry-card {
      background: var(--surface); border: 1px solid var(--border);
      border-radius: var(--radius); padding: 14px 16px; box-shadow: var(--shadow);
    }
    .pantry-card-row { display: flex; align-items: center; gap: 10px; }
    .pantry-ico { font-size: 20px; color: var(--green); }
    .pantry-count { font-size: 14px; color: var(--text); }
    .pantry-count strong { color: var(--green); }

    /* ── Chips ───────────────────────────────────────────────────────────────── */
    .chips { display: flex; flex-wrap: wrap; gap: 7px; }
    .chip {
      padding: 4px 12px; background: var(--green-light); color: var(--green);
      border-radius: 100px; font-size: 12px; font-weight: 500;
    }
    .chip-more { background: var(--surface-2); color: var(--text-muted); }

    /* ── Insight bar ─────────────────────────────────────────────────────────── */
    .insight-bar {
      display: flex; align-items: center; gap: 12px;
      background: linear-gradient(135deg, #0c4a6e, #0369a1, #0284c7);
      border-radius: var(--radius); padding: 14px 16px; box-shadow: var(--shadow-md);
    }
    .insight-ico { font-size: 22px; color: #fff; flex-shrink: 0; }
    .insight-title { font-size: 14px; font-weight: 600; color: #fff; }
    .insight-title strong { font-weight: 800; }
    .insight-sub { font-size: 11px; color: rgba(255,255,255,0.72); margin-top: 2px; }

    /* ── Section label ───────────────────────────────────────────────────────── */
    .section-label {
      display: flex; align-items: center; gap: 6px;
      font-size: 11px; font-weight: 700; letter-spacing: 0.7px; text-transform: uppercase;
      color: var(--text-muted);
    }
    .section-label i { color: var(--info); font-size: 14px; }

    /* ── Recipe cards ────────────────────────────────────────────────────────── */
    .recipe-list { display: flex; flex-direction: column; gap: 10px; }
    .recipe-card {
      display: flex; align-items: center; gap: 14px;
      background: var(--surface); border: 1.5px solid var(--border);
      border-radius: var(--radius); padding: 14px 16px;
      box-shadow: var(--shadow); cursor: pointer;
      transition: transform 0.15s, box-shadow 0.15s, border-color 0.15s;
    }
    .recipe-card:hover { transform: translateY(-2px); box-shadow: var(--shadow-md); border-color: var(--info); }
    .skeleton-card { cursor: default; pointer-events: none; }

    .card-icon {
      width: 50px; height: 50px; border-radius: 14px;
      background: var(--info-light); display: flex; align-items: center; justify-content: center;
      flex-shrink: 0; font-size: 24px; color: var(--info-dark);
    }
    .card-body { flex: 1; min-width: 0; }
    .card-name { font-size: 15px; font-weight: 700; color: var(--text); margin-bottom: 4px; }
    .card-meta { display: flex; gap: 12px; font-size: 12px; color: var(--text-muted); flex-wrap: wrap; }
    .card-meta span { display: flex; align-items: center; gap: 4px; }
    .card-desc {
      font-size: 12px; color: var(--text-muted); margin-top: 4px; line-height: 1.5;
      display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;
    }

    .match-badge {
      padding: 5px 11px; border-radius: 100px;
      font-size: 12px; font-weight: 700; color: #fff;
      background: #94a3b8; flex-shrink: 0;
    }
    .match-badge.match-high { background: var(--green); }
    .match-badge.match-mid  { background: var(--amber); }

    .chevron-ico { font-size: 18px; color: var(--text-muted); flex-shrink: 0; }

    .missing-row {
      display: flex; align-items: center; gap: 5px;
      font-size: 11px; color: var(--text-muted); margin-top: 4px;
    }
    .miss-ico { font-size: 13px; color: #ef4444; flex-shrink: 0; }
    .ready-tag {
      display: inline-flex; align-items: center; gap: 4px;
      font-size: 11px; font-weight: 600; color: var(--green);
      background: var(--green-light); border-radius: 8px; padding: 2px 8px;
      margin-top: 4px;
    }

    /* ── Skeleton ────────────────────────────────────────────────────────────── */
    .skeleton {
      background: linear-gradient(90deg, #f0f0f0 25%, #e8e8e8 50%, #f0f0f0 75%);
      background-size: 200% 100%; animation: shimmer 1.2s infinite;
    }
    @keyframes shimmer { to { background-position: -200% 0; } }

    /* ── Search ──────────────────────────────────────────────────────────────── */
    .search-wrap {
      display: flex; align-items: center; gap: 10px;
      background: var(--surface); border: 1.5px solid var(--border);
      border-radius: var(--radius); padding: 0 16px;
      box-shadow: var(--shadow); margin-bottom: 6px; transition: border-color 0.15s;
    }
    .search-wrap.search-focused { border-color: var(--info); }
    .search-icon { font-size: 20px; color: var(--text-muted); flex-shrink: 0; }
    .search-input {
      flex: 1; border: none; outline: none; background: transparent;
      color: var(--text); font-size: 14px; padding: 15px 0;
    }
    .search-input::placeholder { color: var(--text-muted); }
    .search-clear {
      background: none; border: none; cursor: pointer;
      color: var(--text-muted); font-size: 16px; padding: 4px;
      display: flex; align-items: center;
    }

    /* ── Error banner ────────────────────────────────────────────────────────── */
    .error-banner {
      display: flex; align-items: center; gap: 8px;
      background: #fef2f2; border: 1px solid #fecaca; color: #b91c1c;
      border-radius: var(--radius); padding: 12px 14px;
      font-size: 14px; margin-top: 10px;
    }

    /* ── Detail ──────────────────────────────────────────────────────────────── */
    .back-detail {
      display: inline-flex; align-items: center; gap: 6px; background: none;
      border: none; color: var(--info); font-size: 14px; font-weight: 500;
      cursor: pointer; padding: 0; margin-bottom: 24px; transition: color 0.15s;
    }
    .back-detail:hover { color: var(--info-dark); }

    .detail-header { text-align: center; margin-bottom: 24px; }
    .detail-icon {
      width: 68px; height: 68px; border-radius: 22px;
      background: var(--info-light); display: flex; align-items: center; justify-content: center;
      margin: 0 auto 14px; font-size: 34px; color: var(--info-dark);
    }
    .detail-name { font-size: 22px; font-weight: 800; color: var(--text); margin-bottom: 10px; }
    .detail-chips { display: flex; justify-content: center; gap: 8px; flex-wrap: wrap; }
    .detail-chip {
      display: inline-flex; align-items: center; gap: 5px;
      padding: 5px 13px; border-radius: 100px;
      background: var(--surface-2); border: 1px solid var(--border);
      font-size: 12px; font-weight: 500; color: var(--text-muted);
    }
    .ai-badge {
      display: inline-flex; align-items: center; gap: 5px; margin: 8px auto 4px;
      padding: 4px 12px; border-radius: 100px;
      background: linear-gradient(135deg, #6d28d9, #9333ea);
      color: #fff; font-size: 12px; font-weight: 600;
    }
    .detail-desc { font-size: 14px; color: var(--text-muted); line-height: 1.65; margin-bottom: 20px; }

    /* ── Nutrition grid ──────────────────────────────────────────────────────── */
    .detail-section { margin-bottom: 24px; }
    .section-title {
      display: flex; align-items: center; gap: 8px;
      font-size: 15px; font-weight: 700; color: var(--text);
      margin-bottom: 12px; padding-bottom: 10px; border-bottom: 1px solid var(--border);
    }
    .section-title i { color: var(--info); font-size: 17px; }

    .nutrition-grid { display: flex; gap: 8px; flex-wrap: wrap; }
    .nutr-card { flex: 1; min-width: 60px; border-radius: 12px; padding: 10px 8px; text-align: center; }
    .nutr-val   { font-size: 16px; font-weight: 800; color: var(--text); }
    .nutr-label { font-size: 10px; font-weight: 500; color: var(--text-muted); margin-top: 2px; }
    .nutr-cal  { background: #fff3e0; }
    .nutr-pro  { background: #dcfce7; }
    .nutr-carb { background: #eff6ff; }
    .nutr-fat  { background: #fce7f3; }
    .nutr-fib  { background: #f5f3ff; }

    /* ── Ingredients list ────────────────────────────────────────────────────── */
    .ing-list { list-style: none; display: flex; flex-direction: column; gap: 7px; }
    .ing-list li {
      display: flex; align-items: baseline; gap: 8px;
      font-size: 14px; color: var(--text-muted);
      padding: 9px 12px; background: var(--surface);
      border: 1px solid var(--border); border-radius: 8px;
    }
    .ing-qty { font-weight: 600; color: var(--info-dark); min-width: 44px; flex-shrink: 0; }

    /* ── Steps ───────────────────────────────────────────────────────────────── */
    .steps-list { list-style: none; display: flex; flex-direction: column; gap: 12px; }
    .steps-list li { display: flex; gap: 12px; align-items: flex-start; }
    .step-num {
      width: 26px; height: 26px; border-radius: 50%;
      background: var(--info); color: #fff;
      font-size: 12px; font-weight: 800;
      display: flex; align-items: center; justify-content: center; flex-shrink: 0; margin-top: 1px;
    }
    .step-text { font-size: 14px; color: var(--text-muted); line-height: 1.65; }

    /* ── Chef's tip ──────────────────────────────────────────────────────────── */
    .tip-card {
      display: flex; gap: 12px; align-items: flex-start;
      background: #fffbeb; border: 1.5px solid #fde68a;
      border-radius: var(--radius); padding: 14px 16px; margin-top: 8px;
    }
    .tip-icon { font-size: 24px; color: #f59e0b; flex-shrink: 0; margin-top: 2px; }
    .tip-label { font-size: 11px; font-weight: 700; color: #92400e; margin-bottom: 6px; }
    .tip-text { font-size: 14px; color: #78350f; line-height: 1.6; margin-bottom: 4px; }
  `],
})
export class MealsComponent implements OnInit {
  private http = inject(HttpClient);
  auth = inject(AuthService);

  activeTab = signal<'pantry' | 'explore'>('pantry');

  // ── Pantry tab ────────────────────────────────────────────────────────────
  pantryItems   = signal<PantryItem[]>([]);
  pantryRecipes = signal<ApiRecipe[]>([]);
  pantryLoading = signal(true);
  pantryDetail  = signal<ApiRecipe | null>(null);

  pantryMatches = computed<PantryMatch[]>(() => {
    const names = new Set(this.pantryItems().map(p => p.ingredient_name.toLowerCase()));
    return this.pantryRecipes()
      .map(r => {
        const all  = r.recipe_ingredients.map(ri => ri.ingredient.name);
        const have = all.filter(n => names.has(n.toLowerCase()));
        const miss = all.filter(n => !names.has(n.toLowerCase()));
        const pct  = all.length > 0
          ? Math.round((have.length / all.length) * 100)
          : Math.round(r.efficacy_score * 100);
        return { recipe: r, matchPct: pct, missingNames: miss.slice(0, 3) };
      })
      .sort((a, b) => b.matchPct - a.matchPct);
  });

  // ── Explore tab ───────────────────────────────────────────────────────────
  exploreRecipes  = signal<ApiRecipe[]>([]);
  exploreLoading  = signal(true);
  searchQuery     = '';
  searchFocused   = false;
  searchLoading   = signal(false);
  searchError     = false;
  exploreDetail   = signal<ExploreDetail | null>(null);

  featuredRecipes = computed(() => this.exploreRecipes().slice(0, 5));

  // ── Lifecycle ────────────────────────────────────────────────────────────
  ngOnInit() {
    if (this.auth.isLoggedIn()) {
      this.loadPantry();
    } else {
      this.pantryLoading.set(false);
    }
    this.loadExploreRecipes();
  }

  private loadPantry() {
    this.pantryLoading.set(true);
    this.http.get<PantryItem[]>(`${environment.apiUrl}/pantry`)
      .pipe(catchError(() => of([])))
      .subscribe(items => {
        this.pantryItems.set(items);
        if (items.length > 0) {
          this.loadPantryRecipes();
        } else {
          this.pantryLoading.set(false);
        }
      });
  }

  private loadPantryRecipes() {
    this.http.get<ApiRecipe[]>(`${environment.apiUrl}/recipes/from-pantry?limit=20`)
      .pipe(catchError(() => of([])))
      .subscribe(recipes => {
        this.pantryRecipes.set(recipes);
        this.pantryLoading.set(false);
      });
  }

  private loadExploreRecipes() {
    this.exploreLoading.set(true);
    this.http.get<ApiRecipe[]>(`${environment.apiUrl}/recipes?limit=20`)
      .pipe(catchError(() => of([])))
      .subscribe(recipes => {
        this.exploreRecipes.set(recipes);
        this.exploreLoading.set(false);
      });
  }

  setTab(tab: 'pantry' | 'explore') {
    this.activeTab.set(tab);
    this.pantryDetail.set(null);
    this.exploreDetail.set(null);
  }

  doSearch() {
    const q = this.searchQuery.trim();
    if (!q) return;
    this.searchLoading.set(true);
    this.searchError = false;
    this.exploreDetail.set(null);
    this.http
      .get<GeneratedRecipe>(`${environment.apiUrl}/recipes/generate?q=${encodeURIComponent(q)}`)
      .pipe(catchError(() => of(null)))
      .subscribe(recipe => {
        if (recipe) {
          this.exploreDetail.set({ kind: 'gen', recipe });
        } else {
          this.searchError = true;
        }
        this.searchLoading.set(false);
      });
  }

  openFeaturedDetail(r: ApiRecipe) {
    this.exploreDetail.set({ kind: 'api', recipe: r });
  }

  readonly totalMin         = totalMin;
  readonly parseInstructions = parseInstructions;
}
