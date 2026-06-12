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

interface PantryItem { id: string; ingredient_name: string; }

interface RecipeDetail {
  title: string;
  description: string | null;
  prep_time_minutes: number | null;
  cook_time_minutes: number | null;
  servings: number;
  cuisine_type: string | null;
  ingredients: { label: string }[];
  instructions: string[];
  nutritional_info: Record<string, number> | null;
  cooking_tips: string[];
  is_ai_generated: boolean;
}

interface DefaultCard { title: string; cuisine: string; time: number; icon: string; }

// ── Constants ─────────────────────────────────────────────────────────────────

const DEFAULT_EXPLORE: DefaultCard[] = [
  { title: 'Egg Curry',            cuisine: 'Indian',  time: 30, icon: 'egg'   },
  { title: 'Spaghetti Carbonara',  cuisine: 'Italian', time: 25, icon: 'bread' },
  { title: 'Chicken Stir Fry',     cuisine: 'Chinese', time: 20, icon: 'meat'  },
  { title: 'Dal Tadka',            cuisine: 'Indian',  time: 35, icon: 'leaf'  },
  { title: 'Mushroom Risotto',     cuisine: 'Italian', time: 40, icon: 'salad' },
];

// ── Helpers ───────────────────────────────────────────────────────────────────

function totalMin(prep: number | null, cook: number | null): number {
  return (prep ?? 0) + (cook ?? 0);
}

function diffLabel(min: number): string {
  if (min <= 0 || min <= 20) return 'Easy';
  if (min <= 40) return 'Medium';
  return 'Advanced';
}

function parseInstructions(raw: string | null | undefined): string[] {
  if (!raw) return [];
  return raw.split('\n').map(l => l.replace(/^\d+[\.\)\-:\s]+/, '').trim()).filter(Boolean);
}

function apiToDetail(r: ApiRecipe): RecipeDetail {
  return {
    title: r.title,
    description: r.description,
    prep_time_minutes: r.prep_time_minutes,
    cook_time_minutes: r.cook_time_minutes,
    servings: r.servings,
    cuisine_type: r.cuisine_type,
    ingredients: r.recipe_ingredients.map(ri =>
      ({ label: [ri.quantity, ri.unit, ri.ingredient.name].filter(Boolean).join(' ') })
    ),
    instructions: parseInstructions(r.instructions),
    nutritional_info: r.nutritional_info,
    cooking_tips: [],
    is_ai_generated: false,
  };
}

