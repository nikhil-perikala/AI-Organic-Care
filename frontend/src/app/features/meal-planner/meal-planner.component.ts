import {
  Component, signal, computed, inject,
  ElementRef, ViewChild, AfterViewInit, effect,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { catchError, of } from 'rxjs';
import { environment } from '../../../environments/environment';

// ── Types & constants ──────────────────────────────────────────────────────────

type MealType = 'breakfast' | 'lunch' | 'dinner';

interface Meal {
  name: string;
  kcal: number;
  time: string;
  desc: string;
  benefit: string;
}

type DayMeals = { [K in MealType]: Meal | null };
type Grid     = { [day: string]: DayMeals };

const DAYS       = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const;
const MEAL_TYPES = ['breakfast', 'lunch', 'dinner'] as const;

const QUICK_PICKS: Record<MealType, string[]> = {
  breakfast: ['Oat porridge', 'Avocado toast', 'Scrambled eggs', 'Greek yogurt', 'Banana smoothie', 'Pancakes'],
  lunch:     ['Grilled chicken', 'Lentil soup', 'Tuna wrap', 'Quinoa salad', 'Veggie stir fry', 'Club sandwich'],
  dinner:    ['Pasta carbonara', 'Egg curry', 'Dal tadka', 'Salmon fillet', 'Mushroom risotto', 'Chicken stir fry'],
};

const MEAL_COLOR: Record<MealType, string> = {
  breakfast: '#5DCAA5',
  lunch:     '#EF9F27',
  dinner:    '#AFA9EC',
};
const MEAL_LABEL: Record<MealType, string> = {
  breakfast: 'Break.',
  lunch:     'Lunch',
  dinner:    'Dinner',
};

function emptyGrid(): Grid {
  const g: Grid = {};
  for (const d of DAYS) g[d] = { breakfast: null, lunch: null, dinner: null };
  return g;
}

function weekRange(): string {
  const now = new Date();
  const dow = now.getDay();
  const mon = new Date(now);
  mon.setDate(now.getDate() - (dow === 0 ? 6 : dow - 1));
  const sun = new Date(mon);
  sun.setDate(mon.getDate() + 6);
  const fmt = (d: Date) => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  return `${fmt(mon)} – ${fmt(sun)}, ${sun.getFullYear()}`;
}

// ── Component ──────────────────────────────────────────────────────────────────

@Component({
  selector: 'app-meal-planner',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
<div class="mp-root">

  <!-- ── Top bar ──────────────────────────────────────────────────────────── -->
  <header class="topbar">
    <div class="topbar-left">
      <h1 class="mp-title"><i class="ti ti-plant"></i> Weekly Meal Planner</h1>
      <p class="mp-sub">{{ weekLabel }} &nbsp;<span class="streak-pill"><i class="ti ti-flame"></i> {{ streak }}-day streak</span></p>
    </div>
  </header>

  <!-- ── Donut + legend row ─────────────────────────────────────────────────── -->
  <div class="chart-row">
    <canvas #donutCanvas class="donut-canvas"></canvas>
    <div class="legend-col">
      <div class="leg-item">
        <span class="leg-dot" style="background:#5DCAA5"></span>
        <span class="leg-label">Breakfast</span>
        <span class="leg-count">{{ bfCount() }}/7</span>
      </div>
      <div class="leg-item">
        <span class="leg-dot" style="background:#EF9F27"></span>
        <span class="leg-label">Lunch</span>
        <span class="leg-count">{{ luCount() }}/7</span>
      </div>
      <div class="leg-item">
        <span class="leg-dot" style="background:#AFA9EC"></span>
        <span class="leg-label">Dinner</span>
        <span class="leg-count">{{ diCount() }}/7</span>
      </div>
      <div class="leg-actions">
        <button class="btn-autofill" (click)="autoFill()" [disabled]="isAutoFilling()">
          @if (isAutoFilling()) {
            <i class="ti ti-loader-2 spin"></i> Filling…
          } @else {
            <i class="ti ti-wand"></i> Auto-fill week
          }
        </button>
        <button class="btn-clearall" (click)="clearAll()">
          <i class="ti ti-trash"></i> Clear all
        </button>
      </div>
    </div>
  </div>

  <!-- ── Grid ───────────────────────────────────────────────────────────────── -->
  <div class="grid-scroll">
    <div class="grid-inner">

      <!-- Day headers -->
      <div class="g-row g-head-row">
        <div class="g-stub"></div>
        @for (d of DAYS; track d) {
          <div class="g-day-head" [class.g-today-head]="isToday(d)">
            <span class="day-name">{{ d }}</span>
            @if (isToday(d)) { <span class="today-badge-sm">Today</span> }
          </div>
        }
      </div>

      <!-- Meal rows -->
      @for (meal of MEAL_TYPES; track meal) {
        <div class="g-row">
          <div class="g-row-label" [style.color]="MEAL_COLOR[meal]">{{ MEAL_LABEL[meal] }}</div>
          @for (d of DAYS; track d) {
            <div class="g-cell">
              @if (isLoading(d, meal)) {
                <div class="pill pill-loading" [attr.data-meal]="meal">
                  <i class="ti ti-loader-2 spin"></i>
                </div>
              } @else if (getSlot(d, meal)) {
                <div class="pill pill-filled" [attr.data-meal]="meal"
                     [class.pill-today]="isToday(d)"
                     (click)="openFilledModal(d, meal)">
                  <span class="pill-name">{{ getSlot(d, meal)!.name }}</span>
                  <span class="pill-kcal">{{ getSlot(d, meal)!.kcal }} kcal</span>
                </div>
              } @else {
                <div class="pill pill-empty"
                     [class.pill-empty-today]="isToday(d)"
                     (click)="openSearch(d, meal)">
                  <i class="ti ti-plus"></i>
                </div>
              }
            </div>
          }
        </div>
      }

    </div>
  </div>

  <!-- ── Stats ──────────────────────────────────────────────────────────────── -->
  <div class="stats-row">

    <div class="stat-card">
      <div class="stat-ico-wrap" style="background:#f0faf7"><i class="ti ti-flame" style="color:#5DCAA5"></i></div>
      <div class="stat-body">
        <div class="stat-lbl">Avg Daily Calories</div>
        <div class="stat-val">{{ avgCalories() | number:'1.0-0' }} <span class="stat-unit">kcal</span></div>
        <div class="stat-sub">Goal: 2,000 kcal</div>
        <div class="stat-track"><div class="stat-fill" style="background:#5DCAA5" [style.width.%]="Math.min(100, avgCalories() / 20)"></div></div>
      </div>
    </div>

    <div class="stat-card">
      <div class="stat-ico-wrap" style="background:#f4f2fd"><i class="ti ti-calendar-check" style="color:#AFA9EC"></i></div>
      <div class="stat-body">
        <div class="stat-lbl">Meals Planned</div>
        <div class="stat-val">{{ totalFilled() }} <span class="stat-unit">/ 21</span></div>
        <div class="stat-sub">{{ 21 - totalFilled() }} slots remaining</div>
        <div class="stat-track"><div class="stat-fill" style="background:#AFA9EC" [style.width.%]="totalFilled() / 21 * 100"></div></div>
      </div>
    </div>

    <div class="stat-card">
      <div class="stat-ico-wrap" style="background:#f0fdf4"><i class="ti ti-chef-hat" style="color:#22c55e"></i></div>
      <div class="stat-body">
        <div class="stat-lbl">Unique Recipes</div>
        <div class="stat-val">{{ uniqueRecipes() }} <span class="stat-unit">recipes</span></div>
        <div class="stat-sub">of {{ totalFilled() }} meals planned</div>
        <div class="stat-track"><div class="stat-fill" style="background:#22c55e" [style.width.%]="totalFilled() > 0 ? uniqueRecipes() / totalFilled() * 100 : 0"></div></div>
      </div>
    </div>

  </div>

  <!-- ── Search / add modal ─────────────────────────────────────────────────── -->
  @if (activeSlot()) {
    <div class="overlay" (click)="closeModal()">
      <div class="modal-box" (click)="$event.stopPropagation()">

        <div class="modal-hdr">
          <div class="modal-hdr-text">
            Add <b [style.color]="MEAL_COLOR[activeSlot()!.meal]">{{ activeSlot()!.meal }}</b>
            for <b>{{ activeSlot()!.day }}</b>
            @if (isToday(activeSlot()!.day)) {
              <span class="today-badge-modal">Today</span>
            }
          </div>
        </div>

        <div class="search-row">
          <i class="ti ti-search search-ico"></i>
          <input class="search-inp"
            [(ngModel)]="searchQuery"
            placeholder="Search or describe a meal…"
            (keydown.enter)="doSearch()"
            autofocus>
          <button class="search-btn" (click)="doSearch()" [disabled]="isSearching()">
            @if (isSearching()) { <i class="ti ti-loader-2 spin"></i> }
            @else { Search }
          </button>
        </div>

        <!-- Quick picks (type-specific) -->
        <div class="chips">
          @for (q of QUICK_PICKS[activeSlot()!.meal]; track q) {
            <button class="chip" (click)="quickPick(q)">{{ q }}</button>
          }
        </div>

        <!-- Results -->
        @if (isSearching()) {
          <div class="sg-loading">
            <i class="ti ti-loader-2 spin"></i> Finding meals…
          </div>
        } @else if (searchError()) {
          <p class="search-error"><i class="ti ti-alert-circle"></i> {{ searchError() }}</p>
        } @else if (suggestions().length > 0) {
          <div class="sg-grid">
            @for (s of suggestions(); track s.name) {
              <div class="sg-card">
                <div class="sg-name">{{ s.name }}</div>
                <div class="sg-meta">
                  <span><i class="ti ti-flame"></i> {{ s.kcal }} kcal</span>
                  <span><i class="ti ti-clock"></i> {{ s.time }}</span>
                </div>
                <div class="sg-desc">{{ s.desc }}</div>
                @if (s.benefit) {
                  <div class="sg-benefit"><i class="ti ti-leaf"></i> {{ s.benefit }}</div>
                }
                <button class="sg-add-btn"
                        [style.background]="MEAL_COLOR[activeSlot()!.meal]"
                        (click)="selectSuggestion(s)">
                  Add
                </button>
              </div>
            }
          </div>
        } @else if (hasSearched()) {
          <p class="sg-empty">No results. Try a different search.</p>
        }

        <button class="cancel-btn" (click)="closeModal()">Cancel</button>
      </div>
    </div>
  }

  <!-- ── Filled-cell detail modal ───────────────────────────────────────────── -->
  @if (filledSlot()) {
    <div class="overlay" (click)="closeModal()">
      <div class="modal-box modal-sm" (click)="$event.stopPropagation()">

        <div class="modal-hdr">
          <div class="modal-hdr-text">
            <b>{{ getSlot(filledSlot()!.day, filledSlot()!.meal)?.name }}</b>
            @if (isToday(filledSlot()!.day)) {
              <span class="today-badge-modal">Today</span>
            }
          </div>
        </div>

        <div class="detail-meta-row">
          <span class="detail-tag" [style.background]="MEAL_COLOR[filledSlot()!.meal] + '22'" [style.color]="MEAL_COLOR[filledSlot()!.meal]">
            {{ filledSlot()!.day }} · {{ MEAL_LABEL[filledSlot()!.meal] }}
          </span>
          <span class="detail-tag detail-tag-muted">
            <i class="ti ti-flame"></i> {{ getSlot(filledSlot()!.day, filledSlot()!.meal)?.kcal }} kcal
          </span>
          <span class="detail-tag detail-tag-muted">
            <i class="ti ti-clock"></i> {{ getSlot(filledSlot()!.day, filledSlot()!.meal)?.time }}
          </span>
        </div>

        @if (getSlot(filledSlot()!.day, filledSlot()!.meal)?.benefit) {
          <div class="benefit-card">
            <i class="ti ti-leaf benefit-ico"></i>
            <div>
              <div class="benefit-label">Benefits</div>
              <div class="benefit-text">{{ getSlot(filledSlot()!.day, filledSlot()!.meal)?.benefit }}</div>
            </div>
          </div>
        }

        <div class="filled-actions">
          <button class="btn-replace" (click)="replaceSlot()"><i class="ti ti-refresh"></i> Replace</button>
          <button class="btn-remove"  (click)="removeSlot()"><i class="ti ti-trash"></i> Remove</button>
        </div>

        <button class="cancel-btn" (click)="closeModal()">Cancel</button>
      </div>
    </div>
  }

</div>
  `,
  styles: [`
    :host {
      --teal:   #5DCAA5;
      --amber:  #EF9F27;
      --purple: #AFA9EC;
      --empty:  #D3D1C7;
      --bg:     #f5f7f5;
      --surface:#ffffff;
      --border: #e4ece4;
      --text:   #1a2a1a;
      --muted:  #6b7c6b;
      --radius: 10px;
      display: block;
      font-family: 'Inter', system-ui, -apple-system, sans-serif;
    }
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

    .mp-root {
      position: relative;
      background: var(--bg);
      padding: 22px 20px 80px;
      max-width: 1120px;
      margin: 0 auto;
      min-height: 100vh;
    }

    /* ── Top bar ── */
    .topbar { margin-bottom: 20px; }
    .mp-title {
      font-size: 19px; font-weight: 800; color: var(--text);
      display: flex; align-items: center; gap: 8px; margin-bottom: 4px;
    }
    .mp-title i { color: var(--teal); font-size: 21px; }
    .mp-sub { font-size: 13px; color: var(--muted); display: flex; align-items: center; gap: 10px; }
    .streak-pill {
      display: inline-flex; align-items: center; gap: 5px;
      background: #fff7ed; border: 1.5px solid #fed7aa;
      border-radius: 100px; padding: 3px 11px;
      font-size: 12px; font-weight: 700; color: #b45309;
    }

    /* ── Chart row ── */
    .chart-row {
      display: flex; align-items: center; gap: 28px;
      background: var(--surface); border: 1.5px solid var(--border);
      border-radius: 16px; padding: 20px 24px;
      margin-bottom: 20px;
    }
    .donut-canvas { display: block; flex-shrink: 0; }
    .legend-col { display: flex; flex-direction: column; gap: 10px; }
    .leg-item { display: flex; align-items: center; gap: 9px; font-size: 13px; }
    .leg-dot { width: 10px; height: 10px; border-radius: 50%; flex-shrink: 0; }
    .leg-label { color: var(--text); font-weight: 500; flex: 1; }
    .leg-count { font-size: 12px; font-weight: 700; color: var(--muted); min-width: 28px; text-align: right; }
    .leg-actions { display: flex; flex-direction: column; gap: 8px; margin-top: 6px; }

    .btn-autofill, .btn-clearall {
      display: inline-flex; align-items: center; gap: 7px;
      border: none; border-radius: var(--radius); padding: 10px 16px;
      font-size: 13px; font-weight: 600; cursor: pointer;
      transition: opacity 0.15s, background 0.15s; font-family: inherit;
    }
    .btn-autofill { background: var(--teal); color: #fff; }
    .btn-autofill:not(:disabled):hover { opacity: 0.88; }
    .btn-autofill:disabled { opacity: 0.6; cursor: not-allowed; }
    .btn-clearall { background: var(--bg); color: var(--muted); border: 1.5px solid var(--border); }
    .btn-clearall:hover { background: #fef2f2; color: #e11d48; border-color: #fecaca; }

    /* ── Grid ── */
    .grid-scroll { overflow-x: auto; -webkit-overflow-scrolling: touch; margin-bottom: 20px; }
    .grid-inner  { min-width: 580px; }

    .g-row {
      display: grid;
      grid-template-columns: 52px repeat(7, 1fr);
      gap: 5px; margin-bottom: 5px;
    }
    .g-stub { /* corner placeholder */ }

    .g-day-head {
      display: flex; flex-direction: column; align-items: center; gap: 3px;
      padding: 6px 2px; border-radius: 8px;
    }
    .day-name {
      font-size: 11px; font-weight: 700; color: var(--muted);
      text-transform: uppercase; letter-spacing: 0.6px;
    }
    .g-today-head { background: #eaf9f4; }
    .g-today-head .day-name { color: var(--teal); }

    .today-badge-sm {
      font-size: 9px; font-weight: 700; color: #fff;
      background: var(--teal); border-radius: 100px;
      padding: 1px 6px; letter-spacing: 0.2px; white-space: nowrap;
    }

    .g-row-label {
      font-size: 10px; font-weight: 800; text-transform: uppercase;
      letter-spacing: 0.5px; display: flex; align-items: center;
    }
    .g-cell { display: flex; }

    /* ── Pills ── */
    .pill {
      flex: 1; border-radius: 9px; min-height: 68px;
      display: flex; flex-direction: column; align-items: center;
      justify-content: center; cursor: pointer;
      transition: transform 0.1s; padding: 7px 5px; text-align: center;
    }
    .pill:hover { transform: translateY(-1px); }

    .pill-empty {
      border: 2px dashed var(--border); background: var(--surface); color: #c5d1c5;
    }
    .pill-empty:hover { border-color: var(--teal); color: var(--teal); }
    .pill-empty i { font-size: 18px; }
    .pill-empty-today { border-color: var(--teal); border-style: dashed; }

    /* Filled pills */
    .pill-filled { border: 1.5px solid transparent; }
    .pill-filled[data-meal="breakfast"] { background: #e8f9f4; border-color: #9de8cd; color: #10695a; }
    .pill-filled[data-meal="lunch"]     { background: #fef6e6; border-color: #f9d88a; color: #8c5a00; }
    .pill-filled[data-meal="dinner"]    { background: #f2f1fc; border-color: #ccc9f3; color: #5048a8; }
    .pill-filled:hover { opacity: 0.82; }

    /* Today's filled pills — stronger border */
    .pill-filled.pill-today[data-meal="breakfast"] { border-color: var(--teal); border-width: 2px; }
    .pill-filled.pill-today[data-meal="lunch"]     { border-color: var(--amber); border-width: 2px; }
    .pill-filled.pill-today[data-meal="dinner"]    { border-color: var(--purple); border-width: 2px; }

    .pill-name {
      font-size: 10.5px; font-weight: 700; line-height: 1.3;
      display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical;
      overflow: hidden; width: 100%; margin-bottom: 3px;
    }
    .pill-kcal { font-size: 9.5px; opacity: 0.75; display: block; }

    /* Loading */
    .pill-loading { border: 1.5px solid transparent; animation: pulse 1s ease-in-out infinite; }
    .pill-loading[data-meal="breakfast"] { background: #e8f9f4; border-color: #9de8cd; color: var(--teal); }
    .pill-loading[data-meal="lunch"]     { background: #fef6e6; border-color: #f9d88a; color: var(--amber); }
    .pill-loading[data-meal="dinner"]    { background: #f2f1fc; border-color: #ccc9f3; color: var(--purple); }
    .pill-loading i { font-size: 18px; }

    @keyframes pulse { 0%,100% { opacity:1; } 50% { opacity:.3; } }

    /* ── Stats ── */
    .stats-row { display: grid; grid-template-columns: repeat(3,1fr); gap: 12px; }
    @media (max-width: 560px) { .stats-row { grid-template-columns:1fr; } }

    .stat-card {
      background: var(--surface); border: 1.5px solid var(--border);
      border-radius: var(--radius); padding: 14px 16px;
      display: flex; gap: 14px; align-items: flex-start;
    }
    .stat-ico-wrap {
      width: 38px; height: 38px; border-radius: 10px; flex-shrink: 0;
      display: flex; align-items: center; justify-content: center; font-size: 18px;
    }
    .stat-body { flex: 1; min-width: 0; }
    .stat-lbl {
      font-size: 10px; font-weight: 700; color: var(--muted);
      text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 3px;
    }
    .stat-val { font-size: 18px; font-weight: 800; color: var(--text); margin-bottom: 2px; }
    .stat-unit { font-size: 12px; font-weight: 500; color: var(--muted); }
    .stat-sub { font-size: 11px; color: var(--muted); margin-bottom: 8px; }
    .stat-track { height: 4px; background: var(--border); border-radius: 2px; overflow: hidden; }
    .stat-fill { height: 100%; border-radius: 2px; transition: width .5s ease; }

    /* ── Overlay / modals ── */
    .overlay {
      position: fixed; inset: 0; background: rgba(0,0,0,.38); z-index: 200;
      display: flex; align-items: flex-start; justify-content: center;
      padding: 56px 16px 40px; overflow-y: auto;
    }
    .modal-box {
      background: var(--surface); border: 1.5px solid var(--border);
      border-radius: 16px; padding: 22px;
      width: min(490px,100%); flex-shrink: 0;
    }
    .modal-sm { width: min(340px,100%); }

    .modal-hdr { margin-bottom: 16px; }
    .modal-hdr-text {
      font-size: 15px; font-weight: 700; color: var(--text);
      display: flex; align-items: center; flex-wrap: wrap; gap: 8px;
    }
    .modal-hdr-text b { font-weight: 800; }

    .today-badge-modal {
      font-size: 10px; font-weight: 700; color: #fff;
      background: #22c55e; border-radius: 100px; padding: 2px 9px;
    }

    /* Search */
    .search-row {
      display: flex; align-items: center; gap: 8px;
      border: 1.5px solid var(--border); border-radius: var(--radius);
      padding: 0 10px; margin-bottom: 14px;
    }
    .search-ico { color: var(--muted); font-size: 17px; flex-shrink: 0; }
    .search-inp {
      flex: 1; border: none; outline: none; padding: 11px 0;
      font-size: 14px; color: var(--text); background: transparent; font-family: inherit;
    }
    .search-inp::placeholder { color: #b0bdb0; }
    .search-btn {
      flex-shrink: 0; border: none; background: var(--teal); color: #fff;
      border-radius: 7px; padding: 7px 14px; font-size: 12px; font-weight: 600;
      cursor: pointer; font-family: inherit; transition: opacity .15s;
    }
    .search-btn:disabled { opacity: .6; cursor: not-allowed; }

    /* Chips */
    .chips { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 16px; }
    .chip {
      border: 1.5px solid var(--border); background: var(--bg);
      color: var(--muted); border-radius: 100px; padding: 5px 12px;
      font-size: 12px; font-weight: 500; cursor: pointer; font-family: inherit;
      transition: all .12s;
    }
    .chip:hover { border-color: var(--teal); color: var(--teal); background: #f0faf7; }

    /* Loading / empty states */
    .sg-loading {
      display: flex; align-items: center; justify-content: center; gap: 8px;
      padding: 20px 0; font-size: 13px; color: var(--muted);
    }
    .sg-empty {
      text-align: center; padding: 18px 0;
      font-size: 13px; color: var(--muted);
    }

    /* Error */
    .search-error {
      display: flex; align-items: center; gap: 7px;
      color: #dc2626; font-size: 13px; margin-bottom: 12px;
      background: #fef2f2; border: 1.5px solid #fecaca;
      border-radius: var(--radius); padding: 10px 14px;
    }

    /* Suggestion cards */
    .sg-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-bottom: 14px; }
    @media (max-width: 400px) { .sg-grid { grid-template-columns: 1fr; } }

    .sg-card {
      border: 1.5px solid var(--border); border-radius: var(--radius);
      padding: 12px 13px; background: var(--surface);
      display: flex; flex-direction: column; gap: 4px;
    }
    .sg-name { font-size: 12.5px; font-weight: 700; color: var(--text); line-height: 1.3; }
    .sg-meta { display: flex; gap: 9px; font-size: 11px; color: var(--muted); }
    .sg-meta span { display: flex; align-items: center; gap: 3px; }
    .sg-desc { font-size: 11px; color: var(--muted); line-height: 1.4; }
    .sg-benefit {
      display: flex; align-items: flex-start; gap: 5px;
      font-size: 11px; color: #166534; background: #f0fdf4;
      border: 1px solid #bbf7d0; border-radius: 6px; padding: 5px 8px;
      margin-top: 2px;
    }
    .sg-benefit i { font-size: 12px; flex-shrink: 0; margin-top: 1px; color: #16a34a; }

    .sg-add-btn {
      display: block; width: 100%; border: none; border-radius: 7px;
      padding: 8px; font-size: 12px; font-weight: 700;
      cursor: pointer; font-family: inherit; margin-top: 4px;
      transition: opacity .15s; color: #fff;
    }
    .sg-add-btn:hover { opacity: .88; }

    /* Cancel */
    .cancel-btn {
      display: block; width: 100%; border: 1.5px solid var(--border);
      background: transparent; color: var(--muted); border-radius: var(--radius);
      padding: 10px; font-size: 13px; font-weight: 600;
      cursor: pointer; font-family: inherit; margin-top: 6px; transition: background .12s;
    }
    .cancel-btn:hover { background: var(--bg); }

    /* Detail modal */
    .detail-meta-row {
      display: flex; flex-wrap: wrap; gap: 7px; margin-bottom: 16px;
    }
    .detail-tag {
      display: inline-flex; align-items: center; gap: 4px;
      border-radius: 100px; padding: 4px 12px;
      font-size: 12px; font-weight: 600;
    }
    .detail-tag-muted { background: var(--bg); color: var(--muted); }

    .benefit-card {
      display: flex; align-items: flex-start; gap: 12px;
      background: #f0fdf4; border: 1.5px solid #bbf7d0;
      border-radius: var(--radius); padding: 14px 16px; margin-bottom: 18px;
    }
    .benefit-ico { font-size: 18px; color: #16a34a; flex-shrink: 0; margin-top: 1px; }
    .benefit-label {
      font-size: 10px; font-weight: 700; color: #166534;
      text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 4px;
    }
    .benefit-text { font-size: 13px; color: #166534; line-height: 1.5; }

    .filled-actions {
      display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-bottom: 8px;
    }
    .btn-replace, .btn-remove {
      display: flex; align-items: center; justify-content: center; gap: 7px;
      border-radius: var(--radius); padding: 12px; font-size: 13px;
      font-weight: 600; cursor: pointer; font-family: inherit; transition: background .12s;
    }
    .btn-replace { border: 1.5px solid var(--border); background: var(--surface); color: var(--text); }
    .btn-replace:hover { background: var(--bg); }
    .btn-remove { border: 1.5px solid #fecaca; background: #fef2f2; color: #dc2626; }
    .btn-remove:hover { background: #fee2e2; }

    /* Spinner */
    .spin { display: inline-block; animation: spin .85s linear infinite; }
    @keyframes spin { to { transform: rotate(360deg); } }

    /* Responsive */
    @media (max-width: 680px) {
      .chart-row { flex-direction: column; }
      .legend-col { flex-direction: row; flex-wrap: wrap; gap: 12px; }
      .leg-actions { flex-direction: row; }
    }
  `],
})
export class MealPlannerComponent implements AfterViewInit {
  @ViewChild('donutCanvas') canvasRef!: ElementRef<HTMLCanvasElement>;

  private http = inject(HttpClient);
  readonly Math = Math;

  // Template constants
  readonly DAYS        = DAYS;
  readonly MEAL_TYPES  = MEAL_TYPES;
  readonly QUICK_PICKS = QUICK_PICKS;
  readonly MEAL_COLOR  = MEAL_COLOR;
  readonly MEAL_LABEL  = MEAL_LABEL;
  readonly weekLabel   = weekRange();

  // ── State ──────────────────────────────────────────────────────────────────
  grid          = signal<Grid>(emptyGrid());
  loadingSlots  = signal<Set<string>>(new Set());
  isAutoFilling = signal(false);

  activeSlot  = signal<{ day: string; meal: MealType } | null>(null);
  filledSlot  = signal<{ day: string; meal: MealType } | null>(null);
  searchQuery = '';
  suggestions  = signal<Meal[]>([]);
  isSearching  = signal(false);
  searchError  = signal('');
  hasSearched  = signal(false);

  streak = 5;

  readonly todayLabel: string =
    (['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'])[new Date().getDay()] ?? 'Mon';

  // ── Computed ───────────────────────────────────────────────────────────────
  allMeals = computed(() => {
    const r: Meal[] = [];
    for (const d of DAYS) for (const m of MEAL_TYPES) {
      const s = this.grid()[d][m]; if (s) r.push(s);
    }
    return r;
  });

  totalFilled   = computed(() => this.allMeals().length);
  avgCalories   = computed(() => {
    const meals = this.allMeals();
    return meals.length ? Math.round(meals.reduce((s, m) => s + m.kcal, 0) / 7) : 0;
  });
  uniqueRecipes = computed(() => new Set(this.allMeals().map(m => m.name)).size);
  bfCount = computed(() => DAYS.filter(d => !!this.grid()[d].breakfast).length);
  luCount = computed(() => DAYS.filter(d => !!this.grid()[d].lunch).length);
  diCount = computed(() => DAYS.filter(d => !!this.grid()[d].dinner).length);

  constructor() {
    effect(() => {
      const bf = this.bfCount();
      const lu = this.luCount();
      const di = this.diCount();
      this.drawDonut(bf, lu, di);
    });
  }

  ngAfterViewInit() {
    this.drawDonut(this.bfCount(), this.luCount(), this.diCount());
  }

  // ── Canvas donut ───────────────────────────────────────────────────────────
  drawDonut(bf: number, lu: number, di: number) {
    const canvas = this.canvasRef?.nativeElement;
    if (!canvas) return;

    const dpr = window.devicePixelRatio || 1;
    const size = 160;
    canvas.width  = size * dpr;
    canvas.height = size * dpr;
    canvas.style.width  = `${size}px`;
    canvas.style.height = `${size}px`;

    const ctx = canvas.getContext('2d')!;
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, size, size);

    const cx = size / 2, cy = size / 2, r = 60, lw = 18;
    const ef = 21 - bf - lu - di;

    const segs = [
      { n: bf, color: '#5DCAA5' },
      { n: lu, color: '#EF9F27' },
      { n: di, color: '#AFA9EC' },
      { n: ef, color: '#D3D1C7' },
    ].filter(s => s.n > 0);

    ctx.lineWidth = lw;
    ctx.lineCap   = 'round';

    if (segs.length === 1) {
      ctx.beginPath();
      ctx.strokeStyle = segs[0].color;
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.stroke();
    } else {
      const gap = 0.055;
      const total = Math.PI * 2 - gap * segs.length;
      let angle = -Math.PI / 2;
      for (const seg of segs) {
        const arc = (seg.n / 21) * total;
        ctx.beginPath();
        ctx.strokeStyle = seg.color;
        ctx.arc(cx, cy, r, angle, angle + arc);
        ctx.stroke();
        angle += arc + gap;
      }
    }

    const pct = Math.round((bf + lu + di) / 21 * 100);
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillStyle = '#1a2a1a';
    ctx.font = `bold 22px -apple-system,'Inter',sans-serif`;
    ctx.fillText(`${pct}%`, cx, cy - 9);
    ctx.font = `11px -apple-system,'Inter',sans-serif`;
    ctx.fillStyle = '#6b7c6b';
    ctx.fillText('planned', cx, cy + 11);
  }

  // ── Helpers ────────────────────────────────────────────────────────────────
  isToday(day: string): boolean { return day === this.todayLabel; }

  getSlot(day: string, meal: MealType): Meal | null {
    return this.grid()[day]?.[meal] ?? null;
  }

  isLoading(day: string, meal: MealType): boolean {
    return this.loadingSlots().has(`${day}-${meal}`);
  }

  // ── Modal: add ─────────────────────────────────────────────────────────────
  openSearch(day: string, meal: MealType) {
    this.activeSlot.set({ day, meal });
    this.filledSlot.set(null);
    this.suggestions.set([]);
    this.searchError.set('');
    this.hasSearched.set(false);
    this.searchQuery = '';
  }

  openFilledModal(day: string, meal: MealType) {
    this.filledSlot.set({ day, meal });
    this.activeSlot.set(null);
  }

  closeModal() {
    this.activeSlot.set(null);
    this.filledSlot.set(null);
    this.suggestions.set([]);
    this.searchError.set('');
    this.hasSearched.set(false);
    this.searchQuery = '';
  }

  quickPick(name: string) {
    this.searchQuery = name;
    this.doSearch();
  }

  doSearch() {
    const q    = this.searchQuery.trim();
    const slot = this.activeSlot();
    if (!q || !slot) return;

    this.isSearching.set(true);
    this.searchError.set('');
    this.hasSearched.set(false);
    this.suggestions.set([]);

    this.http.post<Meal[]>(`${environment.apiUrl}/ai/meal-suggest`, {
      query:     q,
      meal_type: slot.meal,
      count:     4,
    }).pipe(catchError(() => {
      this.searchError.set('Could not load results. Try again.');
      this.isSearching.set(false);
      this.hasSearched.set(true);
      return of(null);
    })).subscribe(list => {
      if (list !== null) {
        this.suggestions.set(Array.isArray(list) ? list : []);
        this.isSearching.set(false);
        this.hasSearched.set(true);
      }
    });
  }

  selectSuggestion(s: Meal) {
    const slot = this.activeSlot();
    if (!slot) return;
    this.grid.update(g => ({
      ...g,
      [slot.day]: { ...g[slot.day], [slot.meal]: s },
    }));
    this.closeModal();
  }

  // ── Modal: filled ──────────────────────────────────────────────────────────
  removeSlot() {
    const slot = this.filledSlot();
    if (!slot) return;
    this.grid.update(g => ({
      ...g,
      [slot.day]: { ...g[slot.day], [slot.meal]: null },
    }));
    this.closeModal();
  }

  replaceSlot() {
    const slot = this.filledSlot();
    if (!slot) return;
    const { day, meal } = slot;
    this.filledSlot.set(null);
    this.openSearch(day, meal);
  }

  // ── Auto-fill ──────────────────────────────────────────────────────────────
  autoFill() {
    const empty: Array<{ day: string; meal: MealType }> = [];
    for (const d of DAYS) for (const m of MEAL_TYPES) {
      if (!this.grid()[d][m]) empty.push({ day: d, meal: m });
    }
    if (!empty.length) return;

    this.isAutoFilling.set(true);
    this.loadingSlots.set(new Set(empty.map(s => `${s.day}-${s.meal}`)));

    const typeList = empty
      .map(s => s.meal.charAt(0).toUpperCase() + s.meal.slice(1))
      .join(', ');

    this.http.post<Meal[]>(`${environment.apiUrl}/ai/meal-suggest`, {
      query:     typeList,
      meal_type: 'mixed',
      count:     empty.length,
    }).pipe(catchError(() => of([]))).subscribe(meals => {
      if (Array.isArray(meals) && meals.length) {
        this.grid.update(g => {
          const next: Grid = {};
          for (const d of DAYS) next[d] = g[d] ? { ...g[d] } : { breakfast: null, lunch: null, dinner: null };
          meals.slice(0, empty.length).forEach((meal, i) => {
            const { day, meal: mt } = empty[i];
            if (next[day]) next[day][mt] = meal;
          });
          return next;
        });
      }
      this.loadingSlots.set(new Set());
      this.isAutoFilling.set(false);
    });
  }

  clearAll() { this.grid.set(emptyGrid()); }
}
