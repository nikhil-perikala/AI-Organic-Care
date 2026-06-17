import { Component, inject, signal, computed, OnInit } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { AuthService } from '../../core/services/auth.service';
import { PantryService, PantryItem } from '../../core/services/pantry.service';
import { environment } from '../../../environments/environment';
import { forkJoin, of } from 'rxjs';
import { catchError } from 'rxjs/operators';

// ── Types ──────────────────────────────────────────────────────────────────────

interface ApiRecipe {
  id: string; title: string; meal_type: string | null;
  prep_time_minutes: number | null; cook_time_minutes: number | null;
  ailment_tags: string[]; health_benefits: string[]; dietary_labels: string[];
  efficacy_score: number;
  image_url: string | null;
  recipe_ingredients: { ingredient: { name: string } }[];
}

interface PlanMeal {
  id: string; title: string; imageUrl: string;
  mealType: string; prepTime: number;
  calories: number; protein: number; fiber: number; cost: number;
  tags: string[]; inPantry: boolean; missingIngredients: string[];
  locked: boolean;
}

interface DayPlan {
  day: string; date: Date; dateLabel: string; isToday: boolean;
  breakfast: PlanMeal | null;
  lunch:     PlanMeal | null;
  dinner:    PlanMeal | null;
}

// ── Category-matched food images (visually distinct per recipe type) ────────────
// Each pattern maps to a specific Unsplash photo of that food category.
// Used only when the recipe has no image_url stored in the DB yet.
const CATEGORY_IMAGES: Array<[RegExp, string]> = [
  // Indian / South Asian
  [/butter chicken|tikka|biryani|masala|paneer|palak|rogan|dal|curry|korma|vindaloo|makhani/i,
   'https://images.unsplash.com/photo-1585937421612-70a008356fbe?w=400&auto=format&fit=crop&q=80'],
  // Italian / pasta
  [/pasta|spaghetti|carbonara|risotto|penne|fettuccine|linguine|lasagne|bolognese/i,
   'https://images.unsplash.com/photo-1473093226555-0b4a714b6af0?w=400&auto=format&fit=crop&q=80'],
  // Breakfast
  [/pancake|waffle|toast|oat|yogurt|parfait|banana|smoothie|granola|muffin|french toast/i,
   'https://images.unsplash.com/photo-1533089860892-a7c6f0a88666?w=400&auto=format&fit=crop&q=80'],
  // Eggs
  [/egg|omelette|frittata|scrambled|poached egg/i,
   'https://images.unsplash.com/photo-1482049016688-2d3e1b311543?w=400&auto=format&fit=crop&q=80'],
  // Salads / Mediterranean / Buddha bowls
  [/salad|hummus|buddha bowl|quinoa|falafel|nicoise|wrap|pita/i,
   'https://images.unsplash.com/photo-1512621776951-a57141f2eefd?w=400&auto=format&fit=crop&q=80'],
  // Soups & stews
  [/soup|stew|lentil|chili|broth|bisque/i,
   'https://images.unsplash.com/photo-1547592166-23ac45744acd?w=400&auto=format&fit=crop&q=80'],
  // Fish & seafood
  [/salmon|tuna|shrimp|prawn|seafood|fish|cod|tilapia|lobster/i,
   'https://images.unsplash.com/photo-1467003909585-2f8a72700288?w=400&auto=format&fit=crop&q=80'],
  // Rice & Asian
  [/fried rice|stir.?fry|noodle|ramen|pad thai|fried rice|asian/i,
   'https://images.unsplash.com/photo-1536304993881-ff86e0c9e07a?w=400&auto=format&fit=crop&q=80'],
  // Chicken (catch-all before generic meat)
  [/chicken|poultry/i,
   'https://images.unsplash.com/photo-1598103442097-8b74394b95c8?w=400&auto=format&fit=crop&q=80'],
  // Red meat
  [/beef|lamb|pork|steak|mutton/i,
   'https://images.unsplash.com/photo-1432139555190-58524dae6a55?w=400&auto=format&fit=crop&q=80'],
];

const FALLBACK_BY_MEALTYPE: Record<string, string> = {
  breakfast: 'https://images.unsplash.com/photo-1533089860892-a7c6f0a88666?w=400&auto=format&fit=crop&q=80',
  snack:     'https://images.unsplash.com/photo-1490567674331-8e67a6d1d8ef?w=400&auto=format&fit=crop&q=80',
  lunch:     'https://images.unsplash.com/photo-1512621776951-a57141f2eefd?w=400&auto=format&fit=crop&q=80',
  dinner:    'https://images.unsplash.com/photo-1574484284002-952d92456975?w=400&auto=format&fit=crop&q=80',
};

// ── Helpers ────────────────────────────────────────────────────────────────────

function mealImg(title: string, mealType: string | null, dbUrl?: string | null): string {
  if (dbUrl) return dbUrl;
  for (const [pat, url] of CATEGORY_IMAGES) {
    if (pat.test(title)) return url;
  }
  return FALLBACK_BY_MEALTYPE[mealType ?? 'dinner'] ?? FALLBACK_BY_MEALTYPE['dinner'];
}

function hasPantry(name: string, pantry: string[]): boolean {
  const n = name.toLowerCase().trim();
  return pantry.some(p => p.includes(n) || n.includes(p) || n.split(/\s+/).some(w => w.length >= 4 && p.includes(w)));
}

function toMeal(r: ApiRecipe, pantry: string[]): PlanMeal {
  const ings    = r.recipe_ingredients.map(ri => ri.ingredient.name);
  const missing = ings.filter(n => !hasPantry(n, pantry));
  const mt = r.meal_type ?? 'dinner';
  return {
    id: r.id, title: r.title, imageUrl: mealImg(r.title, r.meal_type, r.image_url),
    mealType: mt,
    prepTime: (r.prep_time_minutes ?? 0) + (r.cook_time_minutes ?? 0) || 20,
    calories: mt === 'breakfast' ? 420 : mt === 'lunch' ? 530 : mt === 'snack' ? 190 : 660,
    protein:  r.health_benefits.some(b => /protein|muscle/i.test(b)) ? 26 : 14,
    fiber:    r.ailment_tags.some(t => /gut|digest/i.test(t)) ? 11 : 5,
    cost:     mt === 'breakfast' ? 3.5 : mt === 'lunch' ? 6 : 10,
    tags: [...r.ailment_tags.slice(0, 1), ...r.dietary_labels.slice(0, 1)].filter(Boolean),
    inPantry: missing.length === 0 && ings.length > 0,
    missingIngredients: missing.slice(0, 4),
    locked: false,
  };
}

function monday(offsetWeeks = 0): Date {
  const d = new Date();
  const diff = d.getDay() === 0 ? -6 : 1 - d.getDay();
  d.setDate(d.getDate() + diff + offsetWeeks * 7);
  d.setHours(0, 0, 0, 0);
  return d;
}