function genToDetail(r: any): RecipeDetail {
  return {
    title: r.title,
    description: r.description ?? null,
    prep_time_minutes: r.prep_time_minutes ?? null,
    cook_time_minutes: r.cook_time_minutes ?? null,
    servings: r.servings ?? 2,
    cuisine_type: r.cuisine_type ?? null,
    ingredients: (r.ingredients ?? []).map((i: any) =>
      ({ label: [i.quantity, i.unit, i.name].filter(Boolean).join(' ') })
    ),
    instructions: Array.isArray(r.instructions) ? r.instructions : parseInstructions(r.instructions),
    nutritional_info: r.nutritional_info ?? null,
    cooking_tips: r.cooking_tips ?? [],
    is_ai_generated: !!r.is_ai_generated,
  };
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
    <a routerLink="/" class="back-link"><i class="ti ti-arrow-left"></i> Back</a>
    <div class="header-title"><i class="ti ti-chef-hat"></i> Browse Recipes</div>
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

    @if (pantryDetail()) {

      <!-- Pantry detail -->
      <div class="pane">
        <button class="back-detail" (click)="pantryDetail.set(null)">
          <i class="ti ti-arrow-left"></i> Back to Recipes
        </button>
        <ng-container *ngTemplateOutlet="detailTpl; context: { $implicit: pantryDetail() }">
        </ng-container>
      </div>

    } @else if (!auth.isLoggedIn()) {

      <div class="pane">
        <div class="empty-state">
          <i class="ti ti-lock empty-ico"></i>
          <h3>Sign in required</h3>
          <p>Sign in to see recipes personalised for your pantry.</p>
          <a routerLink="/auth/login" class="primary-btn">Sign In</a>
        </div>
      </div>

    } @else if (pantryLoading()) {

      <div class="pane">
        <div class="loading-box">
          <i class="ti ti-loader-2 spin"></i>
          <span>Finding recipes for your pantry…</span>
        </div>
      </div>

    } @else if (pantryMatches().length === 0) {

      <div class="pane">
        <div class="empty-state">
          <i class="ti ti-basket empty-ico"></i>
          <h3>No recipes found</h3>
          <p>Add more ingredients to your pantry to get personalised recipe suggestions.</p>
          <a routerLink="/pantry" class="primary-btn">Add Pantry Items</a>
        </div>
      </div>

    } @else {

      <div class="pane">
        <div class="section-label">
          <i class="ti ti-sparkles"></i> {{ pantryMatches().length }} recipes from your pantry
        </div>
        <div class="card-list mt-2">
          @for (m of pantryMatches(); track m.recipe.id) {
            <div class="recipe-card" (click)="openPantryDetail(m.recipe)">
              <div class="card-icon"><i class="ti ti-bowl-chopsticks"></i></div>
              <div class="card-body">
                <div class="card-name">{{ m.recipe.title }}</div>
                <div class="card-meta">
                  @if (recipeTime(m.recipe) > 0) {
                    <span><i class="ti ti-clock"></i> {{ recipeTime(m.recipe) }} min</span>
                  }
                  <span><i class="ti ti-chart-bar"></i> {{ diff(m.recipe) }}</span>
                </div>
              </div>
              <span class="match-badge"
                [class.match-high]="m.matchPct >= 80"
                [class.match-mid]="m.matchPct >= 50 && m.matchPct < 80">
                {{ m.matchPct }}%
              </span>
            </div>
          }
        </div>
      </div>

    }
  }

  <!-- ══ EXPLORE TAB ═════════════════════════════════════════════════════════ -->
  @if (activeTab() === 'explore') {

    @if (exploreDetail()) {

      <!-- Explore detail -->
      <div class="pane">
        <button class="back-detail" (click)="exploreDetail.set(null)">
          <i class="ti ti-arrow-left"></i> Back to Recipes
        </button>
        <ng-container *ngTemplateOutlet="detailTpl; context: { $implicit: exploreDetail() }">
        </ng-container>
      </div>

    } @else {

      <div class="pane">

        <!-- Search bar -->
        <div class="search-wrap" [class.search-active]="searchFocused || searchQuery">
          <i class="ti ti-search search-icon"></i>
          <input class="search-input" [(ngModel)]="searchQuery"
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
          <div class="loading-box mt-4">
            <i class="ti ti-loader-2 spin"></i>
            <span>Generating recipe details…</span>
          </div>
        }

        <!-- Search error -->
        @if (searchError && !searchLoading()) {
          <div class="error-msg mt-3">
            <i class="ti ti-alert-circle"></i> Could not find that recipe. Try a different name.
          </div>
        }

        <!-- Default 5 recipes -->
        @if (!searchLoading()) {
          <div class="section-label mt-4">
            <i class="ti ti-star"></i> Popular Recipes
          </div>
          <div class="card-list mt-2">
            @for (d of defaultExplore; track d.title) {
              <div class="recipe-card" (click)="fetchAndShowDetail(d.title)">
                <div class="card-icon">
                  <i class="ti ti-{{ d.icon }}"></i>
                </div>
                <div class="card-body">
                  <div class="card-name">{{ d.title }}</div>
                  <div class="card-meta">
                    <span><i class="ti ti-clock"></i> {{ d.time }} min</span>
                    <span><i class="ti ti-world"></i> {{ d.cuisine }}</span>
                  </div>
                </div>
                <i class="ti ti-chevron-right chevron-ico"></i>
              </div>
            }
          </div>
        }

      </div>

    }
  }

  <!-- ══ SHARED DETAIL TEMPLATE ══════════════════════════════════════════════ -->
  <ng-template #detailTpl let-r>
    <div class="detail-header">
      <div class="detail-icon-wrap">
        <i class="ti ti-bowl-chopsticks detail-main-icon"></i>
      </div>
      <h2 class="detail-name">{{ r.title }}</h2>
      @if (r.is_ai_generated) {
        <span class="ai-badge"><i class="ti ti-sparkles"></i> AI Generated</span>
      }
      <div class="detail-chips">
        @if (totalMin(r.prep_time_minutes, r.cook_time_minutes) > 0) {
          <span class="d-chip">
            <i class="ti ti-clock"></i> {{ totalMin(r.prep_time_minutes, r.cook_time_minutes) }} min
          </span>
        }
        <span class="d-chip d-chip-diff"
          [class.diff-easy]="diffLabel(totalMin(r.prep_time_minutes, r.cook_time_minutes)) === 'Easy'"
          [class.diff-med]="diffLabel(totalMin(r.prep_time_minutes, r.cook_time_minutes)) === 'Medium'"
          [class.diff-hard]="diffLabel(totalMin(r.prep_time_minutes, r.cook_time_minutes)) === 'Advanced'">
          {{ diffLabel(totalMin(r.prep_time_minutes, r.cook_time_minutes)) }}
        </span>
        @if (r.servings) {
          <span class="d-chip"><i class="ti ti-users"></i> {{ r.servings }} servings</span>
        }
        @if (r.cuisine_type) {
          <span class="d-chip"><i class="ti ti-world"></i> {{ r.cuisine_type }}</span>
        }
      </div>
    </div>

    @if (r.description) {
      <p class="detail-desc">{{ r.description }}</p>
    }

    <!-- Nutrition -->
    @if (r.nutritional_info) {
      <section class="d-section">
        <h3 class="d-section-title"><i class="ti ti-chart-bar"></i> Nutrition Info</h3>
        <div class="nutr-grid">
          @if (r.nutritional_info['calories']) {
            <div class="nutr-card nutr-cal">
              <div class="nutr-val">{{ r.nutritional_info['calories'] }}</div>
              <div class="nutr-lbl">Calories</div>
            </div>
          }
          @if (r.nutritional_info['protein_g']) {
            <div class="nutr-card nutr-pro">
              <div class="nutr-val">{{ r.nutritional_info['protein_g'] }}g</div>
              <div class="nutr-lbl">Protein</div>
            </div>
          }
          @if (r.nutritional_info['carbs_g']) {
            <div class="nutr-card nutr-carb">
              <div class="nutr-val">{{ r.nutritional_info['carbs_g'] }}g</div>
              <div class="nutr-lbl">Carbs</div>
            </div>
          }
          @if (r.nutritional_info['fat_g']) {
            <div class="nutr-card nutr-fat">
              <div class="nutr-val">{{ r.nutritional_info['fat_g'] }}g</div>
              <div class="nutr-lbl">Fat</div>
            </div>
          }
          @if (r.nutritional_info['fiber_g']) {
            <div class="nutr-card nutr-fib">
              <div class="nutr-val">{{ r.nutritional_info['fiber_g'] }}g</div>
              <div class="nutr-lbl">Fiber</div>
            </div>
          }
        </div>
      </section>
    }

    <!-- Ingredients -->
    @if (r.ingredients?.length > 0) {
      <section class="d-section">
        <h3 class="d-section-title"><i class="ti ti-list-details"></i> Ingredients</h3>
        <ul class="ing-list">
          @for (ing of r.ingredients; track $index) {
            <li>{{ ing.label }}</li>
          }
        </ul>
      </section>
    }

    <!-- Instructions -->
    @if (r.instructions?.length > 0) {
      <section class="d-section">
        <h3 class="d-section-title"><i class="ti ti-list-numbers"></i> Instructions</h3>
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

    <!-- Tips -->
    @if (r.cooking_tips?.length > 0) {
      <div class="tip-card">
        <i class="ti ti-bulb tip-icon"></i>
        <div>
          <div class="tip-label">Chef's Tip</div>
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
    :host {
      --bg:         #f4faf4;
      --surface:    #ffffff;
      --surface-2:  #f1f8f1;
      --text:       #1a2a1a;
      --text-muted: #6b7c6b;
      --border:     #d4e6d4;
      --green:      #2e7d32;
      --green-d:    #1b5e20;
      --green-l:    #e8f5e9;
      --amber:      #f57c00;
      --radius:     12px;
      --shadow:     0 1px 3px rgba(0,0,0,0.08);
      --shadow-md:  0 4px 12px rgba(0,0,0,0.1);
      display: block; min-height: 100vh; background: var(--bg);
      font-family: 'Inter', system-ui, sans-serif;
    }
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

    /* Header */
    .header {
      display: flex; align-items: center; justify-content: center;
      padding: 14px 20px; background: var(--surface);
      border-bottom: 1px solid var(--border); position: relative; box-shadow: var(--shadow);
    }
    .back-link {
      position: absolute; left: 20px; display: flex; align-items: center; gap: 5px;
      color: var(--green); text-decoration: none; font-size: 14px; font-weight: 500;
    }
    .back-link:hover { color: var(--green-d); }
    .header-title {
      display: flex; align-items: center; gap: 8px;
      font-size: 17px; font-weight: 700; color: var(--text);
    }
    .header-title i { font-size: 22px; color: var(--green); }

    /* Tabs */
    .tabs {
      display: flex; background: var(--surface);
      border-bottom: 1px solid var(--border); position: sticky; top: 0; z-index: 10;
    }
    .tab {
      flex: 1; display: flex; align-items: center; justify-content: center; gap: 7px;
      padding: 14px 12px; border: none; border-bottom: 3px solid transparent;
      background: transparent; color: var(--text-muted); font-size: 14px;
      font-weight: 500; cursor: pointer; transition: color 0.15s, border-color 0.15s;
    }
    .tab.tab-active { color: var(--green); border-bottom-color: var(--green); font-weight: 600; }
    .tab i { font-size: 18px; }

    /* Pane */
    .pane { max-width: 600px; margin: 0 auto; padding: 20px 16px 100px; }
    @media (min-width: 768px) { .pane { padding-left: 24px; padding-right: 24px; } }
    .mt-2 { margin-top: 8px; }
    .mt-3 { margin-top: 12px; }
    .mt-4 { margin-top: 18px; }

    /* Loading */
    .loading-box {
      display: flex; align-items: center; justify-content: center; gap: 12px;
      padding: 56px 0; color: var(--text-muted); font-size: 14px;
    }
    .spin { font-size: 24px; display: inline-block; animation: spin 0.9s linear infinite; }
    @keyframes spin { to { transform: rotate(360deg); } }

    /* Empty state */
    .empty-state { text-align: center; padding: 56px 24px; }
    .empty-ico { font-size: 52px; display: block; margin: 0 auto 16px; color: var(--text-muted); opacity: 0.3; }
    .empty-state h3 { font-size: 18px; font-weight: 700; color: var(--text); margin-bottom: 8px; }
    .empty-state p  { font-size: 14px; color: var(--text-muted); margin-bottom: 22px; line-height: 1.6; }
    .primary-btn {
      display: inline-flex; align-items: center; background: var(--green); color: #fff;
      border: none; border-radius: var(--radius); padding: 12px 28px;
      font-size: 14px; font-weight: 600; cursor: pointer; text-decoration: none;
      transition: background 0.15s;
    }
    .primary-btn:hover { background: var(--green-d); }

    /* Section label */
    .section-label {
      display: flex; align-items: center; gap: 6px;
      font-size: 11px; font-weight: 700; letter-spacing: 0.7px; text-transform: uppercase;
      color: var(--text-muted);
    }
    .section-label i { color: var(--green); font-size: 14px; }

    /* Recipe cards */
    .card-list { display: flex; flex-direction: column; gap: 10px; }
    .recipe-card {
      display: flex; align-items: center; gap: 14px;
      background: var(--surface); border: 1.5px solid var(--border);
      border-radius: var(--radius); padding: 14px 16px;
      box-shadow: var(--shadow); cursor: pointer;
      transition: transform 0.15s, box-shadow 0.15s, border-color 0.15s;
    }
    .recipe-card:hover { transform: translateY(-2px); box-shadow: var(--shadow-md); border-color: var(--green); }

    .card-icon {
      width: 50px; height: 50px; border-radius: 14px; background: var(--green-l);
      display: flex; align-items: center; justify-content: center;
      flex-shrink: 0; font-size: 24px; color: var(--green);
    }
    .card-body { flex: 1; min-width: 0; }
    .card-name { font-size: 15px; font-weight: 700; color: var(--text); margin-bottom: 5px; }
    .card-meta { display: flex; gap: 12px; font-size: 12px; color: var(--text-muted); flex-wrap: wrap; }
    .card-meta span { display: flex; align-items: center; gap: 4px; }

    .match-badge {
      padding: 5px 11px; border-radius: 100px; font-size: 12px; font-weight: 700;
      color: #fff; background: #94a3b8; flex-shrink: 0;
    }
    .match-badge.match-high { background: var(--green); }
    .match-badge.match-mid  { background: var(--amber); }
    .chevron-ico { font-size: 18px; color: var(--text-muted); flex-shrink: 0; }

    /* Search */
    .search-wrap {
      display: flex; align-items: center; gap: 10px;
      background: var(--surface); border: 1.5px solid var(--border);
      border-radius: var(--radius); padding: 0 16px; box-shadow: var(--shadow);
      transition: border-color 0.15s;
    }
    .search-wrap.search-active { border-color: var(--green); }
    .search-icon { font-size: 20px; color: var(--text-muted); flex-shrink: 0; }
    .search-input {
      flex: 1; border: none; outline: none; background: transparent;
      color: var(--text); font-size: 14px; padding: 15px 0;
    }
    .search-input::placeholder { color: var(--text-muted); }
    .search-clear {
      background: none; border: none; cursor: pointer;
      color: var(--text-muted); font-size: 16px; display: flex; align-items: center; padding: 4px;
    }

    /* Error */
    .error-msg {
      display: flex; align-items: center; gap: 8px;
      background: #fef2f2; border: 1px solid #fecaca; color: #b91c1c;
      border-radius: var(--radius); padding: 12px 14px; font-size: 13px;
    }

    /* Back button */
    .back-detail {
      display: inline-flex; align-items: center; gap: 6px; background: none;
      border: none; color: var(--green); font-size: 14px; font-weight: 500;
      cursor: pointer; padding: 0; margin-bottom: 24px; transition: color 0.15s;
    }
    .back-detail:hover { color: var(--green-d); }

    /* Detail header */
    .detail-header { text-align: center; margin-bottom: 24px; }
    .detail-icon-wrap {
      width: 68px; height: 68px; border-radius: 22px; background: var(--green-l);
      display: flex; align-items: center; justify-content: center; margin: 0 auto 14px;
    }
    .detail-main-icon { font-size: 34px; color: var(--green); }
    .detail-name { font-size: 22px; font-weight: 800; color: var(--text); margin-bottom: 10px; }
    .ai-badge {
      display: inline-flex; align-items: center; gap: 5px; margin-bottom: 10px;
      padding: 4px 12px; border-radius: 100px;
      background: linear-gradient(135deg, #6d28d9, #9333ea);
      color: #fff; font-size: 12px; font-weight: 600;
    }
    .detail-chips { display: flex; justify-content: center; gap: 8px; flex-wrap: wrap; }
    .d-chip {
      display: inline-flex; align-items: center; gap: 5px;
      padding: 5px 12px; border-radius: 100px;
      background: var(--surface-2, #f1f8f1); border: 1px solid var(--border);
      font-size: 12px; font-weight: 500; color: var(--text-muted);
    }
    .d-chip-diff { font-weight: 700; }
    .diff-easy  { background: #e8f5e9; color: #2e7d32; border-color: #c8e6c9; }
    .diff-med   { background: #fff8e1; color: #f57c00; border-color: #ffe082; }
    .diff-hard  { background: #fce4ec; color: #c62828; border-color: #f48fb1; }

    .detail-desc { font-size: 14px; color: var(--text-muted); line-height: 1.65; margin-bottom: 20px; }

    /* Detail sections */
    .d-section { margin-bottom: 24px; }
    .d-section-title {
      display: flex; align-items: center; gap: 8px;
      font-size: 15px; font-weight: 700; color: var(--text);
      margin-bottom: 12px; padding-bottom: 10px; border-bottom: 1px solid var(--border);
    }
    .d-section-title i { color: var(--green); font-size: 17px; }

    /* Nutrition grid */
    .nutr-grid { display: flex; gap: 8px; flex-wrap: wrap; }
    .nutr-card { flex: 1; min-width: 58px; border-radius: 12px; padding: 10px 8px; text-align: center; }
    .nutr-val { font-size: 16px; font-weight: 800; color: var(--text); }
    .nutr-lbl { font-size: 10px; font-weight: 500; color: var(--text-muted); margin-top: 2px; }
    .nutr-cal  { background: #fff8e1; }
    .nutr-pro  { background: #e8f5e9; }
    .nutr-carb { background: #e8f5e9; }
    .nutr-fat  { background: #fff3e0; }
    .nutr-fib  { background: #f1f8e9; }

    /* Ingredients */
    .ing-list { list-style: none; display: flex; flex-direction: column; gap: 7px; }
    .ing-list li {
      font-size: 14px; color: var(--text-muted);
      padding: 9px 12px 9px 24px; position: relative;
      background: var(--surface); border: 1px solid var(--border); border-radius: 8px;
    }
    .ing-list li::before {
      content: '•'; position: absolute; left: 10px;
      color: var(--green); font-weight: 700; font-size: 16px; line-height: 1.2;
    }

    /* Steps */
    .steps-list { list-style: none; display: flex; flex-direction: column; gap: 12px; }
    .steps-list li { display: flex; gap: 12px; align-items: flex-start; }
    .step-num {
      width: 26px; height: 26px; border-radius: 50%; background: var(--green); color: #fff;
      font-size: 12px; font-weight: 800;
      display: flex; align-items: center; justify-content: center; flex-shrink: 0; margin-top: 1px;
    }
    .step-text { font-size: 14px; color: var(--text-muted); line-height: 1.65; }

    /* Tip */
    .tip-card {
      display: flex; gap: 12px; align-items: flex-start;
      background: #fffbeb; border: 1.5px solid #fde68a;
      border-radius: var(--radius); padding: 14px 16px; margin-top: 8px;
    }
    .tip-icon { font-size: 24px; color: #f59e0b; flex-shrink: 0; margin-top: 2px; }
    .tip-label { font-size: 11px; font-weight: 700; color: #92400e; margin-bottom: 4px; }
    .tip-text  { font-size: 14px; color: #78350f; line-height: 1.6; margin-bottom: 4px; }
  `],
})
export class MealsComponent implements OnInit {
  private http = inject(HttpClient);
  auth = inject(AuthService);

  activeTab = signal<'pantry' | 'explore'>('pantry');

  // ── Pantry ────────────────────────────────────────────────────────────────
  pantryItems   = signal<PantryItem[]>([]);
  pantryRecipes = signal<ApiRecipe[]>([]);
  pantryLoading = signal(true);
  pantryDetail  = signal<RecipeDetail | null>(null);

  pantryMatches = computed(() => {
    const names = new Set(this.pantryItems().map(p => p.ingredient_name.toLowerCase()));
    return this.pantryRecipes()
      .map(r => {
        const all  = r.recipe_ingredients.map(ri => ri.ingredient.name);
        const have = all.filter(n => names.has(n.toLowerCase()));
        const pct  = all.length > 0
          ? Math.round((have.length / all.length) * 100)
          : Math.round(r.efficacy_score * 100);
        return { recipe: r, matchPct: pct };
      })
      .sort((a, b) => b.matchPct - a.matchPct);
  });

  // ── Explore ───────────────────────────────────────────────────────────────
  searchQuery  = '';
  searchFocused = false;
  searchLoading = signal(false);
  searchError   = false;
  exploreDetail = signal<RecipeDetail | null>(null);

  readonly defaultExplore = DEFAULT_EXPLORE;

  // ── Lifecycle ────────────────────────────────────────────────────────────
  ngOnInit() {
    if (this.auth.isLoggedIn()) {
      this.loadPantry();
    } else {
      this.pantryLoading.set(false);
    }
  }

  private loadPantry() {
    this.pantryLoading.set(true);
    this.http.get<PantryItem[]>(`${environment.apiUrl}/pantry`)
      .pipe(catchError(() => of([])))
      .subscribe(items => {
        this.pantryItems.set(items);
        if (items.length > 0) {
          this.http.get<ApiRecipe[]>(`${environment.apiUrl}/recipes/from-pantry?limit=20`)
            .pipe(catchError(() => of([])))
            .subscribe(recipes => {
              this.pantryRecipes.set(recipes);
              this.pantryLoading.set(false);
            });
        } else {
          this.pantryLoading.set(false);
        }
      });
  }

  setTab(tab: 'pantry' | 'explore') {
    this.activeTab.set(tab);
    this.pantryDetail.set(null);
    this.exploreDetail.set(null);
    this.searchError = false;
  }

  openPantryDetail(r: ApiRecipe) {
    this.pantryDetail.set(apiToDetail(r));
  }

  fetchAndShowDetail(title: string) {
    this.searchLoading.set(true);
    this.searchError = false;
    this.exploreDetail.set(null);
    this.http
      .get<any>(`${environment.apiUrl}/recipes/generate?q=${encodeURIComponent(title)}`)
      .pipe(catchError(() => of(null)))
      .subscribe(r => {
        if (r) {
          this.exploreDetail.set(genToDetail(r));
        } else {
          this.searchError = true;
        }
        this.searchLoading.set(false);
      });
  }

  doSearch() {
    const q = this.searchQuery.trim();
    if (!q) return;
    this.fetchAndShowDetail(q);
  }

  // Helpers exposed to template
  readonly totalMin  = totalMin;
  readonly diffLabel = diffLabel;
  recipeTime = (r: ApiRecipe) => totalMin(r.prep_time_minutes, r.cook_time_minutes);
  diff       = (r: ApiRecipe) => diffLabel(totalMin(r.prep_time_minutes, r.cook_time_minutes));
}
