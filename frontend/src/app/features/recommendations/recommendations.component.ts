import { Component, inject, signal, computed, OnInit } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { MatIconModule } from '@angular/material/icon';
import { forkJoin, of } from 'rxjs';
import { catchError } from 'rxjs/operators';
import { AuthService } from '../../core/services/auth.service';
import { PantryService, PantryItem } from '../../core/services/pantry.service';
import { environment } from '../../../environments/environment';

// ── Types ─────────────────────────────────────────────────────────────────────

interface RecipeIngredientDetail {
  ingredient: { id: string; name: string; category: string | null };
  quantity: string | null; unit: string | null; is_optional: boolean;
}
interface FullRecipe {
  id: string; title: string; description: string | null; instructions: string | null;
  meal_type: string | null; prep_time_minutes: number | null; cook_time_minutes: number | null;
  servings: number; ailment_tags: string[]; health_benefits: string[]; dietary_labels: string[];
  efficacy_score: number; recipe_ingredients: RecipeIngredientDetail[];
}
interface PantryRecipeMatch {
  recipe: FullRecipe; matchPct: number; canMake: boolean;
  ingredients: { name: string; have: boolean; optional: boolean }[];
  missingIngredients: string[];
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const STOP = new Set(['and','the','with','for','from','made','style','easy','quick','healthy','organic','fresh']);

function recipeImgUrl(title: string, mealType: string | null): string {
  const words = title.toLowerCase().replace(/[^a-z0-9\s]/g, '').split(/\s+/)
    .filter(w => w.length > 3 && !STOP.has(w)).slice(0, 2);
  const q = words.length ? words.join(',') : (mealType ?? 'food');
  return `https://source.unsplash.com/featured/400x240/?food,${encodeURIComponent(q)}`;
}


function estimateNutrition(r: FullRecipe): { protein: number; fiber: number; calories: number } {
  const protein  = r.health_benefits.some(b => /protein|muscle/i.test(b)) ? 24 : 13;
  const fiber    = r.ailment_tags.some(t => /gut|digest|fiber/i.test(t)) ? 10 : 5;
  const calories = r.meal_type === 'snack' ? 180 : r.meal_type === 'beverage' ? 90 : 370;
  return { protein, fiber, calories };
}

function parseSteps(instructions: string | null): string[] {
  if (!instructions) return [];
  return instructions.split(/\n+/).map(s => s.replace(/^\d+[\.\)]\s*/, '').trim()).filter(Boolean);
}

// ── Component ─────────────────────────────────────────────────────────────────

