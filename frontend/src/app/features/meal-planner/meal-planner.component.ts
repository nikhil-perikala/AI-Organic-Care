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

interface Meal { name: string; kcal: number; time: string; desc: string; }
type DayMeals = { [K in MealType]: Meal | null };
type Grid     = { [day: string]: DayMeals };

const DAYS       = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const;
const MEAL_TYPES = ['breakfast', 'lunch', 'dinner'] as const;
const QUICK_PICKS = [
  'Oat porridge', 'Avocado toast', 'Grilled chicken', 'Pasta carbonara',
  'Dal tadka', 'Salmon bowl', 'Egg curry', 'Quinoa salad',
];

const MEAL_COLOR: Record<MealType, string> = {
  breakfast: '#5DCAA5',
  lunch: '#EF9F27',
  dinner: '#AFA9EC',
};
const MEAL_LABEL: Record<MealType, string> = {
  breakfast: 'Break.',
  lunch: 'Lunch',
  dinner: 'Dinner',
};

function emptyGrid(): Grid {
  const g: Grid = {};
  for (const d of DAYS) g[d] = { breakfast: null, lunch: null, dinner: null };
  return g;
}

// ── Component ──────────────────────────────────────────────────────────────────

@Component({
  selector: 'app-meal-planner',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
<div class="mp-root">

  <!-- ── Header ─────────────────────────────────────────────────────────── -->
  <header class="mp-hdr">
    <div class="hdr-top">
      <div class="mp-title">
        <i class="ti ti-plant"></i>
        Weekly Meal Planner
      </div>
      <div class="streak-badge">
        <i class="ti ti-flame"></i>
        {{ streak }}-day streak
      </div>
    </div>
    <div class="hdr-actions">
      <button class="btn-wand" (click)="autoFill()" [disabled]="isAutoFilling()">
        @if (isAutoFilling()) {
          <i class="ti ti-loader-2 spin"></i> Filling…
        } @else {
          <i class="ti ti-wand"></i> Auto-fill
        }
      </button>
      <button class="btn-clear" (click)="clearAll()">
        <i class="ti ti-trash"></i> Clear all
      </button>
    </div>
  </header>

  <!-- ── Body: donut + grid ─────────────────────────────────────────────── -->
  <div class="mp-body">

    <!-- Donut panel -->
    <aside class="donut-panel">
      <canvas #donutCanvas class="donut-canvas"></canvas>
      <div class="legend">
        <div class="leg-row"><span class="leg-dot" style="background:#5DCAA5"></span>Breakfast</div>
        <div class="leg-row"><span class="leg-dot" style="background:#EF9F27"></span>Lunch</div>
        <div class="leg-row"><span class="leg-dot" style="background:#AFA9EC"></span>Dinner</div>
        <div class="leg-row"><span class="leg-dot" style="background:#D3D1C7"></span>Empty</div>
      </div>
    </aside>

    <!-- Grid -->
    <div class="grid-scroll">
      <div class="grid-inner">

        <!-- Day headers -->
        <div class="g-row g-head-row">
          <div class="g-stub"></div>
          @for (d of DAYS; track d) {
            <div class="g-day-head" [class.g-today]="d === todayLabel">{{ d }}</div>
          }
        </div>

        <!-- Meal rows -->
        @for (meal of MEAL_TYPES; track meal) {
          <div class="g-row">
            <div class="g-row-label" [style.color]="MEAL_COLOR[meal]">
              {{ MEAL_LABEL[meal] }}
            </div>
            @for (d of DAYS; track d) {
              <div class="g-cell">
                @if (isLoading(d, meal)) {
                  <div class="pill pill-loading" [attr.data-meal]="meal">
                    <i class="ti ti-loader-2 spin"></i>
                  </div>
                } @else if (getSlot(d, meal)) {
                  <div class="pill pill-filled" [attr.data-meal]="meal"
                       (click)="openFilledModal(d, meal)">
                    <span class="pill-name">{{ getSlot(d, meal)!.name }}</span>
                    <span class="pill-kcal">{{ getSlot(d, meal)!.kcal }} kcal</span>
                  </div>
                } @else {
                  <div class="pill pill-empty" (click)="openSearch(d, meal)">
                    <i class="ti ti-plus"></i>
                  </div>
                }
              </div>
            }
          </div>
        }

      </div><!-- /grid-inner -->
    </div><!-- /grid-scroll -->

  </div><!-- /mp-body -->

  <!-- ── Stats ──────────────────────────────────────────────────────────── -->
  <div class="stats-row">

    <div class="stat-card">
      <i class="ti ti-flame stat-ico" style="color:#EF9F27"></i>
      <div class="stat-body">
        <div class="stat-label">Avg Daily Calories</div>
        <div class="stat-val">{{ avgCalories() | number:'1.0-0' }} kcal</div>
        <div class="stat-track">
          <div class="stat-fill" style="background:#EF9F27"
               [style.width.%]="Math.min(100, avgCalories() / 25)"></div>
        </div>
      </div>
    </div>

    <div class="stat-card">
      <i class="ti ti-calendar-check stat-ico" style="color:#5DCAA5"></i>
      <div class="stat-body">
        <div class="stat-label">Meals Planned</div>
        <div class="stat-val">{{ totalFilled() }} / 21</div>
        <div class="stat-track">
          <div class="stat-fill" style="background:#5DCAA5"
               [style.width.%]="totalFilled() / 21 * 100"></div>
        </div>
      </div>
    </div>

    <div class="stat-card">
      <i class="ti ti-chef-hat stat-ico" style="color:#AFA9EC"></i>
      <div class="stat-body">
        <div class="stat-label">Unique Recipes</div>
        <div class="stat-val">{{ uniqueRecipes() }}</div>
        <div class="stat-track">
          <div class="stat-fill" style="background:#AFA9EC"
               [style.width.%]="Math.min(100, uniqueRecipes() / 21 * 100)"></div>
        </div>
      </div>
    </div>

  </div><!-- /stats-row -->

  <!-- ── Add-meal modal ─────────────────────────────────────────────────── -->
  @if (activeSlot()) {
    <div class="overlay" (click)="closeModal()">
      <div class="modal-box" (click)="$event.stopPropagation()">

        <p class="modal-title">
          Add
          <b [style.color]="MEAL_COLOR[activeSlot()!.meal]">{{ activeSlot()!.meal }}</b>
          for <b>{{ activeSlot()!.day }}</b>
        </p>

        <div class="search-row">
          <i class="ti ti-search search-ico"></i>
          <input class="search-inp"
            [(ngModel)]="searchQuery"
            placeholder="Search or describe a meal…"
            (keydown.enter)="doSearch()"
            autofocus>
          <button class="search-btn" (click)="doSearch()" [disabled]="isSearching()">
            @if (isSearching()) {
              <i class="ti ti-loader-2 spin"></i>
            } @else {
              Search
            }
          </button>
        </div>

        <div class="chips">
          @for (q of QUICK_PICKS; track q) {
            <button class="chip" (click)="quickPick(q)">{{ q }}</button>
          }
        </div>

        @if (suggestions().length > 0) {
          <div class="sg-grid">
            @for (s of suggestions(); track s.name) {
              <div class="sg-card" (click)="selectSuggestion(s)">
                <div class="sg-name">{{ s.name }}</div>
                <div class="sg-meta">
                  <span><i class="ti ti-flame"></i> {{ s.kcal }} kcal</span>
                  <span><i class="ti ti-clock"></i> {{ s.time }}</span>
                </div>
                <div class="sg-desc">{{ s.desc }}</div>
              </div>
            }
          </div>
        }

        <button class="cancel-btn" (click)="closeModal()">Cancel</button>
      </div>
    </div>
  }

  <!-- ── Filled-slot modal ───────────────────────────────────────────────── -->
  @if (filledSlot()) {
    <div class="overlay" (click)="closeModal()">
      <div class="modal-box modal-sm" (click)="$event.stopPropagation()">

        <p class="modal-title">
          {{ getSlot(filledSlot()!.day, filledSlot()!.meal)?.name }}
        </p>
        <p class="filled-sub" [style.color]="MEAL_COLOR[filledSlot()!.meal]">
          {{ filledSlot()!.day }} · {{ MEAL_LABEL[filledSlot()!.meal] }}
          · {{ getSlot(filledSlot()!.day, filledSlot()!.meal)?.kcal }} kcal
          · {{ getSlot(filledSlot()!.day, filledSlot()!.meal)?.time }}
        </p>
        <p class="filled-desc">
          {{ getSlot(filledSlot()!.day, filledSlot()!.meal)?.desc }}
        </p>

        <div class="filled-actions">
          <button class="btn-remove" (click)="removeSlot()">
            <i class="ti ti-trash"></i> Remove
          </button>
          <button class="btn-replace" (click)="replaceSlot()">
            <i class="ti ti-refresh"></i> Replace
          </button>
        </div>

        <button class="cancel-btn" (click)="closeModal()">Cancel</button>
      </div>
    </div>
  }

</div><!-- /mp-root -->
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

    /* ── Root ── */
    .mp-root {
      position: relative;
      min-height: 100vh;
      background: var(--bg);
      padding: 24px 20px 80px;
      max-width: 1120px;
      margin: 0 auto;
    }

    /* ── Header ── */
    .mp-hdr { margin-bottom: 24px; }

    .hdr-top {
      display: flex;
      align-items: center;
      justify-content: space-between;
      flex-wrap: wrap;
      gap: 10px;
      margin-bottom: 14px;
    }

    .mp-title {
      display: flex;
      align-items: center;
      gap: 9px;
      font-size: 19px;
      font-weight: 800;
      color: var(--text);
      letter-spacing: -0.3px;
    }
    .mp-title i { font-size: 21px; color: var(--teal); }

    .streak-badge {
      display: flex;
      align-items: center;
      gap: 6px;
      background: #fff7ed;
      border: 1.5px solid #fed7aa;
      border-radius: 100px;
      padding: 5px 13px;
      font-size: 12px;
      font-weight: 700;
      color: #b45309;
      white-space: nowrap;
    }

    .hdr-actions { display: flex; gap: 10px; flex-wrap: wrap; }

    .btn-wand, .btn-clear {
      display: inline-flex;
      align-items: center;
      gap: 7px;
      border: none;
      border-radius: var(--radius);
      padding: 10px 18px;
      font-size: 13px;
      font-weight: 600;
      cursor: pointer;
      transition: opacity 0.15s, background 0.15s;
      font-family: inherit;
    }
    .btn-wand:disabled { opacity: 0.6; cursor: not-allowed; }

    .btn-wand  { background: var(--teal); color: #fff; }
    .btn-wand:not(:disabled):hover { opacity: 0.88; }

    .btn-clear {
      background: var(--surface);
      color: var(--muted);
      border: 1.5px solid var(--border);
    }
    .btn-clear:hover { background: #fef2f2; color: #e11d48; border-color: #fecaca; }

    /* ── Body layout ── */
    .mp-body {
      display: grid;
      grid-template-columns: 190px 1fr;
      gap: 24px;
      align-items: start;
      margin-bottom: 24px;
    }
    @media (max-width: 680px) {
      .mp-body { grid-template-columns: 1fr; }
    }

    /* ── Donut panel ── */
    .donut-panel {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 18px;
    }
    .donut-canvas { display: block; }

    .legend {
      display: flex;
      flex-direction: column;
      gap: 6px;
      align-self: flex-start;
      padding-left: 8px;
    }
    .leg-row {
      display: flex;
      align-items: center;
      gap: 8px;
      font-size: 12px;
      color: var(--muted);
    }
    .leg-dot {
      width: 9px;
      height: 9px;
      border-radius: 50%;
      flex-shrink: 0;
    }

    /* ── Grid ── */
    .grid-scroll { overflow-x: auto; -webkit-overflow-scrolling: touch; }
    .grid-inner  { min-width: 580px; }

    .g-row {
      display: grid;
      grid-template-columns: 52px repeat(7, 1fr);
      gap: 5px;
      margin-bottom: 5px;
    }
    .g-head-row { margin-bottom: 8px; }

    .g-stub { /* corner spacer */ }

    .g-day-head {
      font-size: 11px;
      font-weight: 700;
      color: var(--muted);
      text-align: center;
      padding: 7px 4px;
      border-radius: 8px;
      text-transform: uppercase;
      letter-spacing: 0.6px;
    }
    .g-today { background: var(--teal); color: #fff; }

    .g-row-label {
      font-size: 10px;
      font-weight: 800;
      text-transform: uppercase;
      letter-spacing: 0.6px;
      display: flex;
      align-items: center;
      padding-right: 4px;
    }

    .g-cell { display: flex; }

    /* ── Pills ── */
    .pill {
      flex: 1;
      border-radius: 9px;
      min-height: 62px;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      cursor: pointer;
      transition: transform 0.1s;
      padding: 7px 5px;
      text-align: center;
    }
    .pill:hover { transform: translateY(-1px); }

    .pill-empty {
      border: 2px dashed var(--border);
      background: var(--surface);
      color: #c5d1c5;
    }
    .pill-empty:hover { border-color: var(--teal); color: var(--teal); }
    .pill-empty i { font-size: 18px; }

    /* Filled pill colors via data-meal attribute */
    .pill-filled {
      border: 1.5px solid transparent;
    }
    .pill-filled[data-meal="breakfast"] {
      background: #e8f9f4;
      border-color: #9de8cd;
      color: #10695a;
    }
    .pill-filled[data-meal="lunch"] {
      background: #fef6e6;
      border-color: #f9d88a;
      color: #8c5a00;
    }
    .pill-filled[data-meal="dinner"] {
      background: #f2f1fc;
      border-color: #ccc9f3;
      color: #5048a8;
    }
    .pill-filled:hover { opacity: 0.82; }

    .pill-name {
      font-size: 10.5px;
      font-weight: 700;
      line-height: 1.3;
      display: block;
      width: 100%;
      overflow: hidden;
      display: -webkit-box;
      -webkit-line-clamp: 2;
      -webkit-box-orient: vertical;
      margin-bottom: 3px;
    }
    .pill-kcal { font-size: 9.5px; opacity: 0.75; display: block; }

    /* Loading pill */
    .pill-loading {
      border: 1.5px solid transparent;
      animation: pulse 1s ease-in-out infinite;
    }
    .pill-loading[data-meal="breakfast"] { background: #e8f9f4; border-color: #9de8cd; color: #5DCAA5; }
    .pill-loading[data-meal="lunch"]     { background: #fef6e6; border-color: #f9d88a; color: #EF9F27; }
    .pill-loading[data-meal="dinner"]    { background: #f2f1fc; border-color: #ccc9f3; color: #AFA9EC; }
    .pill-loading i { font-size: 18px; }

    @keyframes pulse {
      0%, 100% { opacity: 1; }
      50%       { opacity: 0.35; }
    }

    /* ── Stats ── */
    .stats-row {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 12px;
    }
    @media (max-width: 560px) {
      .stats-row { grid-template-columns: 1fr; }
    }

    .stat-card {
      background: var(--surface);
      border: 1.5px solid var(--border);
      border-radius: var(--radius);
      padding: 14px 16px;
      display: flex;
      align-items: flex-start;
      gap: 12px;
    }
    .stat-ico { font-size: 20px; margin-top: 1px; flex-shrink: 0; }
    .stat-body { flex: 1; min-width: 0; }
    .stat-label {
      font-size: 10px;
      font-weight: 700;
      color: var(--muted);
      text-transform: uppercase;
      letter-spacing: 0.5px;
      margin-bottom: 3px;
    }
    .stat-val {
      font-size: 17px;
      font-weight: 800;
      color: var(--text);
      margin-bottom: 8px;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .stat-track {
      height: 4px;
      background: var(--border);
      border-radius: 2px;
      overflow: hidden;
    }
    .stat-fill {
      height: 100%;
      border-radius: 2px;
      transition: width 0.5s ease;
    }

    /* ── Overlay + modal ── */
    .overlay {
      position: fixed;
      inset: 0;
      background: rgba(0, 0, 0, 0.38);
      z-index: 200;
      display: flex;
      align-items: flex-start;
      justify-content: center;
      padding: 60px 16px 40px;
      overflow-y: auto;
    }

    .modal-box {
      background: var(--surface);
      border: 1.5px solid var(--border);
      border-radius: 16px;
      padding: 22px;
      width: min(480px, 100%);
      max-height: calc(100vh - 100px);
      overflow-y: auto;
      flex-shrink: 0;
    }
    .modal-sm { width: min(320px, 100%); }

    .modal-title {
      font-size: 15px;
      font-weight: 700;
      color: var(--text);
      margin-bottom: 16px;
      line-height: 1.4;
    }
    .modal-title b { font-weight: 800; }

    /* Search row */
    .search-row {
      display: flex;
      align-items: center;
      gap: 8px;
      border: 1.5px solid var(--border);
      border-radius: var(--radius);
      padding: 0 10px;
      background: var(--surface);
      margin-bottom: 14px;
    }
    .search-ico { color: var(--muted); font-size: 17px; flex-shrink: 0; }
    .search-inp {
      flex: 1;
      border: none;
      outline: none;
      padding: 11px 0;
      font-size: 14px;
      color: var(--text);
      background: transparent;
      font-family: inherit;
    }
    .search-inp::placeholder { color: #b0bdb0; }
    .search-btn {
      flex-shrink: 0;
      border: none;
      background: var(--teal);
      color: #fff;
      border-radius: 7px;
      padding: 7px 14px;
      font-size: 12px;
      font-weight: 600;
      cursor: pointer;
      transition: opacity 0.15s;
      font-family: inherit;
    }
    .search-btn:disabled { opacity: 0.6; cursor: not-allowed; }

    /* Quick-pick chips */
    .chips {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
      margin-bottom: 16px;
    }
    .chip {
      border: 1.5px solid var(--border);
      background: var(--bg);
      color: var(--muted);
      border-radius: 100px;
      padding: 5px 12px;
      font-size: 12px;
      font-weight: 500;
      cursor: pointer;
      transition: all 0.12s;
      font-family: inherit;
    }
    .chip:hover { border-color: var(--teal); color: var(--teal); background: #f0faf7; }

    /* Suggestion cards */
    .sg-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 8px;
      margin-bottom: 14px;
    }
    @media (max-width: 400px) { .sg-grid { grid-template-columns: 1fr; } }

    .sg-card {
      border: 1.5px solid var(--border);
      border-radius: var(--radius);
      padding: 11px 13px;
      cursor: pointer;
      transition: border-color 0.12s, transform 0.1s;
      background: var(--surface);
    }
    .sg-card:hover { border-color: var(--teal); transform: translateY(-1px); }
    .sg-name {
      font-size: 12.5px;
      font-weight: 700;
      color: var(--text);
      margin-bottom: 5px;
      line-height: 1.3;
    }
    .sg-meta {
      display: flex;
      gap: 9px;
      font-size: 11px;
      color: var(--muted);
      margin-bottom: 4px;
    }
    .sg-meta span { display: flex; align-items: center; gap: 3px; }
    .sg-desc { font-size: 11px; color: var(--muted); line-height: 1.4; }

    /* Cancel / remove / replace buttons */
    .cancel-btn {
      display: block;
      width: 100%;
      border: 1.5px solid var(--border);
      background: transparent;
      color: var(--muted);
      border-radius: var(--radius);
      padding: 10px;
      font-size: 13px;
      font-weight: 600;
      cursor: pointer;
      transition: background 0.12s;
      font-family: inherit;
      margin-top: 6px;
    }
    .cancel-btn:hover { background: var(--bg); }

    .filled-sub {
      font-size: 12px;
      margin-bottom: 8px;
      font-weight: 600;
    }
    .filled-desc {
      font-size: 12px;
      color: var(--muted);
      margin-bottom: 18px;
      line-height: 1.5;
    }
    .filled-actions {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 10px;
      margin-bottom: 8px;
    }
    .btn-remove, .btn-replace {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 7px;
      border-radius: var(--radius);
      padding: 12px;
      font-size: 13px;
      font-weight: 600;
      cursor: pointer;
      transition: background 0.12s;
      font-family: inherit;
    }
    .btn-remove {
      border: 1.5px solid #fecaca;
      background: #fef2f2;
      color: #dc2626;
    }
    .btn-remove:hover { background: #fee2e2; }
    .btn-replace {
      border: 1.5px solid var(--border);
      background: var(--surface);
      color: var(--text);
    }
    .btn-replace:hover { background: var(--bg); }

    /* ── Spinner ── */
    .spin { display: inline-block; animation: spin 0.85s linear infinite; }
    @keyframes spin { to { transform: rotate(360deg); } }
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

  // ── State ──────────────────────────────────────────────────────────────────
  grid         = signal<Grid>(emptyGrid());
  loadingSlots = signal<Set<string>>(new Set());
  isAutoFilling = signal(false);

  activeSlot  = signal<{ day: string; meal: MealType } | null>(null);
  filledSlot  = signal<{ day: string; meal: MealType } | null>(null);
  searchQuery = '';
  suggestions = signal<Meal[]>([]);
  isSearching  = signal(false);

  streak = 5;
  readonly todayLabel: string =
    (['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'])[new Date().getDay()] ?? 'Mon';

  // ── Computed stats ─────────────────────────────────────────────────────────
  allMeals = computed(() => {
    const r: Meal[] = [];
    for (const d of DAYS) for (const m of MEAL_TYPES) {
      const s = this.grid()[d][m];
      if (s) r.push(s);
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
    // Redraw donut whenever any segment count changes
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

  // ── Canvas donut ────────────────────────────────────────────────────────────
  drawDonut(bf: number, lu: number, di: number) {
    const canvas = this.canvasRef?.nativeElement;
    if (!canvas) return;

    const dpr  = window.devicePixelRatio || 1;
    const size = 170;
    canvas.width  = size * dpr;
    canvas.height = size * dpr;
    canvas.style.width  = `${size}px`;
    canvas.style.height = `${size}px`;

    const ctx = canvas.getContext('2d')!;
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, size, size);

    const cx = size / 2;
    const cy = size / 2;
    const r  = 64;
    const lw = 20;
    const ef = 21 - bf - lu - di;

    const segments = [
      { n: bf, color: '#5DCAA5' },
      { n: lu, color: '#EF9F27' },
      { n: di, color: '#AFA9EC' },
      { n: ef, color: '#D3D1C7' },
    ].filter(s => s.n > 0);

    ctx.lineWidth = lw;
    ctx.lineCap   = 'round';

    if (segments.length === 1) {
      // Single segment — draw full circle, no gap needed
      ctx.beginPath();
      ctx.strokeStyle = segments[0].color;
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.stroke();
    } else {
      const gap      = 0.055;
      const totalArc = Math.PI * 2 - gap * segments.length;
      let   angle    = -Math.PI / 2;

      for (const seg of segments) {
        const arc = (seg.n / 21) * totalArc;
        ctx.beginPath();
        ctx.strokeStyle = seg.color;
        ctx.arc(cx, cy, r, angle, angle + arc);
        ctx.stroke();
        angle += arc + gap;
      }
    }

    // Center label
    const pct = Math.round((bf + lu + di) / 21 * 100);
    ctx.textAlign    = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle    = '#1a2a1a';
    ctx.font         = `bold 24px -apple-system, 'Inter', sans-serif`;
    ctx.fillText(`${pct}%`, cx, cy - 10);
    ctx.font         = `11px -apple-system, 'Inter', sans-serif`;
    ctx.fillStyle    = '#6b7c6b';
    ctx.fillText('complete', cx, cy + 11);
  }

  // ── Grid helpers ────────────────────────────────────────────────────────────
  getSlot(day: string, meal: MealType): Meal | null {
    return this.grid()[day]?.[meal] ?? null;
  }

  isLoading(day: string, meal: MealType): boolean {
    return this.loadingSlots().has(`${day}-${meal}`);
  }

  // ── Modal: add meal ─────────────────────────────────────────────────────────
  openSearch(day: string, meal: MealType) {
    this.activeSlot.set({ day, meal });
    this.filledSlot.set(null);
    this.suggestions.set([]);
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
    this.http.post<Meal[]>(`${environment.apiUrl}/ai/meal-suggest`, {
      query: q,
      meal_type: slot.meal,
      count: 4,
    }).pipe(catchError(() => of([]))).subscribe(list => {
      this.suggestions.set(Array.isArray(list) ? list : []);
      this.isSearching.set(false);
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

  // ── Modal: filled slot ──────────────────────────────────────────────────────
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

  // ── Auto-fill ───────────────────────────────────────────────────────────────
  autoFill() {
    const empty: Array<{ day: string; meal: MealType }> = [];
    for (const d of DAYS) for (const m of MEAL_TYPES) {
      if (!this.grid()[d][m]) empty.push({ day: d, meal: m });
    }
    if (!empty.length) return;

    this.isAutoFilling.set(true);
    this.loadingSlots.set(new Set(empty.map(s => `${s.day}-${s.meal}`)));

    this.http.post<Meal[]>(`${environment.apiUrl}/ai/meal-suggest`, {
      query: 'balanced healthy week with variety',
      meal_type: 'mixed',
      count: empty.length,
    }).pipe(catchError(() => of([]))).subscribe(meals => {
      if (Array.isArray(meals) && meals.length) {
        this.grid.update(g => {
          const next: Grid = {};
          for (const d of DAYS) {
            next[d] = g[d] ? { ...g[d] } : { breakfast: null, lunch: null, dinner: null };
          }
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

  // ── Clear all ───────────────────────────────────────────────────────────────
  clearAll() {
    this.grid.set(emptyGrid());
  }
}