function buildPlan(recipes: ApiRecipe[], pantry: string[], offsetWeeks: number): DayPlan[] {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const mon = monday(offsetWeeks);
  const days = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'].map((day, i) => {
    const date = new Date(mon); date.setDate(mon.getDate() + i);
    return { day, date, isToday: date.getTime() === today.getTime(),
      dateLabel: date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) };
  });

  // No recipes in DB — return empty slots so the grid still renders
  if (recipes.length === 0) {
    return days.map(d => ({ ...d, breakfast: null, lunch: null, dinner: null }));
  }

  const shuffle = <T>(a: T[]): T[] => [...a].sort(() => Math.random() - 0.5);
  const bp = shuffle(recipes.filter(r => ['breakfast','snack'].includes(r.meal_type ?? '')));
  const lp = shuffle(recipes.filter(r => ['lunch','salad'].includes(r.meal_type ?? '')));
  const dp = shuffle(recipes.filter(r => ['dinner','main'].includes(r.meal_type ?? '')));
  const any = shuffle(recipes);

  const pick = (pool: ApiRecipe[], used: Set<string>): ApiRecipe | null => {
    const src  = pool.length > 0 ? pool : any;
    const avail = src.filter(r => !used.has(r.id));
    const r = avail[0] ?? any.find(x => !used.has(x.id)) ?? null;
    if (r) used.add(r.id);
    return r;
  };

  const used = new Set<string>();
  return days.map(d => {
    const b = pick(bp, used); const l = pick(lp, used); const dn = pick(dp, used);
    return {
      ...d,
      breakfast: b  ? toMeal(b,  pantry) : null,
      lunch:     l  ? toMeal(l,  pantry) : null,
      dinner:    dn ? toMeal(dn, pantry) : null,
    };
  });
}

// ── Component ─────────────────────────────────────────────────────────────────