@Component({
  selector: 'app-recommendations',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, MatIconModule],
  template: `
<div class="rec-wrapper">

  <!-- ── Sticky search bar ──────────────────────────────────── -->
  <div class="rec-topbar">
    <div class="rec-search-box">
      <mat-icon class="rec-search-ico">search</mat-icon>
      <input class="rec-search-input" [(ngModel)]="searchText"
        placeholder="Search recipes, ingredients, health goals…"
        (ngModelChange)="localSearch.set($event)">
      @if (localSearch()) {
        <button class="search-clear-btn" (click)="searchText = ''; localSearch.set('')">
          <mat-icon style="font-size:16px;color:#9e9e9e">close</mat-icon>
        </button>
      }
    </div>
    <button class="topbar-notif-btn" (click)="router.navigate(['/insights'])">
      <mat-icon style="font-size:22px;color:#2e7d32">notifications</mat-icon>
      <span class="topbar-notif-dot">3</span>
    </button>
  </div>

  <!-- ── 2-col layout ───────────────────────────────────────── -->
  <div class="rec-layout">

    <!-- ── Main content ───────────────────────────────────────── -->
    <div class="rec-main">

      <!-- Page header -->
      <button class="back-link" routerLink="/">
        <mat-icon style="font-size:15px;width:15px;height:15px">arrow_back</mat-icon>
        Back to Home
      </button>
      <h1 class="rec-page-title">
        Personalized Recommendations
        <mat-icon style="font-size:20px;color:#4caf50;vertical-align:middle;margin-left:6px">eco</mat-icon>
      </h1>
      <p class="rec-page-sub">Curated just for your health goals, preferences and pantry.</p>

      <!-- Filter chips -->
      <div class="chip-row">
        @for (chip of filterChips; track chip.key) {
          <button class="chip-pill" [class.chip-pill-active]="activeFilterChip() === chip.key"
            (click)="activeFilterChip.set(chip.key)">
            <mat-icon style="font-size:13px;width:13px;height:13px">{{ chip.icon }}</mat-icon>
            {{ chip.label }}
          </button>
        }
      </div>

      <!-- ── Quick & Easy ─────────────────────────────────────── -->
      @if (!pantryLoading() && !localSearch() && quickEasyRecipes().length > 0) {
        <div class="rec-section" style="margin-bottom:28px">
          <div class="rec-section-hdr">
            <h2 class="rec-section-title d-flex align-items-center gap-2">
              <mat-icon style="font-size:18px;width:18px;height:18px;color:#f57c00;vertical-align:middle">bolt</mat-icon>
              Quick &amp; Easy
            </h2>
            <span class="rec-count">Under 20 mins</span>
          </div>
          <div class="qe-row">
            @for (pr of quickEasyRecipes(); track pr.recipe.id) {
              <div class="qe-card" (click)="openModal(pr)">
                <img [src]="recipeImgUrl(pr.recipe.title, pr.recipe.meal_type)"
                     [alt]="pr.recipe.title" class="qe-img"
                     (error)="$any($event.target).src = fallbackImg">
                <div class="qe-body">
                  <div class="qe-title">{{ pr.recipe.title }}</div>
                  <div class="qe-meta">
                    <mat-icon style="font-size:11px;width:11px;height:11px;color:#f57c00">timer</mat-icon>
                    {{ totalMin(pr.recipe) }} min
                  </div>
                </div>
              </div>
            }
          </div>
        </div>
      }

      <!-- ── Recommended Meals ───────────────────────────────── -->
      <div class="rec-section">
        <div class="rec-section-hdr">
          <h2 class="rec-section-title">Recommended Meals</h2>
          @if (!pantryLoading() && displayRecipes().length > 0) {
            <span class="rec-count">{{ displayRecipes().length }} recipes</span>
          }
        </div>

        @if (pantryLoading()) {
          <div class="meals-grid">
            @for (s of [1,2,3,4,6]; track s) {
              <div class="rec-card">
                <div class="skeleton" style="height:150px;border-radius:12px 12px 0 0"></div>
                <div class="rec-card-body">
                  <div class="skeleton mb-2" style="height:14px;width:70%;border-radius:6px"></div>
                  <div class="skeleton mb-1" style="height:11px;width:90%;border-radius:4px"></div>
                  <div class="skeleton" style="height:11px;width:60%;border-radius:4px"></div>
                </div>
              </div>
            }
          </div>

        } @else if (activeFilterChip() !== 'all' && filteredPantryRecipes().length > 0 && displayRecipes().length === 0) {
          <div class="empty-meals">
            <mat-icon style="font-size:44px;width:44px;height:44px;color:#c8e6c9;display:block;margin:0 auto 12px">filter_alt_off</mat-icon>
            <div class="fw-semibold" style="color:#2e7d32;margin-bottom:6px">No recipes match "{{ activeChipLabel() }}"</div>
            <p style="font-size:13px;color:#9e9e9e;margin:0 0 16px">None of your recipes match this filter yet. Try a different one.</p>
            <button class="cta-btn" (click)="activeFilterChip.set('all')">Show All Recipes</button>
          </div>

        } @else if (localSearch() && displayRecipes().length === 0) {
          <div class="empty-meals">
            <mat-icon style="font-size:44px;width:44px;height:44px;color:#c8e6c9;display:block;margin:0 auto 12px">search_off</mat-icon>
            <div class="fw-semibold" style="color:#2e7d32;margin-bottom:6px">No results for "{{ localSearch() }}"</div>
            <p style="font-size:13px;color:#9e9e9e;margin:0 0 16px">Try a different search term.</p>
            <button class="cta-btn" (click)="searchText = ''; localSearch.set('')">Clear Search</button>
          </div>

        } @else if (displayRecipes().length > 0) {
          <div class="meals-grid">
            @for (pr of displayRecipes(); track pr.recipe.id) {
              <div class="rec-card" (click)="openModal(pr)">
                <div class="rec-card-img-wrap">
                  <img [src]="recipeImgUrl(pr.recipe.title, pr.recipe.meal_type)"
                       [alt]="pr.recipe.title" class="rec-card-img"
                       (error)="$any($event.target).src = fallbackImg">
                  <span class="time-badge">
                    <mat-icon style="font-size:10px;width:10px;height:10px">timer</mat-icon>
                    {{ totalMin(pr.recipe) || '?' }} min
                  </span>
                  <button class="card-heart" (click)="$event.stopPropagation(); toggleHeart(pr.recipe.id)">
                    <mat-icon style="font-size:16px" [style.color]="likedIds().has(pr.recipe.id) ? '#e53935' : '#9e9e9e'">
                      {{ likedIds().has(pr.recipe.id) ? 'favorite' : 'favorite_border' }}
                    </mat-icon>
                  </button>
                  <span class="match-badge">{{ pr.matchPct }}%</span>
                </div>
                <div class="rec-card-body">
                  <div class="rec-card-title">{{ pr.recipe.title }}</div>
                  @if (pr.recipe.description) {
                    <p class="rec-card-desc">{{ pr.recipe.description }}</p>
                  }
                  <div class="rec-card-nut">
                    <span>Protein {{ nut(pr.recipe).protein }}g</span>
                    <span>Fiber {{ nut(pr.recipe).fiber }}g</span>
                    <span>Cal {{ nut(pr.recipe).calories }}</span>
                  </div>
                  @if (pr.recipe.ailment_tags[0] || pr.recipe.health_benefits[0]) {
                    <div class="rec-card-tag">
                      <mat-icon style="font-size:11px;width:11px;height:11px;color:#2e7d32">add_circle</mat-icon>
                      {{ pr.recipe.ailment_tags[0] || pr.recipe.health_benefits[0] }}
                    </div>
                  }
                </div>
              </div>
            }
          </div>

        } @else if (!auth.isLoggedIn()) {
          <div class="empty-meals">
            <mat-icon style="font-size:44px;width:44px;height:44px;color:#c8e6c9;display:block;margin:0 auto 12px">restaurant</mat-icon>
            <div class="fw-semibold" style="color:#2e7d32;margin-bottom:6px">Sign in for personalized recipes</div>
            <p style="font-size:13px;color:#9e9e9e;margin:0 0 16px">Create an account to get recipes tailored to your pantry and health goals.</p>
            <button class="cta-btn" routerLink="/auth/login">Sign In</button>
          </div>

        } @else {
          <div class="empty-meals">
            <mat-icon style="font-size:44px;width:44px;height:44px;color:#c8e6c9;display:block;margin:0 auto 12px">kitchen</mat-icon>
            <div class="fw-semibold" style="color:#2e7d32;margin-bottom:6px">Your pantry is empty</div>
            <p style="font-size:13px;color:#9e9e9e;margin:0 0 14px">Add ingredients to get personalized recipe matches.</p>
            <button class="cta-btn" routerLink="/pantry">Add Pantry Items</button>
          </div>
        }
      </div>

    </div>

    <!-- ── Right sidebar (sort & filter) ─────────────────────── -->
    <div class="rec-sidebar">
      <div class="sidebar-card">
        <div class="sidebar-card-hdr">
          <span class="sidebar-card-title">Sort & Filter</span>
          <mat-icon style="color:#2e7d32;font-size:18px">tune</mat-icon>
        </div>

        <label class="filter-label">Cooking Time</label>
        <select class="filter-select" [(ngModel)]="filterTime">
          <option value="">Any time</option>
          <option>Under 15 mins</option>
          <option>Under 30 mins</option>
          <option>Under 1 hour</option>
        </select>

        <label class="filter-label">Sort By</label>
        <select class="filter-select" [(ngModel)]="filterSort">
          <option value="recommended">Recommended</option>
          <option value="quickest">Quickest First</option>
          <option value="best-match">Best Match</option>
        </select>
      </div>
    </div>

  </div>

  <!-- ── Recipe detail modal ────────────────────────────────── -->
  @if (showModal()) {
    <div class="modal-backdrop" (click)="closeModal()">
      <div class="rec-modal" (click)="$event.stopPropagation()">
        <button class="modal-close-btn" (click)="closeModal()">
          <mat-icon style="font-size:18px;color:#6b7c6b">close</mat-icon>
        </button>

        @if (modalRecipe(); as pr) {
          <div class="modal-img-wrap">
            <img [src]="recipeImgUrl(pr.recipe.title, pr.recipe.meal_type)"
                 [alt]="pr.recipe.title" class="modal-img"
                 (error)="$any($event.target).src = fallbackImg">
            <div class="modal-img-overlay">
              <span class="modal-match-badge">{{ pr.matchPct }}% Match</span>
            </div>
          </div>

          <div class="modal-body">
            <h2 class="modal-title">{{ pr.recipe.title }}</h2>

            <div class="d-flex flex-wrap gap-2 mb-3">
              @if (pr.recipe.meal_type) {
                <span class="modal-chip chip-blue">{{ pr.recipe.meal_type }}</span>
              }
              @for (label of pr.recipe.dietary_labels; track label) {
                <span class="modal-chip chip-green">{{ label }}</span>
              }
              @for (tag of pr.recipe.ailment_tags; track tag) {
                <span class="modal-chip chip-teal">{{ tag }}</span>
              }
            </div>

            <div class="modal-stats-row">
              @if (pr.recipe.prep_time_minutes) {
                <div class="modal-stat">
                  <mat-icon style="font-size:16px;color:#4caf50">timer</mat-icon>
                  <span>{{ pr.recipe.prep_time_minutes }}m prep</span>
                </div>
              }
              @if (pr.recipe.cook_time_minutes) {
                <div class="modal-stat">
                  <mat-icon style="font-size:16px;color:#f57c00">local_fire_department</mat-icon>
                  <span>{{ pr.recipe.cook_time_minutes }}m cook</span>
                </div>
              }
              <div class="modal-stat">
                <mat-icon style="font-size:16px;color:#1565c0">people</mat-icon>
                <span>{{ pr.recipe.servings }} servings</span>
              </div>
            </div>

            @if (pr.recipe.description) {
              <p style="font-size:13px;color:#4a5a4a;line-height:1.65;margin-bottom:16px">{{ pr.recipe.description }}</p>
            }

            @if (pr.ingredients.length > 0) {
              <div class="modal-section">
                <div class="modal-section-title">Ingredients</div>
                <div class="modal-ing-list">
                  @for (ing of pr.ingredients; track ing.name) {
                    <div class="modal-ing-row" [class.have]="ing.have" [class.miss]="!ing.have">
                      <mat-icon style="font-size:15px">{{ ing.have ? 'check_circle' : 'radio_button_unchecked' }}</mat-icon>
                      <span>{{ ing.name }}</span>
                      @if (ing.optional) { <em style="font-size:11px;color:#9e9e9e"> (optional)</em> }
                    </div>
                  }
                </div>
              </div>
            }

            @if (pr.missingIngredients.length > 0) {
              <div class="modal-missing">
                <mat-icon style="font-size:16px;color:#f57c00;flex-shrink:0">shopping_cart</mat-icon>
                <span>Need: <strong>{{ pr.missingIngredients.join(', ') }}</strong></span>
              </div>
            }

            @if (pr.recipe.instructions) {
              <div class="modal-section">
                <div class="modal-section-title">Instructions</div>
                <ol class="modal-steps">
                  @for (step of parseSteps(pr.recipe.instructions); track $index) {
                    <li>{{ step }}</li>
                  }
                </ol>
              </div>
            }
          </div>
        }
      </div>
    </div>
  }

</div>
  `,
  styles: [`
    /* ── Wrapper ────────────────────────────────────────────── */
    .rec-wrapper {
      min-height: 100vh;
      background: #f7f9f7;
    }

    /* ── Top bar ─────────────────────────────────────────────── */
    .rec-topbar {
      display: flex; align-items: center; gap: 12px;
      padding: 12px 16px;
      background: #fff;
      border-bottom: 1px solid #f0f4f0;
      position: sticky; top: 0; z-index: 50;
    }
    .rec-search-box {
      flex: 1; display: flex; align-items: center; gap: 8px;
      background: #f5f5f5; border-radius: 24px;
      padding: 8px 14px;
    }
    .rec-search-ico { font-size: 18px; color: #9e9e9e; }
    .rec-search-input {
      flex: 1; border: none; background: transparent; outline: none;
      font-size: 13px; color: #1a2a1a;
    }
    .search-clear-btn {
      background: transparent; border: none; cursor: pointer;
      display: flex; align-items: center; padding: 0;
    }
    .topbar-notif-btn {
      position: relative; background: transparent; border: none; padding: 4px; cursor: pointer;
    }
    .topbar-notif-dot {
      position: absolute; top: 0; right: 0;
      background: #f44336; color: #fff; font-size: 8px; font-weight: 700;
      border-radius: 10px; padding: 1px 4px; line-height: 1.4;
    }

    /* ── Layout ─────────────────────────────────────────────── */
    .rec-layout {
      display: flex; gap: 0;
      max-width: 1200px; margin: 0 auto;
    }
    .rec-main {
      flex: 1; min-width: 0;
      padding: 20px 16px;
    }
    .rec-sidebar { display: none; }
    @media (min-width: 960px) {
      .rec-sidebar {
        display: block; width: 240px; flex-shrink: 0;
        padding: 20px 16px 20px 0;
      }
      .rec-main { padding: 20px 24px; }
    }

    /* ── Page header ─────────────────────────────────────────── */
    .back-link {
      display: inline-flex; align-items: center; gap: 4px;
      background: transparent; border: none; cursor: pointer;
      font-size: 13px; color: #2e7d32; font-weight: 600;
      padding: 0; margin-bottom: 12px; text-decoration: none;
    }
    .rec-page-title {
      font-size: clamp(18px, 4vw, 24px); font-weight: 800;
      color: #1a2a1a; margin: 0 0 6px;
    }
    .rec-page-sub { font-size: 13px; color: #6b7c6b; margin: 0 0 18px; }

    /* ── Filter chips ────────────────────────────────────────── */
    .chip-row {
      display: flex; gap: 8px; overflow-x: auto; padding-bottom: 4px;
      scrollbar-width: none; margin-bottom: 24px;
    }
    .chip-pill {
      display: inline-flex; align-items: center; gap: 5px;
      white-space: nowrap; padding: 7px 14px;
      border-radius: 20px; border: 1.5px solid #e0ede0;
      background: #fff; font-size: 13px; font-weight: 500;
      color: #4a5a4a; cursor: pointer; transition: all 0.18s;
    }
    .chip-pill:hover { border-color: #4caf50; background: #f1f8e9; }
    .chip-pill-active {
      background: #2e7d32 !important; border-color: #2e7d32 !important;
      color: #fff !important;
    }

    /* ── Section ─────────────────────────────────────────────── */
    .rec-section { }
    .rec-section-hdr {
      display: flex; align-items: center; justify-content: space-between;
      margin-bottom: 14px;
    }
    .rec-section-title {
      font-size: 16px; font-weight: 700; color: #1a2a1a; margin: 0;
    }
    .rec-count {
      font-size: 12px; color: #9e9e9e; font-weight: 500;
    }

    /* ── Quick & Easy strip ─────────────────────────────────── */
    .qe-row {
      display: flex; gap: 10px;
      overflow-x: auto; padding-bottom: 6px; scrollbar-width: none;
    }
    .qe-row::-webkit-scrollbar { display: none; }
    .qe-card {
      flex-shrink: 0; width: 130px; border-radius: 12px;
      background: #fff; overflow: hidden; cursor: pointer;
      box-shadow: 0 1px 6px rgba(0,0,0,0.07); border: 1.5px solid #e0ede0;
      transition: transform 0.15s, box-shadow 0.15s;
    }
    .qe-card:hover { transform: translateY(-2px); box-shadow: 0 4px 14px rgba(0,0,0,0.1); border-color: #4caf50; }
    .qe-img { width: 100%; height: 80px; object-fit: cover; display: block; }
    .qe-body { padding: 8px 9px; }
    .qe-title { font-size: 11px; font-weight: 700; color: #1a2a1a; line-height: 1.35; margin-bottom: 4px; }
    .qe-meta { display: flex; align-items: center; gap: 3px; font-size: 10px; color: #9e9e9e; }

    /* ── Recipe cards ────────────────────────────────────────── */
    .meals-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
      gap: 14px;
    }
    @media (min-width: 600px) {
      .meals-grid { grid-template-columns: repeat(auto-fill, minmax(180px, 1fr)); }
    }
    .rec-card {
      background: #fff; border-radius: 14px;
      overflow: hidden; cursor: pointer;
      box-shadow: 0 2px 8px rgba(0,0,0,0.06);
      transition: transform 0.15s, box-shadow 0.15s;
    }
    .rec-card:hover { transform: translateY(-3px); box-shadow: 0 6px 18px rgba(0,0,0,0.1); }
    .rec-card-img-wrap { position: relative; height: 148px; overflow: hidden; }
    .rec-card-img { width: 100%; height: 100%; object-fit: cover; transition: transform 0.3s; }
    .rec-card:hover .rec-card-img { transform: scale(1.05); }
    .time-badge {
      position: absolute; bottom: 8px; left: 8px;
      display: inline-flex; align-items: center; gap: 3px;
      background: rgba(27,94,32,0.88); color: #fff;
      font-size: 10px; font-weight: 600;
      padding: 3px 8px; border-radius: 20px; backdrop-filter: blur(4px);
    }
    .card-heart {
      position: absolute; top: 8px; right: 8px;
      width: 28px; height: 28px; border-radius: 50%;
      background: rgba(255,255,255,0.92); border: none;
      display: flex; align-items: center; justify-content: center;
      cursor: pointer; transition: transform 0.15s;
    }
    .card-heart:hover { transform: scale(1.15); }
    .match-badge {
      position: absolute; top: 8px; left: 8px;
      background: #2e7d32; color: #fff;
      font-size: 10px; font-weight: 700; padding: 2px 7px; border-radius: 10px;
    }
    .rec-card-body { padding: 10px 12px 12px; }
    .rec-card-title {
      font-size: 13px; font-weight: 700; color: #1a2a1a;
      line-height: 1.35; margin-bottom: 5px;
      display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;
    }
    .rec-card-desc {
      font-size: 11px; color: #6b7c6b; line-height: 1.5; margin: 0 0 8px;
      display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;
    }
    .rec-card-nut {
      display: flex; flex-wrap: wrap; gap: 4px;
      font-size: 10px; color: #9e9e9e; margin-bottom: 6px;
      span + span::before { content: ' • '; }
    }
    .rec-card-tag {
      display: inline-flex; align-items: center; gap: 3px;
      font-size: 11px; color: #2e7d32; font-weight: 600;
    }

    /* ── Skeleton ────────────────────────────────────────────── */
    .skeleton {
      background: linear-gradient(90deg, #e0e0e0 25%, #f5f5f5 50%, #e0e0e0 75%);
      background-size: 200% 100%; animation: shimmer 1.5s infinite;
    }
    @keyframes shimmer { 0% { background-position: 200% 0; } 100% { background-position: -200% 0; } }

    /* ── Empty states ────────────────────────────────────────── */
    .empty-meals {
      background: #fff; border-radius: 14px; padding: 40px 20px;
      text-align: center; box-shadow: 0 2px 8px rgba(0,0,0,0.05);
    }
    .cta-btn {
      display: inline-block; background: #2e7d32; color: #fff;
      border: none; border-radius: 10px; padding: 10px 22px;
      font-size: 13px; font-weight: 600; cursor: pointer;
    }

    /* ── Sidebar ─────────────────────────────────────────────── */
    .sidebar-card {
      background: #fff; border-radius: 16px; padding: 16px;
      box-shadow: 0 2px 8px rgba(0,0,0,0.06);
    }
    .sidebar-card-hdr {
      display: flex; align-items: center; justify-content: space-between;
      margin-bottom: 14px;
    }
    .sidebar-card-title { font-size: 14px; font-weight: 700; color: #1a2a1a; }
    .filter-label {
      display: block; font-size: 11px; font-weight: 600;
      color: #6b7c6b; margin-bottom: 5px; margin-top: 12px;
    }
    .filter-label:first-of-type { margin-top: 0; }
    .filter-select {
      width: 100%; padding: 8px 10px;
      border: 1.5px solid #e0ede0; border-radius: 8px;
      font-size: 13px; color: #1a2a1a; background: #fff;
      outline: none; cursor: pointer;
    }
    .filter-select:focus { border-color: #4caf50; }

    /* ── Recipe modal ────────────────────────────────────────── */
    .modal-backdrop {
      position: fixed; inset: 0; background: rgba(0,0,0,0.52);
      z-index: 200; display: flex; align-items: flex-end; justify-content: center;
    }
    .rec-modal {
      background: #fff; border-radius: 20px 20px 0 0;
      width: 100%; max-height: 90vh; overflow-y: auto; position: relative;
    }
    .modal-close-btn {
      position: absolute; top: 12px; right: 12px;
      width: 32px; height: 32px; border-radius: 50%;
      background: rgba(255,255,255,0.9); border: none; cursor: pointer;
      display: flex; align-items: center; justify-content: center; z-index: 1;
    }
    .modal-img-wrap { position: relative; height: 200px; overflow: hidden; }
    .modal-img { width: 100%; height: 100%; object-fit: cover; }
    .modal-img-overlay {
      position: absolute; inset: 0;
      background: linear-gradient(to top, rgba(0,0,0,0.4), transparent);
      display: flex; align-items: flex-end; padding: 12px;
    }
    .modal-match-badge {
      background: #2e7d32; color: #fff;
      font-size: 11px; font-weight: 700; padding: 3px 10px; border-radius: 10px;
    }
    .modal-body { padding: 16px 20px 32px; }
    .modal-title { font-size: 20px; font-weight: 800; color: #1a2a1a; margin: 0 0 12px; }
    .modal-chip {
      display: inline-flex; padding: 4px 10px; border-radius: 10px;
      font-size: 11px; font-weight: 600;
    }
    .chip-blue { background: #e8eaf6; color: #3949ab; }
    .chip-green { background: #e8f5e9; color: #2e7d32; }
    .chip-teal { background: #e0f2f1; color: #00695c; }
    .modal-stats-row { display: flex; flex-wrap: wrap; gap: 14px; margin-bottom: 14px; }
    .modal-stat { display: flex; align-items: center; gap: 4px; font-size: 13px; color: #6b7c6b; }
    .modal-section { margin-bottom: 16px; }
    .modal-section-title {
      font-size: 14px; font-weight: 700; color: #1a2a1a;
      margin-bottom: 10px; padding-bottom: 8px; border-bottom: 1px solid #f0f4f0;
    }
    .modal-ing-list { display: flex; flex-direction: column; gap: 6px; }
    .modal-ing-row {
      display: flex; align-items: center; gap: 8px; font-size: 13px;
      &.have { color: #2e7d32; mat-icon { color: #4caf50; } }
      &.miss { color: #9e9e9e; mat-icon { color: #bdbdbd; } }
    }
    .modal-missing {
      display: flex; align-items: flex-start; gap: 8px;
      background: #fff8f0; border-radius: 10px; padding: 10px 12px;
      font-size: 12px; color: #e65100; margin-bottom: 16px;
    }
    .modal-steps {
      padding-left: 18px; display: flex; flex-direction: column; gap: 10px; margin: 0;
    }
    .modal-steps li { font-size: 13px; color: #1a2a1a; line-height: 1.6; }
    @media (min-width: 768px) {
      .modal-backdrop { align-items: center; }
      .rec-modal { border-radius: 20px; max-width: 560px; max-height: 84vh; }
    }

    /* ── Animations ──────────────────────────────────────────── */
    .fade-in { animation: fadeIn 0.3s ease-in; }
    @keyframes fadeIn { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; } }
  `],
})
export class RecommendationsComponent implements OnInit {
  private route         = inject(ActivatedRoute);
  router                = inject(Router);
  private pantryService = inject(PantryService);
  private http          = inject(HttpClient);
  auth                  = inject(AuthService);

