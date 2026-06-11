import { Component, signal, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { RouterLink } from '@angular/router';
import { catchError, of } from 'rxjs';
import { environment } from '../../../environments/environment';

type Tab = 'pantry' | 'explore';

interface ClaudeRecipe {
  name: string;
  time: number;
  match: number;
  ingredients: string[];
  steps: string[];
  icon: string;
}

interface ClaudeExploreRecipe {
  name: string;
  time: number;
  servings: number;
  ingredients: string[];
  steps: string[];
  tip: string;
}

const SUGGESTIONS = [
  'Egg curry',
  'Spaghetti carbonara',
  'Chicken stir fry',
  'Dal tadka',
  'Mushroom risotto',
];

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
      <i class="ti ti-chef-hat"></i>
      Smart Recipes
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

    @if (!selectedPantryRecipe()) {

      <div class="pane">

        <!-- Ingredient input -->
        <div class="input-row">
          <div class="input-wrap" [class.input-focused]="inputFocused">
            <i class="ti ti-carrot input-icon"></i>
            <input
              class="text-input"
              [(ngModel)]="pantryInputValue"
              placeholder="Add ingredients — e.g. eggs, garlic, onion"
              (keydown.enter)="addIngredients()"
              (focus)="inputFocused = true"
              (blur)="inputFocused = false">
          </div>
          <button class="add-btn" (click)="addIngredients()">
            <i class="ti ti-plus"></i> Add
          </button>
        </div>

        <!-- Ingredient chips -->
        @if (pantryIngredients().length > 0) {
          <div class="chips">
            @for (ing of pantryIngredients(); track ing) {
              <span class="chip">
                {{ ing }}
                <button class="chip-x" (click)="removeIngredient(ing)" title="Remove">
                  <i class="ti ti-x"></i>
                </button>
              </span>
            }
          </div>
        }

        <!-- Empty state -->
        @if (pantryIngredients().length === 0) {
          <div class="empty-state">
            <i class="ti ti-basket empty-ico"></i>
            <p>Your pantry is empty — add ingredients above to get recipe suggestions.</p>
          </div>
        }

        <!-- Find button (only when pantry has items and no results yet) -->
        @if (pantryIngredients().length > 0 && pantryRecipes().length === 0 && !pantryLoading()) {
          <button class="find-btn" (click)="findRecipes()">
            <i class="ti ti-wand"></i> Find Recipes from My Pantry
          </button>
        }

        <!-- Loading spinner -->
        @if (pantryLoading()) {
          <div class="loading-box">
            <i class="ti ti-loader-2 spin"></i>
            <span>Finding the best recipes for your pantry…</span>
          </div>
        }

        <!-- Recipe results -->
        @if (pantryRecipes().length > 0 && !pantryLoading()) {
          <div class="section-label">
            <i class="ti ti-star"></i> 3 Recipes Based on Your Pantry
          </div>
          <div class="recipe-list">
            @for (r of pantryRecipes(); track r.name) {
              <div class="recipe-card" (click)="selectedPantryRecipe.set(r)">
                <div class="card-icon">
                  <i class="ti ti-{{ r.icon }}"></i>
                </div>
                <div class="card-body">
                  <div class="card-name">{{ r.name }}</div>
                  <div class="card-meta">
                    <span><i class="ti ti-clock"></i> {{ r.time }} min</span>
                  </div>
                </div>
                <span class="match-badge"
                  [class.match-high]="r.match >= 80"
                  [class.match-mid]="r.match >= 50 && r.match < 80">
                  {{ r.match }}%
                </span>
              </div>
            }
          </div>
          <button class="outline-btn mt-3" (click)="pantryRecipes.set([]); findRecipes()">
            <i class="ti ti-refresh"></i> Regenerate
          </button>
        }

      </div>

    } @else {

      <!-- Pantry recipe detail -->
      <div class="pane detail-pane">
        <button class="back-detail" (click)="selectedPantryRecipe.set(null)">
          <i class="ti ti-arrow-left"></i> Back to Results
        </button>

        <div class="detail-header">
          <div class="detail-icon">
            <i class="ti ti-{{ selectedPantryRecipe()!.icon }}"></i>
          </div>
          <h2 class="detail-name">{{ selectedPantryRecipe()!.name }}</h2>
          <div class="detail-chips">
            <span class="detail-chip">
              <i class="ti ti-clock"></i> {{ selectedPantryRecipe()!.time }} min
            </span>
            <span class="detail-chip match-chip">
              {{ selectedPantryRecipe()!.match }}% pantry match
            </span>
          </div>
        </div>

        <section class="detail-section">
          <h3 class="section-title">
            <i class="ti ti-list-details"></i> Ingredients
          </h3>
          <ul class="ing-list">
            @for (ing of selectedPantryRecipe()!.ingredients; track ing) {
              <li>{{ ing }}</li>
            }
          </ul>
        </section>

        <section class="detail-section">
          <h3 class="section-title">
            <i class="ti ti-list-numbers"></i> Instructions
          </h3>
          <ol class="steps-list">
            @for (step of selectedPantryRecipe()!.steps; track $index) {
              <li>
                <span class="step-num">{{ $index + 1 }}</span>
                <span class="step-text">{{ step }}</span>
              </li>
            }
          </ol>
        </section>

      </div>

    }
  }

  <!-- ══ EXPLORE TAB ═════════════════════════════════════════════════════════ -->
  @if (activeTab() === 'explore') {

    @if (!selectedExploreRecipe()) {

      <div class="pane">

        <!-- Search bar -->
        <div class="search-wrap" [class.search-focused]="searchFocused">
          <i class="ti ti-search search-icon"></i>
          <input
            class="search-input"
            [(ngModel)]="exploreQueryValue"
            placeholder="e.g. what is the recipe of egg curry?"
            (keydown.enter)="search(exploreQueryValue)"
            (focus)="searchFocused = true"
            (blur)="searchFocused = false">
        </div>

        <!-- Quick suggestion chips -->
        <div class="suggestions">
          @for (s of suggestions; track s) {
            <button class="suggestion-chip" (click)="search(s)">{{ s }}</button>
          }
        </div>

        <!-- Loading spinner -->
        @if (exploreLoading()) {
          <div class="loading-box">
            <i class="ti ti-loader-2 spin"></i>
            <span>Generating recipe…</span>
          </div>
        }

        <!-- Result card -->
        @if (exploreResult() && !exploreLoading()) {
          <div class="section-label">
            <i class="ti ti-star"></i> Recipe Ready
          </div>
          <div class="recipe-card explore-result-card" (click)="selectedExploreRecipe.set(exploreResult()!)">
            <div class="card-icon">
              <i class="ti ti-chef-hat"></i>
            </div>
            <div class="card-body">
              <div class="card-name">{{ exploreResult()!.name }}</div>
              <div class="card-meta">
                <span><i class="ti ti-clock"></i> {{ exploreResult()!.time }} min</span>
                <span><i class="ti ti-users"></i> {{ exploreResult()!.servings }} servings</span>
              </div>
              <div class="card-hint">Tap to see full recipe →</div>
            </div>
          </div>
        }

      </div>

    } @else {

      <!-- Explore recipe detail -->
      <div class="pane detail-pane">
        <button class="back-detail" (click)="selectedExploreRecipe.set(null)">
          <i class="ti ti-arrow-left"></i> Back to Search
        </button>

        <div class="detail-header">
          <div class="detail-icon">
            <i class="ti ti-chef-hat"></i>
          </div>
          <h2 class="detail-name">{{ selectedExploreRecipe()!.name }}</h2>
          <div class="detail-chips">
            <span class="detail-chip">
              <i class="ti ti-clock"></i> {{ selectedExploreRecipe()!.time }} min
            </span>
            <span class="detail-chip">
              <i class="ti ti-users"></i> {{ selectedExploreRecipe()!.servings }} servings
            </span>
          </div>
        </div>

        <section class="detail-section">
          <h3 class="section-title">
            <i class="ti ti-list-details"></i> Ingredients
          </h3>
          <ul class="ing-list">
            @for (ing of selectedExploreRecipe()!.ingredients; track ing) {
              <li>{{ ing }}</li>
            }
          </ul>
        </section>

        <section class="detail-section">
          <h3 class="section-title">
            <i class="ti ti-list-numbers"></i> Instructions
          </h3>
          <ol class="steps-list">
            @for (step of selectedExploreRecipe()!.steps; track $index) {
              <li>
                <span class="step-num">{{ $index + 1 }}</span>
                <span class="step-text">{{ step }}</span>
              </li>
            }
          </ol>
        </section>

        @if (selectedExploreRecipe()!.tip) {
          <div class="tip-card">
            <i class="ti ti-bulb tip-icon"></i>
            <div>
              <div class="tip-label">Chef's Tip</div>
              <div class="tip-text">{{ selectedExploreRecipe()!.tip }}</div>
            </div>
          </div>
        }

      </div>

    }
  }