@Component({
  selector: 'app-meal-planner',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, MatIconModule, MatProgressSpinnerModule],
  template: `
<div class="mp-page">

  <!-- ── Header ──────────────────────────────────────────────── -->
  <div class="mp-header">
    <div class="mp-header-left">
      <button class="back-btn" routerLink="/">
        <mat-icon style="font-size:16px;width:16px;height:16px">arrow_back</mat-icon>
        Back
      </button>
      <div>
        <h1 class="mp-title">Weekly Meal Plan</h1>
        <div class="mp-date-range">{{ dateRangeLabel() }}</div>
      </div>
    </div>
    <div class="mp-header-right">
      <select class="goal-select" [(ngModel)]="healthGoal">
        <option value="all">All Goals</option>
        <option value="weight-loss">Weight Loss</option>
        <option value="muscle">Muscle Gain</option>
        <option value="energy">Energy Boost</option>
        <option value="heart">Heart Health</option>
      </select>
      <button class="week-nav-btn" (click)="prevWeek()">
        <mat-icon style="font-size:16px">chevron_left</mat-icon>
      </button>
      <button class="week-nav-btn" (click)="nextWeek()">
        <mat-icon style="font-size:16px">chevron_right</mat-icon>
      </button>
      <button class="regen-btn" (click)="regeneratePlan()" [disabled]="regenerating()">
        <mat-icon style="font-size:16px;width:16px;height:16px" [class.spin]="regenerating()">refresh</mat-icon>
        {{ regenerating() ? 'Regenerating…' : 'Regenerate Plan' }}
      </button>
      <button class="grocery-btn" (click)="showGrocery.set(true)">
        <mat-icon style="font-size:16px;width:16px;height:16px">shopping_cart</mat-icon>
        Grocery List
        @if (allMissing().length) {
          <span class="grocery-count">{{ allMissing().length }}</span>
        }
      </button>
    </div>
  </div>

  <!-- ── Insight bento row ────────────────────────────────────── -->
  @if (!loading()) {
    <div class="bento-row">

      <!-- Weekly calories card -->
      <div class="bento-card bento-wide bento-gradient-green">
        <div class="bento-inner d-flex align-items-center gap-3">
          <div class="bento-ring-wrap flex-shrink-0">
            <svg width="72" height="72" viewBox="0 0 72 72">
              <circle cx="36" cy="36" r="28" fill="none" stroke="rgba(255,255,255,0.25)" stroke-width="6"/>
              <circle cx="36" cy="36" r="28" fill="none" stroke="#fff" stroke-width="6"
                stroke-linecap="round"
                [attr.stroke-dasharray]="176"
                [attr.stroke-dashoffset]="176 * (1 - weeklyCalories() / 14000)"
                transform="rotate(-90 36 36)"
                style="transition:stroke-dashoffset 1s ease"/>
            </svg>
            <div class="bento-ring-center">
              <div style="font-size:11px;font-weight:700;color:#fff;line-height:1">{{ (weeklyCalories()/1000).toFixed(1) }}k</div>
              <div style="font-size:8px;color:rgba(255,255,255,0.7)">kcal</div>
            </div>
          </div>
          <div>
            <div class="bento-label" style="color:rgba(255,255,255,0.75)">This Week</div>
            <div class="bento-value" style="color:#fff">{{ weeklyCalories().toLocaleString() }} kcal</div>
            <div style="font-size:11px;color:rgba(255,255,255,0.7);margin-top:3px">Goal: 14,000 kcal / week</div>
            <div style="font-size:11px;color:rgba(255,255,255,0.85);margin-top:4px;font-weight:600">
              {{ weeklyProtein() }}g protein · {{ weeklyFiber() }}g fiber
            </div>
          </div>
        </div>
      </div>

      <!-- Pantry match -->
      <div class="bento-card bento-gradient-teal">
        <div class="bento-inner text-center">
          <div class="bento-icon-wrap mx-auto mb-2" style="background:rgba(255,255,255,0.2)">
            <mat-icon style="color:#fff;font-size:22px">kitchen</mat-icon>
          </div>
          <div class="bento-value" style="color:#fff">{{ pantryMeals() }}/21</div>
          <div class="bento-label" style="color:rgba(255,255,255,0.75)">Pantry Meals</div>
          <div style="font-size:11px;color:rgba(255,255,255,0.65);margin-top:4px">
            {{ Math.round(pantryMeals() / 21 * 100) }}% covered
          </div>
        </div>
      </div>

      <!-- Budget -->
      <div class="bento-card bento-gradient-purple">
        <div class="bento-inner text-center">
          <div class="bento-icon-wrap mx-auto mb-2" style="background:rgba(255,255,255,0.2)">
            <mat-icon style="color:#fff;font-size:22px">savings</mat-icon>
          </div>
          <div class="bento-value" style="color:#fff">{{ '$' + weeklyBudget() }}</div>
          <div class="bento-label" style="color:rgba(255,255,255,0.75)">Est. Budget</div>
          <div style="font-size:11px;color:rgba(255,255,255,0.65);margin-top:4px">
            {{ weeklyBudget() < 50 ? 'Under $50 🎉' : 'Budget-friendly' }}
          </div>
        </div>
      </div>

      <!-- AI tip -->
      <div class="bento-card bento-gradient-amber bento-wide">
        <div class="bento-inner d-flex align-items-center gap-3">
          <div class="bento-icon-wrap flex-shrink-0" style="background:rgba(255,255,255,0.2);width:44px;height:44px">
            <mat-icon style="color:#fff;font-size:24px">psychology</mat-icon>
          </div>
          <div>
            <div class="bento-label" style="color:rgba(255,255,255,0.75)">AI Insight</div>
            <div style="font-size:13px;color:#fff;line-height:1.5">{{ aiTip() }}</div>
          </div>
        </div>
      </div>

    </div>
  }

  <!-- ── Main layout ──────────────────────────────────────────── -->
  <div class="mp-body">

    <!-- Calendar area -->
    <div class="calendar-area">

      @if (loading()) {
        <div class="mp-loading">
          <mat-spinner diameter="40" style="margin:0 auto 16px"></mat-spinner>
          <div style="font-size:14px;color:#6b7c6b">Generating your personalized meal plan…</div>
        </div>
      } @else {

        <!-- Mobile day tabs -->
        <div class="day-tabs d-md-none">
          @for (day of weekPlan(); track day.day) {
            <button class="day-tab" [class.day-tab-active]="selectedDay() === day.day"
              [class.day-tab-today]="day.isToday"
              (click)="selectedDay.set(day.day)">
              <div class="day-tab-name">{{ day.day }}</div>
              <div class="day-tab-date">{{ day.dateLabel }}</div>
            </button>
          }
        </div>

        <!-- Mobile: single day view -->
        <div class="mobile-day-view d-md-none">
          @for (day of weekPlan(); track day.day; let di = $index) {
            @if (selectedDay() === day.day) {
              <div class="mobile-meals fade-in">
                @for (mt of mealTypes; track mt.key) {
                  <div class="mobile-meal-section">
                    <div class="mobile-meal-label">
                      <mat-icon style="font-size:15px;color:#4caf50">{{ mt.icon }}</mat-icon>
                      {{ mt.label }}
                    </div>
                    @if (getMeal(day, mt.key); as meal) {
                      <div class="meal-card-mobile" (click)="openMealDetail(meal)">
                        <img [src]="meal.imageUrl" class="meal-card-mobile-img"
                             (error)="$any($event.target).src = fallbackImg">
                        <div class="meal-card-mobile-overlay">
                          <div class="d-flex align-items-start justify-content-between mb-auto">
                            <span class="prep-chip">{{ meal.prepTime }}m</span>
                            <div class="d-flex gap-1">
                              <button class="meal-icon-btn" (click)="$event.stopPropagation(); toggleLock(di, mt.key)">
                                <mat-icon style="font-size:13px">{{ meal.locked ? 'lock' : 'lock_open' }}</mat-icon>
                              </button>
                              <button class="meal-icon-btn" (click)="$event.stopPropagation(); shuffleMeal(di, mt.key)"
                                [disabled]="meal.locked">
                                <mat-icon style="font-size:13px">refresh</mat-icon>
                              </button>
                            </div>
                          </div>
                          <div>
                            @if (meal.inPantry) {
                              <span class="pantry-pill">✓ In pantry</span>
                            }
                            <div class="meal-card-title">{{ meal.title }}</div>
                            <div class="meal-card-macros">
                              {{ meal.calories }} cal · {{ meal.protein }}g protein · {{ meal.prepTime }}m
                            </div>
                          </div>
                        </div>
                      </div>
                    }
                  </div>
                }
              </div>
            }
          }
        </div>

        <!-- Desktop: full 7-day grid -->
        <div class="cal-grid d-none d-md-grid">
          <!-- Corner -->
          <div class="cal-corner"></div>
          <!-- Day headers -->
          @for (day of weekPlan(); track day.day) {
            <div class="cal-day-hdr" [class.cal-today]="day.isToday">
              <div class="cal-day-name">{{ day.day }}</div>
              <div class="cal-day-date">{{ day.dateLabel }}</div>
              @if (day.isToday) { <div class="today-dot"></div> }
            </div>
          }
          <!-- Meal rows -->
          @for (mt of mealTypes; track mt.key) {
            <div class="cal-row-label">
              <mat-icon style="font-size:16px;color:#4caf50;display:block;margin:0 auto 4px">{{ mt.icon }}</mat-icon>
              <span>{{ mt.label }}</span>
            </div>
            @for (day of weekPlan(); track day.day; let di = $index) {
              <div class="cal-slot" [class.cal-today-slot]="day.isToday">
                @if (getMeal(day, mt.key); as meal) {
                  <div class="meal-card" [class.meal-locked]="meal.locked"
                    (click)="openMealDetail(meal)">
                    <img [src]="meal.imageUrl" class="meal-card-img"
                         (error)="$any($event.target).src = fallbackImg">
                    <div class="meal-card-gradient"></div>
                    <div class="meal-card-content">
                      <div class="meal-card-top-row">
                        <span class="prep-chip">{{ meal.prepTime }}m</span>
                        <div class="d-flex gap-1">
                          <button class="meal-icon-btn" (click)="$event.stopPropagation(); toggleLock(di, mt.key)"
                            [title]="meal.locked ? 'Unlock' : 'Lock this meal'">
                            <mat-icon style="font-size:12px">{{ meal.locked ? 'lock' : 'lock_open' }}</mat-icon>
                          </button>
                          <button class="meal-icon-btn" (click)="$event.stopPropagation(); shuffleMeal(di, mt.key)"
                            [disabled]="meal.locked" title="Pick different meal">
                            <mat-icon style="font-size:12px">refresh</mat-icon>
                          </button>
                        </div>
                      </div>
                      <div class="meal-card-bottom-row">
                        @if (meal.inPantry) { <span class="pantry-pill">✓ pantry</span> }
                        <div class="meal-card-title">{{ meal.title }}</div>
                        <div class="meal-card-macros">{{ meal.calories }}cal · {{ meal.protein }}g</div>
                      </div>
                    </div>
                  </div>
                } @else {
                  <div class="cal-empty" (click)="shuffleMeal(di, mt.key)">
                    <mat-icon style="font-size:20px;color:#c8e6c9">add_circle</mat-icon>
                  </div>
                }
              </div>
            }
          }
        </div>

      }
    </div>

    <!-- ── Right sidebar ──────────────────────────────────────── -->
    <div class="mp-sidebar">

      <!-- Today's nutrition -->
      <div class="sidebar-glass-card">
        <div class="scrd-hdr">
          <mat-icon style="font-size:18px;color:#4caf50">bar_chart</mat-icon>
          <span class="scrd-title">Today's Goals</span>
        </div>
        @if (todayPlan()) {
          <div class="d-flex align-items-center gap-3 mb-3">
            <!-- Daily calorie ring -->
            <div class="daily-ring-wrap flex-shrink-0">
              <svg width="64" height="64" viewBox="0 0 64 64">
                <circle cx="32" cy="32" r="26" fill="none" stroke="#e8f5e9" stroke-width="5"/>
                <circle cx="32" cy="32" r="26" fill="none" stroke="#4caf50" stroke-width="5"
                  stroke-linecap="round"
                  [attr.stroke-dasharray]="163.4"
                  [attr.stroke-dashoffset]="163.4 * (1 - Math.min(todayCalories() / 2000, 1))"
                  transform="rotate(-90 32 32)"
                  style="transition:stroke-dashoffset 0.8s ease"/>
              </svg>
              <div class="daily-ring-label">
                <div style="font-size:11px;font-weight:700;color:#2e7d32">{{ todayCalories() }}</div>
                <div style="font-size:8px;color:#9e9e9e">kcal</div>
              </div>
            </div>
            <div class="flex-fill">
              <div style="font-size:12px;color:#6b7c6b;margin-bottom:2px">Calories Today</div>
              <div style="font-size:15px;font-weight:700;color:#1a2a1a">{{ todayCalories() }} / 2,000</div>
            </div>
          </div>
          <!-- Protein bar -->
          <div class="macro-bar-wrap">
            <div class="d-flex justify-content-between mb-1">
              <span style="font-size:11px;font-weight:600;color:#6b7c6b">Protein</span>
              <span style="font-size:11px;font-weight:700;color:#1565c0">{{ todayProtein() }}g / 80g</span>
            </div>
            <div class="macro-bar-track">
              <div class="macro-bar-fill" style="background:#1565c0"
                [style.width]="Math.min(todayProtein() / 80 * 100, 100) + '%'"></div>
            </div>
          </div>
          <!-- Fiber bar -->
          <div class="macro-bar-wrap mt-2">
            <div class="d-flex justify-content-between mb-1">
              <span style="font-size:11px;font-weight:600;color:#6b7c6b">Fiber</span>
              <span style="font-size:11px;font-weight:700;color:#00897b">{{ todayFiber() }}g / 25g</span>
            </div>
            <div class="macro-bar-track">
              <div class="macro-bar-fill" style="background:#00897b"
                [style.width]="Math.min(todayFiber() / 25 * 100, 100) + '%'"></div>
            </div>
          </div>
        } @else {
          <p style="font-size:12px;color:#9e9e9e;text-align:center;margin:12px 0">Plan your week to see daily goals.</p>
        }
      </div>

      <!-- Water tracker -->
      <div class="sidebar-glass-card mt-3">
        <div class="scrd-hdr">
          <mat-icon style="font-size:18px;color:#29b6f6">water_drop</mat-icon>
          <span class="scrd-title">Water Tracker</span>
          <span class="ms-auto" style="font-size:12px;color:#29b6f6;font-weight:700">{{ waterGlasses() }}/8</span>
        </div>
        <div class="water-glasses">
          @for (i of range(8); track i) {
            <button class="water-glass" [class.water-filled]="i < waterGlasses()"
              (click)="setWater(i + 1)" title="{{ i + 1 }} glass(es)">
              <mat-icon style="font-size:20px">{{ i < waterGlasses() ? 'local_drink' : 'water_drop' }}</mat-icon>
            </button>
          }
        </div>
        <div style="font-size:11px;text-align:center;margin-top:8px"
          [style.color]="waterGlasses() >= 8 ? '#2e7d32' : '#9e9e9e'">
          {{ waterGlasses() >= 8 ? '🎉 Daily goal reached!' : waterGlasses() + ' / 8 glasses today' }}
        </div>
      </div>

      <!-- Missing ingredients -->
      @if (allMissing().length > 0) {
        <div class="sidebar-glass-card mt-3">
          <div class="scrd-hdr">
            <mat-icon style="font-size:18px;color:#f57c00">shopping_bag</mat-icon>
            <span class="scrd-title">Need to Buy</span>
            <span class="ms-auto" style="font-size:11px;color:#f57c00;font-weight:700">{{ allMissing().length }} items</span>
          </div>
          <div class="missing-list">
            @for (item of allMissing().slice(0, 7); track item) {
              <div class="missing-item">
                <mat-icon style="font-size:13px;color:#f57c00">fiber_manual_record</mat-icon>
                <span style="font-size:12px;color:#1a2a1a;text-transform:capitalize">{{ item }}</span>
              </div>
            }
            @if (allMissing().length > 7) {
              <div style="font-size:11px;color:#9e9e9e;margin-top:6px">+{{ allMissing().length - 7 }} more items</div>
            }
          </div>
          <button class="view-grocery-btn mt-3" (click)="showGrocery.set(true)">
            <mat-icon style="font-size:14px;width:14px;height:14px">shopping_cart</mat-icon>
            View Full Grocery List
          </button>
        </div>
      }

    </div>

  </div>

  <!-- ── Grocery List Modal ───────────────────────────────────── -->
  @if (showGrocery()) {
    <div class="modal-backdrop" (click)="showGrocery.set(false)">
      <div class="grocery-modal" (click)="$event.stopPropagation()">
        <div class="grocery-modal-hdr">
          <div>
            <h2 style="font-size:18px;font-weight:800;color:#1a2a1a;margin:0">Grocery List</h2>
            <p style="font-size:12px;color:#6b7c6b;margin:3px 0 0">{{ allMissing().length }} items for this week's plan</p>
          </div>
          <button class="modal-close" (click)="showGrocery.set(false)">
            <mat-icon style="font-size:20px;color:#6b7c6b">close</mat-icon>
          </button>
        </div>
        <div class="grocery-list">
          @for (item of allMissing(); track item) {
            <div class="grocery-item" [class.grocery-checked]="checkedItems().has(item)"
              (click)="toggleChecked(item)">
              <mat-icon style="font-size:20px"
                [style.color]="checkedItems().has(item) ? '#4caf50' : '#bdbdbd'">
                {{ checkedItems().has(item) ? 'check_circle' : 'radio_button_unchecked' }}
              </mat-icon>
              <span style="font-size:14px;font-weight:500;text-transform:capitalize"
                [style.text-decoration]="checkedItems().has(item) ? 'line-through' : 'none'"
                [style.color]="checkedItems().has(item) ? '#9e9e9e' : '#1a2a1a'">
                {{ item }}
              </span>
            </div>
          }
        </div>
        <div class="grocery-modal-footer">
          <button class="grocery-clear-btn" (click)="clearChecked()">
            Clear All
          </button>
          <button class="grocery-add-btn" routerLink="/pantry" (click)="showGrocery.set(false)">
            <mat-icon style="font-size:16px;width:16px;height:16px">add_shopping_cart</mat-icon>
            Add to Pantry
          </button>
        </div>
      </div>
    </div>
  }

  <!-- ── Meal detail modal ─────────────────────────────────────── -->
  @if (detailMeal()) {
    <div class="modal-backdrop" (click)="detailMeal.set(null)">
      <div class="meal-detail-modal" (click)="$event.stopPropagation()">
        <div class="meal-detail-img-wrap">
          <img [src]="detailMeal()!.imageUrl" class="meal-detail-img"
               (error)="$any($event.target).src = fallbackImg">
          <div class="meal-detail-img-overlay">
            <div class="d-flex flex-wrap gap-2 mb-2">
              <span class="detail-chip chip-time">
                <mat-icon style="font-size:12px">timer</mat-icon> {{ detailMeal()!.prepTime }} min
              </span>
              @if (detailMeal()!.inPantry) {
                <span class="detail-chip chip-pantry">✓ Pantry Ready</span>
              }
            </div>
          </div>
          <button class="modal-close detail-close" (click)="detailMeal.set(null)">
            <mat-icon style="font-size:18px;color:#fff">close</mat-icon>
          </button>
        </div>
        <div class="meal-detail-body">
          <h2 style="font-size:20px;font-weight:800;color:#1a2a1a;margin:0 0 12px">{{ detailMeal()!.title }}</h2>
          <div class="meal-detail-macros">
            <div class="macro-pill"><span class="macro-n">{{ detailMeal()!.calories }}</span><span class="macro-l">Calories</span></div>
            <div class="macro-pill"><span class="macro-n">{{ detailMeal()!.protein }}g</span><span class="macro-l">Protein</span></div>
            <div class="macro-pill"><span class="macro-n">{{ detailMeal()!.fiber }}g</span><span class="macro-l">Fiber</span></div>
            <div class="macro-pill"><span class="macro-n">{{ '$' + Math.round(detailMeal()!.cost) }}</span><span class="macro-l">Est. Cost</span></div>
          </div>
          @if (detailMeal()!.tags.length > 0) {
            <div class="d-flex flex-wrap gap-2 mb-3">
              @for (tag of detailMeal()!.tags; track tag) {
                <span style="background:#e8f5e9;color:#2e7d32;padding:4px 10px;border-radius:10px;font-size:11px;font-weight:600">{{ tag }}</span>
              }
            </div>
          }
          @if (detailMeal()!.missingIngredients.length > 0) {
            <div class="detail-missing">
              <mat-icon style="font-size:16px;color:#f57c00;flex-shrink:0">shopping_cart</mat-icon>
              <span style="font-size:13px;color:#e65100">Need: <strong>{{ detailMeal()!.missingIngredients.join(', ') }}</strong></span>
            </div>
          }
          <button class="view-rec-btn" (click)="viewFullRecipe()">
            View Full Recipe & Instructions
            <mat-icon style="font-size:16px;width:16px;height:16px">arrow_forward</mat-icon>
          </button>
        </div>
      </div>
    </div>
  }

</div>
  `,
  styles: [`
    /* ── Page ────────────────────────────────────────────────── */
    .mp-page {
      min-height: 100vh;
      background: linear-gradient(135deg, #e8f5e9 0%, #f3f0ff 50%, #e3f2fd 100%);
      padding-bottom: 40px;
    }

    /* ── Header ──────────────────────────────────────────────── */
    .mp-header {
      display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap;
      gap: 12px; padding: 16px 20px;
      background: rgba(255,255,255,0.72);
      backdrop-filter: blur(16px);
      border-bottom: 1px solid rgba(255,255,255,0.5);
      position: sticky; top: 0; z-index: 50;
    }
    .mp-header-left { display: flex; align-items: center; gap: 14px; }
    .mp-header-right { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
    .back-btn {
      display: inline-flex; align-items: center; gap: 4px;
      background: transparent; border: none; cursor: pointer;
      font-size: 13px; color: #2e7d32; font-weight: 600; padding: 0;
    }
    .mp-title { font-size: clamp(16px,3vw,20px); font-weight: 800; color: #1a2a1a; margin: 0; }
    .mp-date-range { font-size: 12px; color: #6b7c6b; margin-top: 2px; }
    .goal-select {
      padding: 7px 10px; border: 1.5px solid #e0ede0; border-radius: 10px;
      font-size: 12px; color: #1a2a1a; background: #fff; outline: none; cursor: pointer;
    }
    .week-nav-btn {
      width: 32px; height: 32px; border-radius: 8px;
      background: #fff; border: 1.5px solid #e0ede0;
      display: flex; align-items: center; justify-content: center; cursor: pointer;
    }
    .regen-btn {
      display: inline-flex; align-items: center; gap: 6px;
      background: #2e7d32; color: #fff; border: none; border-radius: 10px;
      padding: 8px 14px; font-size: 13px; font-weight: 600; cursor: pointer;
      transition: background 0.15s;
    }
    .regen-btn:hover { background: #1b5e20; }
    .regen-btn:disabled { opacity: 0.6; cursor: not-allowed; }
    .grocery-btn {
      display: inline-flex; align-items: center; gap: 6px; position: relative;
      background: #fff; border: 1.5px solid #e0ede0; border-radius: 10px;
      padding: 8px 14px; font-size: 13px; font-weight: 600; color: #2e7d32; cursor: pointer;
    }
    .grocery-count {
      background: #f44336; color: #fff; font-size: 9px; font-weight: 700;
      border-radius: 10px; padding: 1px 5px;
    }
    .spin { animation: spin 0.8s linear infinite; }
    @keyframes spin { to { transform: rotate(360deg); } }

    /* ── Bento row ───────────────────────────────────────────── */
    .bento-row {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 12px; padding: 16px 20px 0;
    }
    @media (min-width: 768px) {
      .bento-row { grid-template-columns: 2fr 1fr 1fr 2fr; }
    }
    .bento-card {
      border-radius: 20px; overflow: hidden;
      box-shadow: 0 4px 20px rgba(0,0,0,0.08);
    }
    .bento-wide { grid-column: span 2; }
    @media (min-width: 768px) { .bento-wide { grid-column: span 1; } }
    .bento-inner { padding: 16px; }
    .bento-gradient-green { background: linear-gradient(135deg, #2e7d32, #4caf50); }
    .bento-gradient-teal  { background: linear-gradient(135deg, #00695c, #26a69a); }
    .bento-gradient-purple { background: linear-gradient(135deg, #4a148c, #7b1fa2); }
    .bento-gradient-amber  { background: linear-gradient(135deg, #e65100, #f57c00); }
    .bento-label { font-size: 11px; font-weight: 600; margin-bottom: 3px; }
    .bento-value { font-size: 22px; font-weight: 800; line-height: 1.1; margin-bottom: 2px; }
    .bento-ring-wrap { position: relative; width: 72px; height: 72px; flex-shrink: 0; }
    .bento-ring-center {
      position: absolute; inset: 0;
      display: flex; flex-direction: column; align-items: center; justify-content: center;
    }
    .bento-icon-wrap {
      width: 44px; height: 44px; border-radius: 12px;
      display: flex; align-items: center; justify-content: center;
    }

    /* ── Body ────────────────────────────────────────────────── */
    .mp-body {
      display: flex; gap: 0;
      padding: 16px 20px;
    }
    .calendar-area { flex: 1; min-width: 0; }
    .mp-sidebar { display: none; }
    @media (min-width: 960px) {
      .mp-sidebar { display: block; width: 260px; flex-shrink: 0; padding-left: 16px; }
    }

    /* ── Loading ─────────────────────────────────────────────── */
    .mp-loading {
      text-align: center; padding: 60px 20px;
      background: rgba(255,255,255,0.6); border-radius: 20px;
      backdrop-filter: blur(12px);
    }

    /* ── Mobile day tabs ─────────────────────────────────────── */
    .day-tabs {
      display: flex; gap: 8px; overflow-x: auto;
      padding-bottom: 8px; scrollbar-width: none;
      margin-bottom: 14px;
    }
    .day-tab {
      flex-shrink: 0; text-align: center; padding: 8px 12px;
      border-radius: 12px; border: 1.5px solid rgba(255,255,255,0.6);
      background: rgba(255,255,255,0.5); cursor: pointer;
      backdrop-filter: blur(8px); transition: all 0.15s;
    }
    .day-tab-active {
      background: #2e7d32 !important; border-color: #2e7d32 !important;
    }
    .day-tab-today { border-color: #4caf50; }
    .day-tab-name { font-size: 12px; font-weight: 700; color: #1a2a1a; }
    .day-tab-active .day-tab-name,
    .day-tab-active .day-tab-date { color: #fff !important; }
    .day-tab-date { font-size: 10px; color: #6b7c6b; margin-top: 2px; }

    /* ── Mobile meal view ────────────────────────────────────── */
    .mobile-meals { display: flex; flex-direction: column; gap: 12px; }
    .mobile-meal-section { }
    .mobile-meal-label {
      display: flex; align-items: center; gap: 6px;
      font-size: 12px; font-weight: 700; color: #1a2a1a;
      margin-bottom: 8px;
    }
    .meal-card-mobile {
      position: relative; height: 160px; border-radius: 16px;
      overflow: hidden; cursor: pointer;
      box-shadow: 0 4px 16px rgba(0,0,0,0.12);
    }
    .meal-card-mobile-img {
      width: 100%; height: 100%; object-fit: cover;
    }
    .meal-card-mobile-overlay {
      position: absolute; inset: 0;
      background: linear-gradient(to top, rgba(0,0,0,0.75) 0%, rgba(0,0,0,0.3) 50%, rgba(0,0,0,0.1) 100%);
      padding: 10px 12px;
      display: flex; flex-direction: column;
    }

    /* ── Desktop calendar grid ───────────────────────────────── */
    .cal-grid {
      display: grid;
      grid-template-columns: 64px repeat(7, 1fr);
      gap: 6px;
    }
    .cal-corner { }
    .cal-day-hdr {
      text-align: center; padding: 10px 4px;
      background: rgba(255,255,255,0.6); border-radius: 12px;
      backdrop-filter: blur(8px); position: relative;
    }
    .cal-today {
      background: linear-gradient(135deg, #2e7d32, #4caf50) !important;
    }
    .cal-day-name {
      font-size: 12px; font-weight: 700; color: #1a2a1a;
    }
    .cal-today .cal-day-name, .cal-today .cal-day-date { color: #fff !important; }
    .cal-day-date { font-size: 10px; color: #6b7c6b; margin-top: 2px; }
    .today-dot {
      width: 5px; height: 5px; border-radius: 50%; background: #fff;
      margin: 4px auto 0;
    }
    .cal-row-label {
      display: flex; flex-direction: column; align-items: center; justify-content: center;
      font-size: 10px; font-weight: 700; color: #6b7c6b; text-align: center;
      padding: 4px 2px;
    }
    .cal-slot {
      border-radius: 12px; overflow: hidden; height: 150px;
    }
    .cal-today-slot { box-shadow: 0 0 0 2px #4caf50; border-radius: 12px; }
    .cal-empty {
      width: 100%; height: 100%; display: flex; align-items: center; justify-content: center;
      background: rgba(255,255,255,0.4); cursor: pointer;
      border: 1.5px dashed rgba(46,125,50,0.3); border-radius: 12px;
      transition: background 0.15s;
    }
    .cal-empty:hover { background: rgba(241,248,233,0.8); }

    /* ── Meal card ───────────────────────────────────────────── */
    .meal-card {
      position: relative; width: 100%; height: 100%;
      cursor: pointer; border-radius: 12px; overflow: hidden;
      transition: transform 0.15s, box-shadow 0.15s;
    }
    .meal-card:hover { transform: scale(1.02); box-shadow: 0 6px 20px rgba(0,0,0,0.2); }
    .meal-card-img {
      width: 100%; height: 100%; object-fit: cover; display: block;
    }
    .meal-card-gradient {
      position: absolute; inset: 0;
      background: linear-gradient(to top, rgba(0,0,0,0.78) 0%, rgba(0,0,0,0.3) 50%, rgba(0,0,0,0.08) 100%);
    }
    .meal-locked .meal-card-gradient { background: linear-gradient(to top, rgba(46,125,50,0.82) 0%, rgba(46,125,50,0.4) 50%, rgba(46,125,50,0.1) 100%); }
    .meal-card-content {
      position: absolute; inset: 0; padding: 6px 8px;
      display: flex; flex-direction: column; justify-content: space-between;
    }
    .meal-card-top-row { display: flex; align-items: center; justify-content: space-between; }
    .meal-card-bottom-row { }

    /* ── Shared meal card text elements ──────────────────────── */
    .prep-chip {
      display: inline-flex; align-items: center; gap: 2px;
      background: rgba(0,0,0,0.45); color: #fff;
      font-size: 10px; font-weight: 600;
      padding: 2px 7px; border-radius: 20px;
      backdrop-filter: blur(4px);
    }
    .meal-icon-btn {
      width: 22px; height: 22px; border-radius: 50%;
      background: rgba(0,0,0,0.45); border: none; cursor: pointer;
      display: inline-flex; align-items: center; justify-content: center; color: #fff;
      backdrop-filter: blur(4px); transition: background 0.15s;
    }
    .meal-icon-btn:hover { background: rgba(0,0,0,0.7); }
    .meal-icon-btn:disabled { opacity: 0.4; cursor: not-allowed; }
    .pantry-pill {
      display: inline-block; background: rgba(76,175,80,0.85); color: #fff;
      font-size: 9px; font-weight: 700; padding: 2px 6px; border-radius: 6px;
      margin-bottom: 4px;
    }
    .meal-card-title {
      font-size: 11px; font-weight: 700; color: #fff; line-height: 1.3;
      display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;
    }
    .meal-card-macros { font-size: 9px; color: rgba(255,255,255,0.75); margin-top: 3px; }

    /* ── Sidebar glass cards ─────────────────────────────────── */
    .sidebar-glass-card {
      background: rgba(255,255,255,0.72);
      backdrop-filter: blur(16px);
      -webkit-backdrop-filter: blur(16px);
      border: 1px solid rgba(255,255,255,0.5);
      border-radius: 18px; padding: 14px;
      box-shadow: 0 4px 20px rgba(0,0,0,0.06);
    }
    .scrd-hdr {
      display: flex; align-items: center; gap: 8px; margin-bottom: 12px;
    }
    .scrd-title { font-size: 13px; font-weight: 700; color: #1a2a1a; }
    .daily-ring-wrap { position: relative; width: 64px; height: 64px; }
    .daily-ring-label {
      position: absolute; inset: 0;
      display: flex; flex-direction: column; align-items: center; justify-content: center;
    }
    .macro-bar-wrap { }
    .macro-bar-track { height: 6px; background: #f0f0f0; border-radius: 6px; overflow: hidden; }
    .macro-bar-fill { height: 100%; border-radius: 6px; transition: width 0.8s ease; }

    /* ── Water tracker ───────────────────────────────────────── */
    .water-glasses {
      display: grid; grid-template-columns: repeat(4, 1fr); gap: 6px;
    }
    .water-glass {
      display: flex; align-items: center; justify-content: center;
      height: 40px; border-radius: 10px; border: none; cursor: pointer;
      background: rgba(41,182,246,0.1); transition: all 0.15s;
    }
    .water-glass mat-icon { color: #b3e5fc; transition: color 0.15s; }
    .water-filled { background: rgba(41,182,246,0.18) !important; }
    .water-filled mat-icon { color: #29b6f6 !important; }

    /* ── Missing / grocery ───────────────────────────────────── */
    .missing-list { display: flex; flex-direction: column; gap: 6px; }
    .missing-item { display: flex; align-items: center; gap: 6px; }
    .view-grocery-btn {
      width: 100%; display: flex; align-items: center; justify-content: center; gap: 6px;
      background: #fff3e0; color: #f57c00; border: 1.5px solid #ffcc80;
      border-radius: 10px; padding: 9px; font-size: 12px; font-weight: 600; cursor: pointer;
    }

    /* ── Modal ───────────────────────────────────────────────── */
    .modal-backdrop {
      position: fixed; inset: 0; background: rgba(0,0,0,0.5);
      z-index: 300; display: flex; align-items: flex-end; justify-content: center;
    }
    @media (min-width: 768px) {
      .modal-backdrop { align-items: center; }
    }
    .modal-close {
      width: 32px; height: 32px; border-radius: 50%; border: none; cursor: pointer;
      display: flex; align-items: center; justify-content: center;
      background: rgba(255,255,255,0.85);
    }

    /* Grocery modal */
    .grocery-modal {
      background: #fff; border-radius: 24px 24px 0 0; width: 100%;
      max-height: 80vh; overflow-y: auto; padding: 0 0 24px;
    }
    @media (min-width: 768px) {
      .grocery-modal { border-radius: 24px; max-width: 480px; max-height: 70vh; }
    }
    .grocery-modal-hdr {
      display: flex; align-items: flex-start; justify-content: space-between;
      padding: 20px 20px 14px; border-bottom: 1px solid #f0f4f0; position: sticky; top: 0; background: #fff;
    }
    .grocery-list { padding: 12px 20px; display: flex; flex-direction: column; gap: 4px; }
    .grocery-item {
      display: flex; align-items: center; gap: 12px;
      padding: 10px 12px; border-radius: 10px; cursor: pointer; transition: background 0.12s;
    }
    .grocery-item:hover { background: #f8faf8; }
    .grocery-checked { background: #f8fdf8; }
    .grocery-modal-footer {
      display: flex; gap: 10px; padding: 12px 20px 0; border-top: 1px solid #f0f4f0;
      position: sticky; bottom: 0; background: #fff;
    }
    .grocery-clear-btn {
      flex: 1; background: transparent; border: 1.5px solid #e0e0e0; color: #6b7c6b;
      border-radius: 10px; padding: 10px; font-size: 13px; font-weight: 600; cursor: pointer;
    }
    .grocery-add-btn {
      flex: 2; display: flex; align-items: center; justify-content: center; gap: 6px;
      background: #2e7d32; color: #fff; border: none;
      border-radius: 10px; padding: 10px; font-size: 13px; font-weight: 600; cursor: pointer;
    }

    /* Meal detail modal */
    .meal-detail-modal {
      background: #fff; border-radius: 24px 24px 0 0; width: 100%;
      max-height: 88vh; overflow-y: auto;
    }
    @media (min-width: 768px) {
      .meal-detail-modal { border-radius: 24px; max-width: 480px; max-height: 80vh; }
    }
    .meal-detail-img-wrap { position: relative; height: 220px; }
    .meal-detail-img { width: 100%; height: 100%; object-fit: cover; }
    .meal-detail-img-overlay {
      position: absolute; bottom: 0; left: 0; right: 0;
      background: linear-gradient(to top, rgba(0,0,0,0.6), transparent);
      padding: 12px 16px;
    }
    .detail-close { position: absolute; top: 12px; right: 12px; background: rgba(0,0,0,0.4); }
    .detail-close mat-icon { color: #fff; }
    .detail-chip {
      display: inline-flex; align-items: center; gap: 4px;
      padding: 4px 10px; border-radius: 20px; font-size: 11px; font-weight: 700;
    }
    .chip-time { background: rgba(0,0,0,0.5); color: #fff; }
    .chip-pantry { background: rgba(76,175,80,0.85); color: #fff; }
    .meal-detail-body { padding: 16px 20px 28px; }
    .meal-detail-macros {
      display: grid; grid-template-columns: repeat(4, 1fr);
      gap: 8px; margin-bottom: 14px;
    }
    .macro-pill {
      text-align: center; background: #f8f8f8; border-radius: 10px; padding: 10px 6px;
    }
    .macro-n { display: block; font-size: 16px; font-weight: 800; color: #1a2a1a; }
    .macro-l { display: block; font-size: 9px; color: #9e9e9e; margin-top: 2px; text-transform: uppercase; }
    .detail-missing {
      display: flex; align-items: flex-start; gap: 8px;
      background: #fff8f0; border-radius: 10px; padding: 10px 12px; margin-bottom: 14px;
    }
    .view-rec-btn {
      width: 100%; display: flex; align-items: center; justify-content: center; gap: 8px;
      background: #2e7d32; color: #fff; border: none; border-radius: 12px;
      padding: 13px; font-size: 14px; font-weight: 700; cursor: pointer;
    }

    /* ── Animations ──────────────────────────────────────────── */
    .fade-in { animation: fadeIn 0.3s ease; }
    @keyframes fadeIn { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: none; } }
  `],
})
export class MealPlannerComponent implements OnInit {
  router  = inject(Router);
  auth    = inject(AuthService);
  private http          = inject(HttpClient);
  private pantryService = inject(PantryService);