  // ── State ─────────────────────────────────────────────────────────────────
  activeFilterChip = signal('all');
  localSearch      = signal('');
  showModal        = signal(false);
  modalRecipe      = signal<PantryRecipeMatch | null>(null);
  pantryLoading    = signal(false);
  pantryRecipes    = signal<PantryRecipeMatch[]>([]);
  likedSet         = signal<Set<string>>(new Set());
  likedIds         = computed(() => this.likedSet());
  searchText       = '';
  filterTime       = '';
  filterSort       = 'recommended';

  readonly fallbackImg  = 'https://images.unsplash.com/photo-1512621776951-a57141f2eefd?w=400&auto=format&fit=crop&q=80';
  readonly recipeImgUrl = recipeImgUrl;
  readonly nut          = estimateNutrition;
  readonly parseSteps     = parseSteps;

  readonly filterChips = [
    { key: 'all',          label: 'All',          icon: 'eco' },
    { key: 'high-protein', label: 'High Protein',  icon: 'fitness_center' },
    { key: 'low-carb',     label: 'Low Carb',      icon: 'grass' },
    { key: 'quick',        label: 'Quick & Easy',  icon: 'timer' },
    { key: 'heart',        label: 'Heart Healthy', icon: 'favorite' },
    { key: 'weight-loss',  label: 'Weight Loss',   icon: 'monitor_weight' },
  ];