</div>
  `,
  styles: [`
    /* ── CSS variables (light + dark) ──────────────────────────────────── */
    :host {
      --bg:           #f8fafc;
      --surface:      #ffffff;
      --surface-2:    #f1f5f9;
      --text:         #0f172a;
      --text-muted:   #64748b;
      --border:       #e2e8f0;
      --info:         #0ea5e9;
      --info-light:   #e0f2fe;
      --info-dark:    #0284c7;
      --green:        #16a34a;
      --green-light:  #dcfce7;
      --amber:        #f59e0b;
      --radius:       12px;
      --shadow:       0 1px 3px rgba(0,0,0,0.08), 0 1px 2px rgba(0,0,0,0.05);
      --shadow-md:    0 4px 6px rgba(0,0,0,0.07), 0 2px 4px rgba(0,0,0,0.05);
      display: block;
      min-height: 100vh;
      background: var(--bg);
      font-family: 'Inter', system-ui, sans-serif;
    }

    @media (prefers-color-scheme: dark) {
      :host {
        --bg:         #0f172a;
        --surface:    #1e293b;
        --surface-2:  #263548;
        --text:       #f1f5f9;
        --text-muted: #94a3b8;
        --border:     #334155;
        --info-light: #0c4a6e;
        --info-dark:  #7dd3fc;
        --green-light:#052e16;
      }
    }

    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

    /* ── Header ─────────────────────────────────────────────────────────── */
    .header {
      display: flex; align-items: center; justify-content: center;
      padding: 14px 20px; background: var(--surface);
      border-bottom: 1px solid var(--border); position: relative;
      box-shadow: var(--shadow);
    }
    .back-link {
      position: absolute; left: 20px;
      display: flex; align-items: center; gap: 5px;
      color: var(--info); text-decoration: none;
      font-size: 14px; font-weight: 500; transition: color 0.15s;
    }
    .back-link:hover { color: var(--info-dark); }
    .header-title {
      display: flex; align-items: center; gap: 8px;
      font-size: 17px; font-weight: 700; color: var(--text);
    }
    .header-title i { font-size: 22px; color: var(--info); }

    /* ── Tabs ────────────────────────────────────────────────────────────── */
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

    /* ── Pane ────────────────────────────────────────────────────────────── */
    .pane {
      max-width: 600px; margin: 0 auto;
      padding: 20px 16px 100px;
    }
    .detail-pane {
      max-width: 600px; margin: 0 auto;
      padding: 16px 16px 100px;
      animation: fadeIn 0.2s ease-out;
    }
    @keyframes fadeIn {
      from { opacity: 0; transform: translateY(6px); }
      to   { opacity: 1; transform: translateY(0); }
    }

    /* ── Ingredient input ────────────────────────────────────────────────── */
    .input-row { display: flex; gap: 10px; margin-bottom: 14px; }
    .input-wrap {
      flex: 1; display: flex; align-items: center; gap: 10px;
      background: var(--surface); border: 1.5px solid var(--border);
      border-radius: var(--radius); padding: 0 14px;
      box-shadow: var(--shadow); transition: border-color 0.15s;
    }
    .input-wrap.input-focused { border-color: var(--info); }
    .input-icon { font-size: 18px; color: var(--text-muted); flex-shrink: 0; }
    .text-input {
      flex: 1; border: none; outline: none; background: transparent;
      color: var(--text); font-size: 14px; padding: 13px 0;
    }
    .text-input::placeholder { color: var(--text-muted); }

    .add-btn {
      display: flex; align-items: center; gap: 5px;
      background: var(--info); color: #fff; border: none;
      border-radius: var(--radius); padding: 0 20px;
      font-size: 14px; font-weight: 600; cursor: pointer; white-space: nowrap;
      box-shadow: var(--shadow); transition: background 0.15s;
    }
    .add-btn:hover { background: var(--info-dark); }

    /* ── Chips ───────────────────────────────────────────────────────────── */
    .chips { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 18px; }
    .chip {
      display: inline-flex; align-items: center; gap: 6px;
      background: var(--info-light); color: var(--info-dark);
      border-radius: 100px; padding: 6px 10px 6px 14px;
      font-size: 13px; font-weight: 500;
    }
    .chip-x {
      display: flex; align-items: center;
      background: none; border: none; color: var(--info-dark); cursor: pointer;
      padding: 2px; font-size: 14px; opacity: 0.65; transition: opacity 0.15s;
    }
    .chip-x:hover { opacity: 1; }

    /* ── Empty state ─────────────────────────────────────────────────────── */
    .empty-state {
      text-align: center; padding: 52px 24px; color: var(--text-muted);
    }
    .empty-ico { font-size: 52px; display: block; margin-bottom: 14px; opacity: 0.35; }
    .empty-state p { font-size: 14px; line-height: 1.7; }

    /* ── Find button ─────────────────────────────────────────────────────── */
    .find-btn {
      width: 100%; display: flex; align-items: center; justify-content: center; gap: 8px;
      background: var(--info); color: #fff; border: none;
      border-radius: var(--radius); padding: 15px;
      font-size: 15px; font-weight: 600; cursor: pointer;
      box-shadow: var(--shadow-md); transition: background 0.15s;
      margin-top: 4px;
    }
    .find-btn:hover { background: var(--info-dark); }

    /* ── Loading ─────────────────────────────────────────────────────────── */
    .loading-box {
      display: flex; align-items: center; justify-content: center; gap: 12px;
      padding: 36px 0; color: var(--text-muted); font-size: 14px;
    }
    .spin { font-size: 26px; display: inline-block; animation: spin 0.9s linear infinite; }
    @keyframes spin { to { transform: rotate(360deg); } }

    /* ── Section label ───────────────────────────────────────────────────── */
    .section-label {
      display: flex; align-items: center; gap: 6px;
      font-size: 11px; font-weight: 700; letter-spacing: 0.7px;
      text-transform: uppercase; color: var(--text-muted);
      margin: 18px 0 10px;
    }
    .section-label i { color: var(--info); font-size: 14px; }

    /* ── Recipe cards ────────────────────────────────────────────────────── */
    .recipe-list { display: flex; flex-direction: column; gap: 10px; }
    .recipe-card {
      display: flex; align-items: center; gap: 14px;
      background: var(--surface); border: 1.5px solid var(--border);
      border-radius: var(--radius); padding: 14px 16px;
      box-shadow: var(--shadow); cursor: pointer;
      transition: transform 0.16s, box-shadow 0.16s, border-color 0.16s;
    }
    .recipe-card:hover {
      transform: translateY(-2px);
      box-shadow: var(--shadow-md);
      border-color: var(--info);
    }

    .card-icon {
      width: 50px; height: 50px; border-radius: 14px;
      background: var(--info-light); display: flex; align-items: center; justify-content: center;
      flex-shrink: 0; font-size: 26px; color: var(--info-dark);
    }
    .card-body { flex: 1; min-width: 0; }
    .card-name {
      font-size: 15px; font-weight: 700; color: var(--text);
      margin-bottom: 5px;
      white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
    }
    .card-meta {
      display: flex; gap: 14px; font-size: 12px; color: var(--text-muted);
      align-items: center;
    }
    .card-meta span { display: flex; align-items: center; gap: 4px; }
    .card-hint { font-size: 12px; color: var(--info); margin-top: 5px; }

    /* match badge */
    .match-badge {
      padding: 5px 11px; border-radius: 100px;
      font-size: 12px; font-weight: 700; color: #fff;
      background: #94a3b8; flex-shrink: 0;
    }
    .match-badge.match-high { background: var(--green); }
    .match-badge.match-mid  { background: var(--amber); }

    .outline-btn {
      display: flex; align-items: center; justify-content: center; gap: 7px;
      width: 100%; background: var(--surface);
      border: 1.5px solid var(--border); color: var(--text-muted);
      border-radius: var(--radius); padding: 12px;
      font-size: 14px; font-weight: 500; cursor: pointer;
      transition: border-color 0.15s, color 0.15s;
    }
    .outline-btn:hover { border-color: var(--info); color: var(--info); }
    .mt-3 { margin-top: 12px; }

    /* ── Explore ─────────────────────────────────────────────────────────── */
    .search-wrap {
      display: flex; align-items: center; gap: 10px;
      background: var(--surface); border: 1.5px solid var(--border);
      border-radius: var(--radius); padding: 0 16px;
      box-shadow: var(--shadow); margin-bottom: 14px;
      transition: border-color 0.15s;
    }
    .search-wrap.search-focused { border-color: var(--info); }
    .search-icon { font-size: 20px; color: var(--text-muted); flex-shrink: 0; }
    .search-input {
      flex: 1; border: none; outline: none; background: transparent;
      color: var(--text); font-size: 14px; padding: 15px 0;
    }
    .search-input::placeholder { color: var(--text-muted); }

    .suggestions { display: flex; gap: 8px; flex-wrap: wrap; }
    .suggestion-chip {
      padding: 7px 15px; border-radius: 100px;
      background: var(--surface); border: 1.5px solid var(--border);
      color: var(--text-muted); font-size: 13px; font-weight: 500; cursor: pointer;
      transition: background 0.15s, border-color 0.15s, color 0.15s;
    }
    .suggestion-chip:hover {
      background: var(--info-light);
      border-color: var(--info);
      color: var(--info-dark);
    }

    .explore-result-card { margin-top: 4px; }

    /* ── Detail view ─────────────────────────────────────────────────────── */
    .back-detail {
      display: inline-flex; align-items: center; gap: 6px;
      background: none; border: none; color: var(--info);
      font-size: 14px; font-weight: 500; cursor: pointer; padding: 0;
      margin-bottom: 24px; transition: color 0.15s;
    }
    .back-detail:hover { color: var(--info-dark); }

    .detail-header { text-align: center; margin-bottom: 28px; }
    .detail-icon {
      width: 68px; height: 68px; border-radius: 22px;
      background: var(--info-light);
      display: flex; align-items: center; justify-content: center;
      margin: 0 auto 14px; font-size: 34px; color: var(--info-dark);
    }
    .detail-name { font-size: 22px; font-weight: 800; color: var(--text); margin-bottom: 12px; }
    .detail-chips { display: flex; justify-content: center; gap: 8px; flex-wrap: wrap; }
    .detail-chip {
      display: inline-flex; align-items: center; gap: 5px;
      padding: 5px 13px; border-radius: 100px;
      background: var(--surface-2); border: 1px solid var(--border);
      font-size: 12px; font-weight: 500; color: var(--text-muted);
    }
    .match-chip { background: var(--green-light); color: var(--green); border-color: transparent; }

    .detail-section { margin-bottom: 24px; }
    .section-title {
      display: flex; align-items: center; gap: 8px;
      font-size: 15px; font-weight: 700; color: var(--text);
      margin-bottom: 12px; padding-bottom: 10px;
      border-bottom: 1px solid var(--border);
    }
    .section-title i { color: var(--info); font-size: 17px; }

    /* Ingredients */
    .ing-list { list-style: none; display: flex; flex-direction: column; gap: 7px; }
    .ing-list li {
      font-size: 14px; color: var(--text-muted);
      padding: 9px 12px 9px 26px; position: relative;
      background: var(--surface); border: 1px solid var(--border);
      border-radius: 8px;
    }
    .ing-list li::before {
      content: '•'; position: absolute; left: 12px;
      color: var(--info); font-weight: 700; font-size: 16px; line-height: 1.2;
    }

    /* Steps */
    .steps-list { list-style: none; display: flex; flex-direction: column; gap: 12px; }
    .steps-list li {
      display: flex; gap: 12px; align-items: flex-start;
    }
    .step-num {
      width: 26px; height: 26px; border-radius: 50%;
      background: var(--info); color: #fff;
      font-size: 12px; font-weight: 800;
      display: flex; align-items: center; justify-content: center;
      flex-shrink: 0; margin-top: 1px;
    }
    .step-text { font-size: 14px; color: var(--text-muted); line-height: 1.65; }

    /* Chef's tip */
    .tip-card {
      display: flex; gap: 12px; align-items: flex-start;
      background: #fffbeb; border: 1.5px solid #fde68a;
      border-radius: var(--radius); padding: 14px 16px; margin-top: 4px;
    }
    .tip-icon { font-size: 24px; color: #f59e0b; flex-shrink: 0; margin-top: 1px; }
    .tip-label { font-size: 11px; font-weight: 700; color: #92400e; margin-bottom: 4px; letter-spacing: 0.3px; }
    .tip-text { font-size: 14px; color: #78350f; line-height: 1.6; }

    /* ── Responsive tweaks ───────────────────────────────────────────────── */
    @media (min-width: 768px) {
      .pane, .detail-pane { padding-left: 24px; padding-right: 24px; }
    }
  `],
})
export class MealsComponent {
  private http = inject(HttpClient);

  activeTab = signal<Tab>('pantry');

  // Pantry tab state
  pantryInputValue = '';
  inputFocused = false;
  pantryIngredients = signal<string[]>([]);
  pantryLoading = signal(false);
  pantryRecipes = signal<ClaudeRecipe[]>([]);
  selectedPantryRecipe = signal<ClaudeRecipe | null>(null);

  // Explore tab state
  exploreQueryValue = '';
  searchFocused = false;
  exploreLoading = signal(false);
  exploreResult = signal<ClaudeExploreRecipe | null>(null);
  selectedExploreRecipe = signal<ClaudeExploreRecipe | null>(null);

  readonly suggestions = SUGGESTIONS;

  setTab(tab: Tab) {
    this.activeTab.set(tab);
  }

  addIngredients() {
    const parts = this.pantryInputValue
      .split(',')
      .map(s => s.trim())
      .filter(Boolean);
    if (!parts.length) return;
    const existing = new Set(this.pantryIngredients().map(i => i.toLowerCase()));
    const toAdd = parts.filter(p => !existing.has(p.toLowerCase()));
    this.pantryIngredients.update(list => [...list, ...toAdd]);
    this.pantryInputValue = '';
    this.pantryRecipes.set([]);
  }

  removeIngredient(name: string) {
    this.pantryIngredients.update(list => list.filter(i => i !== name));
    this.pantryRecipes.set([]);
  }

  findRecipes() {
    if (!this.pantryIngredients().length) return;
    this.pantryLoading.set(true);
    this.http
      .post<ClaudeRecipe[]>(`${environment.apiUrl}/recipes/claude-pantry`, {
        ingredients: this.pantryIngredients(),
      })
      .pipe(catchError(() => of([])))
      .subscribe(recipes => {
        this.pantryRecipes.set(Array.isArray(recipes) ? recipes.slice(0, 3) : []);
        this.pantryLoading.set(false);
      });
  }

  search(q: string) {
    if (!q.trim()) return;
    this.exploreQueryValue = q;
    this.exploreLoading.set(true);
    this.exploreResult.set(null);
    this.selectedExploreRecipe.set(null);
    this.http
      .get<ClaudeExploreRecipe>(
        `${environment.apiUrl}/recipes/claude-explore?q=${encodeURIComponent(q)}`
      )
      .pipe(catchError(() => of(null)))
      .subscribe(recipe => {
        this.exploreResult.set(recipe);
        this.exploreLoading.set(false);
      });
  }
}