  readonly Math        = Math;
  readonly fallbackImg = 'https://images.unsplash.com/photo-1512621776951-a57141f2eefd?w=400&auto=format&fit=crop&q=80';


  readonly mealTypes = [
    { key: 'breakfast' as const, label: 'Breakfast', icon: 'free_breakfast' },
    { key: 'lunch'     as const, label: 'Lunch',     icon: 'lunch_dining'   },
    { key: 'dinner'    as const, label: 'Dinner',    icon: 'dinner_dining'  },
  ];

  loading      = signal(true);
  regenerating = signal(false);
  weekOffset   = signal(0);
  selectedDay  = signal('Mon');
  healthGoal   = 'all';
  waterGlasses = signal(0);
  showGrocery  = signal(false);
  detailMeal   = signal<PlanMeal | null>(null);
  weekPlan     = signal<DayPlan[]>([]);
  checkedItems = signal<Set<string>>(new Set());

  private allRecipes  : ApiRecipe[] = [];
  private pantryNames : string[]    = [];

  // ── Computed ──────────────────────────────────────────────────────────────
  weeklyCalories = computed(() => this.weekPlan().reduce((s, d) =>
    s + (d.breakfast?.calories ?? 0) + (d.lunch?.calories ?? 0) + (d.dinner?.calories ?? 0), 0));
  weeklyProtein  = computed(() => this.weekPlan().reduce((s, d) =>
    s + (d.breakfast?.protein ?? 0) + (d.lunch?.protein ?? 0) + (d.dinner?.protein ?? 0), 0));
  weeklyFiber    = computed(() => this.weekPlan().reduce((s, d) =>
    s + (d.breakfast?.fiber ?? 0) + (d.lunch?.fiber ?? 0) + (d.dinner?.fiber ?? 0), 0));
  pantryMeals    = computed(() => this.weekPlan().reduce((s, d) =>
    s + (d.breakfast?.inPantry ? 1 : 0) + (d.lunch?.inPantry ? 1 : 0) + (d.dinner?.inPantry ? 1 : 0), 0));
  weeklyBudget   = computed(() => Math.round(this.weekPlan().reduce((s, d) =>
    s + (d.breakfast?.cost ?? 0) + (d.lunch?.cost ?? 0) + (d.dinner?.cost ?? 0), 0)));
  allMissing     = computed(() => {
    const s = new Set<string>();
    this.weekPlan().forEach(d => [d.breakfast, d.lunch, d.dinner].forEach(m => m?.missingIngredients.forEach(i => s.add(i))));
    return Array.from(s);
  });
  todayPlan = computed(() => {
    const t = new Date(); t.setHours(0,0,0,0);
    return this.weekPlan().find(d => d.date.getTime() === t.getTime()) ?? this.weekPlan()[0] ?? null;
  });
  todayCalories = computed(() => { const d = this.todayPlan(); return d ? (d.breakfast?.calories ?? 0) + (d.lunch?.calories ?? 0) + (d.dinner?.calories ?? 0) : 0; });
  todayProtein  = computed(() => { const d = this.todayPlan(); return d ? (d.breakfast?.protein ?? 0) + (d.lunch?.protein ?? 0) + (d.dinner?.protein ?? 0) : 0; });
  todayFiber    = computed(() => { const d = this.todayPlan(); return d ? (d.breakfast?.fiber ?? 0) + (d.lunch?.fiber ?? 0) + (d.dinner?.fiber ?? 0) : 0; });
  dateRangeLabel = computed(() => {
    const p = this.weekPlan();
    if (!p.length) return '';
    return `${p[0].date.toLocaleDateString('en-US',{month:'short',day:'numeric'})} – ${p[6].date.toLocaleDateString('en-US',{month:'short',day:'numeric'})}`;
  });
  aiTip = computed(() => {
    const pantry = this.pantryNames.slice(0, 2).join(' and ');
    const miss   = this.allMissing();
    const prot   = this.weeklyProtein();
    if (prot < 600) return `You're low on protein this week (${prot}g). Add chicken, lentils, or tofu to boost it.`;
    if (pantry) return `You already have ${pantry} — ${miss.length > 0 ? `just grab ${miss.slice(0,2).join(' and ')} to complete the plan.` : 'your pantry covers this week well!'}`;
    return `This week's plan is optimized for ${this.healthGoal === 'all' ? 'balanced nutrition' : this.healthGoal.replace('-',' ')}. Estimated budget: $${this.weeklyBudget()}.`;
  });