  // ── Computed ──────────────────────────────────────────────────────────────
  quickEasyRecipes = computed(() =>
    this.pantryRecipes()
      .filter(pr => { const t = this.totalMin(pr.recipe); return t > 0 && t <= 20; })
      .slice(0, 10)
  );

  filteredPantryRecipes = computed(() => this.pantryRecipes());

  displayRecipes = computed(() => {
    let recs = this.filteredPantryRecipes();
    const chip   = this.activeFilterChip();
    const search = this.localSearch().toLowerCase().trim();

    if (chip !== 'all') {
      recs = recs.filter(pr => {
        const r = pr.recipe;
        if (chip === 'high-protein') return r.health_benefits.some(b => /protein|muscle/i.test(b));
        if (chip === 'low-carb')     return r.dietary_labels.some(l => /low.?carb|keto/i.test(l));
        if (chip === 'quick')        return this.totalMin(r) <= 30 && this.totalMin(r) > 0;
        if (chip === 'heart')        return r.ailment_tags.some(t => /heart|cardio/i.test(t));
        if (chip === 'weight-loss')  return r.ailment_tags.some(t => /weight/i.test(t));
        return true;
      });
    }

    if (search) {
      recs = recs.filter(pr =>
        pr.recipe.title.toLowerCase().includes(search) ||
        (pr.recipe.description?.toLowerCase().includes(search) ?? false) ||
        pr.recipe.ailment_tags.some(t => t.toLowerCase().includes(search)) ||
        pr.recipe.health_benefits.some(b => b.toLowerCase().includes(search)) ||
        pr.recipe.dietary_labels.some(l => l.toLowerCase().includes(search))
      );
    }

    if (this.filterTime === 'Under 15 mins') recs = recs.filter(pr => this.totalMin(pr.recipe) <= 15);
    if (this.filterTime === 'Under 30 mins') recs = recs.filter(pr => this.totalMin(pr.recipe) <= 30);
    if (this.filterSort === 'quickest')   recs = [...recs].sort((a,b) => this.totalMin(a.recipe) - this.totalMin(b.recipe));
    if (this.filterSort === 'best-match') recs = [...recs].sort((a,b) => b.matchPct - a.matchPct);
    return recs;
  });

  // ── Lifecycle ─────────────────────────────────────────────────────────────
  ngOnInit() {
    this.route.queryParams.subscribe(() => {
      if (this.auth.isLoggedIn()) this.loadPantryRecipes();
      else this.loadPublicRecipes();
    });
  }

  // ── Data loading ──────────────────────────────────────────────────────────
  loadPantryRecipes() {
    this.pantryLoading.set(true);
    forkJoin({
      recipes:     this.http.get<FullRecipe[]>(`${environment.apiUrl}/recipes?limit=100`),
      pantryItems: this.pantryService.list(),
    }).pipe(catchError(() => of({ recipes: [] as FullRecipe[], pantryItems: [] as PantryItem[] })))
      .subscribe(({ recipes, pantryItems }) => {
        const pantryNames = pantryItems.map((p: PantryItem) => p.ingredient_name.toLowerCase());
        const matches: PantryRecipeMatch[] = recipes.map(recipe => {
          const ingredients = recipe.recipe_ingredients.map(ri => ({
            name: ri.ingredient.name,
            have: this.matchInPantry(ri.ingredient.name, pantryNames),
            optional: ri.is_optional,
          }));
          const required = ingredients.filter(i => !i.optional);
          const haveRequired = required.filter(i => i.have).length;
          const totalRequired = required.length || ingredients.length;
          const missingIngredients = ingredients.filter(i => !i.have && !i.optional).map(i => i.name);
          return {
            recipe, missingIngredients, ingredients,
            matchPct: totalRequired > 0 ? Math.round(haveRequired / totalRequired * 100) : 0,
            canMake: missingIngredients.length === 0 && totalRequired > 0,
          };
        });
        matches.sort((a,b) => (a.canMake === b.canMake ? b.matchPct - a.matchPct : a.canMake ? -1 : 1));
        this.pantryRecipes.set(matches);
        this.pantryLoading.set(false);
      });
  }