  // ── Lifecycle ─────────────────────────────────────────────────────────────
  ngOnInit() {
    const dayNames = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
    const todayName = dayNames[new Date().getDay()];
    this.selectedDay.set(todayName === 'Sun' ? 'Mon' : todayName);
    this.loadPlan();
  }

  loadPlan() {
    this.loading.set(true);
    const recipes$ = this.http.get<ApiRecipe[]>(`${environment.apiUrl}/recipes?limit=100`).pipe(catchError(() => of([] as ApiRecipe[])));
    const pantry$  = this.auth.isLoggedIn() ? this.pantryService.list().pipe(catchError(() => of([]))) : of([]);
    forkJoin({ recipes: recipes$, pantry: pantry$ }).subscribe(({ recipes, pantry }) => {
      this.allRecipes  = recipes as ApiRecipe[];
      this.pantryNames = (pantry as PantryItem[]).map(p => p.ingredient_name.toLowerCase());
      const plan = buildPlan(this.allRecipes, this.pantryNames, this.weekOffset());
      this.weekPlan.set(plan);
      this.loading.set(false);
    });
  }

  regeneratePlan() {
    this.regenerating.set(true);
    setTimeout(() => {
      // Keep locked meals, reshuffle the rest
      const current = this.weekPlan();
      const newPlan = buildPlan(this.allRecipes, this.pantryNames, this.weekOffset());
      newPlan.forEach((day, i) => {
        if (current[i]?.breakfast?.locked) day.breakfast = current[i].breakfast;
        if (current[i]?.lunch?.locked)     day.lunch     = current[i].lunch;
        if (current[i]?.dinner?.locked)    day.dinner    = current[i].dinner;
      });
      this.weekPlan.set(newPlan);
      this.regenerating.set(false);
    }, 900);
  }

  prevWeek() { this.weekOffset.update(o => o - 1); this.loadPlan(); }
  nextWeek() { this.weekOffset.update(o => o + 1); this.loadPlan(); }

  getMeal(day: DayPlan, type: 'breakfast' | 'lunch' | 'dinner'): PlanMeal | null {
    return day[type];
  }

  shuffleMeal(dayIndex: number, type: 'breakfast' | 'lunch' | 'dinner') {
    const plan = this.weekPlan().map(d => ({ ...d }));
    const day  = plan[dayIndex];
    if (!day || day[type]?.locked) return;
    const usedIds = new Set(plan.flatMap(d => [d.breakfast?.id, d.lunch?.id, d.dinner?.id]).filter(Boolean));
    const avail = this.allRecipes.filter(r => !usedIds.has(r.id));
    const r = avail.length ? avail[Math.floor(Math.random() * avail.length)] : this.allRecipes[Math.floor(Math.random() * this.allRecipes.length)];
    if (r) day[type] = toMeal(r, this.pantryNames);
    this.weekPlan.set(plan);
  }

  toggleLock(dayIndex: number, type: 'breakfast' | 'lunch' | 'dinner') {
    const plan = this.weekPlan().map(d => ({ ...d }));
    const meal = plan[dayIndex]?.[type];
    if (meal) plan[dayIndex][type] = { ...meal, locked: !meal.locked };
    this.weekPlan.set(plan);
  }

  openMealDetail(meal: PlanMeal) { this.detailMeal.set(meal); }

  viewFullRecipe() {
    const meal = this.detailMeal();
    if (!meal) return;
    this.detailMeal.set(null);
    this.router.navigate(['/meals'], { queryParams: { tab: 'explore', recipe: meal.title } });
  }

  setWater(n: number) { this.waterGlasses.set(n === this.waterGlasses() ? n - 1 : n); }

  toggleChecked(item: string) {
    const s = new Set(this.checkedItems());
    s.has(item) ? s.delete(item) : s.add(item);
    this.checkedItems.set(s);
  }

  clearChecked() { this.checkedItems.set(new Set()); }

  range(n: number): number[] { return Array.from({ length: n }, (_, i) => i); }
}