  loadPublicRecipes() {
    this.pantryLoading.set(true);
    this.http.get<FullRecipe[]>(`${environment.apiUrl}/recipes?limit=12`)
      .pipe(catchError(() => of([] as FullRecipe[])))
      .subscribe(recipes => {
        const matches: PantryRecipeMatch[] = recipes.map(recipe => ({
          recipe, matchPct: Math.round(recipe.efficacy_score * 100),
          canMake: false, ingredients: [], missingIngredients: [],
        }));
        this.pantryRecipes.set(matches);
        this.pantryLoading.set(false);
      });
  }

  private matchInPantry(name: string, pantryNames: string[]): boolean {
    const n = name.toLowerCase().trim();
    return pantryNames.some(p => p.includes(n) || n.includes(p) || n.split(/\s+/).some(w => w.length >= 4 && p.includes(w)));
  }

  // ── UI helpers ────────────────────────────────────────────────────────────
  totalMin(r: FullRecipe): number { return (r.prep_time_minutes ?? 0) + (r.cook_time_minutes ?? 0); }

  openModal(pr: PantryRecipeMatch) { this.modalRecipe.set(pr); this.showModal.set(true); }
  closeModal() { this.showModal.set(false); }

  toggleHeart(id: string) {
    const s = new Set(this.likedSet());
    s.has(id) ? s.delete(id) : s.add(id);
    this.likedSet.set(s);
  }

  activeChipLabel(): string {
    return this.filterChips.find(c => c.key === this.activeFilterChip())?.label ?? '';
  }

  applyFilters() { /* computed reacts automatically */ }
}
