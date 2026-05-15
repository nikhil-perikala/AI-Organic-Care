import { Component, inject, signal, computed, OnInit } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { forkJoin, of } from 'rxjs';
import { catchError } from 'rxjs/operators';
import {
  RecommendationService,
  RecommendationResponse,
  MealRecommendation,
} from '../../core/services/recommendation.service';
import { AuthService } from '../../core/services/auth.service';
import { PantryService, PantryItem } from '../../core/services/pantry.service';
import { environment } from '../../../environments/environment';

// ── Types ─────────────────────────────────────────────────────────────────────

type ModeKey = 'pantry' | 'tobuy' | 'hybrid';

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

function ingImgUrl(name: string): string {
  return `https://source.unsplash.com/featured/120x120/?${encodeURIComponent(name.split(' ')[0])},food,ingredient`;
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
  imports: [CommonModule, FormsModule, RouterLink, MatIconModule, MatProgressSpinnerModule, MatSnackBarModule],
  template: `
<div class="rec-wrapper">

  <!-- ── Top search bar ──────────────────────────────────────── -->
  <div class="rec-topbar">
    <div class="rec-search-box">
      <mat-icon class="rec-search-ico">search</mat-icon>
      <input class="rec-search-input" [(ngModel)]="searchText"
        placeholder="Search recipes, meals, ingredients..."
        (keyup.enter)="searchByText()">
    </div>
    <button class="topbar-notif-btn" (click)="router.navigate(['/insights'])">
      <mat-icon style="font-size:22px;color:#2e7d32">notifications</mat-icon>
      <span class="topbar-notif-dot">3</span>
    </button>
  </div>

  <!-- ── Main 2-col layout ───────────────────────────────────── -->
  <div class="rec-layout">

    <!-- ── Main content ──────────────────────────────────────── -->
    <div class="rec-main">

      <!-- Back + title -->
      <button class="back-link" routerLink="/home">
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

      <!-- ── Recommended Meals ────────────────────────────────── -->
      <div class="rec-section">
        <div class="rec-section-hdr">
          <h2 class="rec-section-title">Recommended Meals</h2>
          <button class="view-all-btn" (click)="showAiSearch.set(true)">View All →</button>
        </div>

        @if (pantryLoading()) {
          <div class="meals-grid">
            @for (s of [1,2,3,4]; track s) {
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
          <!-- AI result cards for guest users -->
          @if (result() && !loading()) {
            <div class="meals-grid">
              @for (meal of result()!.recommendations; track meal.recipe_id) {
                <div class="rec-card">
                  <div class="rec-card-img-wrap">
                    <img [src]="recipeImgUrl(meal.title, meal.meal_type)"
                         [alt]="meal.title" class="rec-card-img"
                         (error)="$any($event.target).src = fallbackImg">
                    <span class="time-badge">
                      <mat-icon style="font-size:10px;width:10px;height:10px">timer</mat-icon>
                      {{ (meal.prep_time_minutes ?? 0) + (meal.cook_time_minutes ?? 0) || '?' }} min
                    </span>
                    <span class="match-badge">{{ getMatchPct(meal.efficacy_score) }}%</span>
                  </div>
                  <div class="rec-card-body">
                    <div class="rec-card-title">{{ meal.title }}</div>
                    @if (meal.description) {
                      <p class="rec-card-desc">{{ meal.description }}</p>
                    }
                    <div class="rec-card-nut">
                      @for (label of meal.dietary_labels.slice(0,2); track label) {
                        <span>{{ label }}</span>
                      }
                    </div>
                    @if (meal.health_benefits[0]) {
                      <div class="rec-card-tag">
                        <mat-icon style="font-size:11px;width:11px;height:11px;color:#2e7d32">add_circle</mat-icon>
                        {{ meal.health_benefits[0] }}
                      </div>
                    }
                  </div>
                </div>
              }
            </div>
          } @else if (loading()) {
            <div class="meals-grid">
              @for (s of [1,2,3]; track s) {
                <div class="rec-card">
                  <div class="skeleton" style="height:150px;border-radius:12px 12px 0 0"></div>
                  <div class="rec-card-body">
                    <div class="skeleton mb-2" style="height:14px;width:70%;border-radius:6px"></div>
                    <div class="skeleton" style="height:11px;width:60%;border-radius:4px"></div>
                  </div>
                </div>
              }
            </div>
          } @else {
            <div class="empty-meals">
              <mat-icon style="font-size:44px;width:44px;height:44px;color:#c8e6c9;display:block;margin:0 auto 12px">restaurant</mat-icon>
              <div class="fw-semibold" style="color:#2e7d32;margin-bottom:6px">Discover meals for your goals</div>
              <p style="font-size:13px;color:#9e9e9e;margin:0 0 16px">Tell us how you're feeling and we'll find the perfect organic meal.</p>
              <div class="d-flex flex-wrap gap-2 justify-content-center">
                @for (ex of examples; track ex) {
                  <button class="example-chip" (click)="query = ex; showAiSearch.set(true); search()">{{ ex }}</button>
                }
              </div>
            </div>
          }
        } @else {
          <div class="empty-meals">
            <mat-icon style="font-size:44px;width:44px;height:44px;color:#c8e6c9;display:block;margin:0 auto 12px">kitchen</mat-icon>
            <div class="fw-semibold" style="color:#2e7d32;margin-bottom:6px">Your pantry is empty</div>
            <p style="font-size:13px;color:#9e9e9e;margin:0 0 14px">Add ingredients to get personalized recipe matches.</p>
            <button class="cta-btn" routerLink="/pantry">Add Pantry Items</button>
          </div>
        }
      </div>

      <!-- ── Because You Bought ───────────────────────────────── -->
      @if (pantryItemsList().length > 0) {
        <div class="rec-section mt-4">
          <div class="rec-section-hdr">
            <h2 class="rec-section-title d-flex align-items-center gap-2">
              Because You Bought
              <mat-icon style="font-size:16px;color:#4caf50">eco</mat-icon>
            </h2>
          </div>
          <div class="ing-row">
            @for (item of pantryItemsList().slice(0, 8); track item.id) {
              <div class="ing-card" (click)="searchByIngredient(item.ingredient_name)">
                <div class="ing-img-wrap">
                  <img [src]="ingImgUrl(item.ingredient_name)"
                       [alt]="item.ingredient_name" class="ing-img"
                       (error)="$any($event.target).src = fallbackIngImg">
                </div>
                <div class="ing-name">{{ item.ingredient_name }}</div>
                <div class="ing-link">View Recipes →</div>
              </div>
            }
          </div>
        </div>
      }

      <!-- ── AI Suggestions (expandable) ─────────────────────── -->
      <div class="rec-section mt-4">
        <button class="ai-toggle-btn" (click)="showAiSearch.set(!showAiSearch())">
          <div class="d-flex align-items-center gap-2">
            <div style="width:28px;height:28px;border-radius:8px;background:#e8f5e9;display:flex;align-items:center;justify-content:center">
              <mat-icon style="font-size:16px;color:#2e7d32">psychology</mat-icon>
            </div>
            <span class="fw-semibold" style="font-size:14px;color:#1a2a1a">Get AI-Powered Suggestions</span>
          </div>
          <mat-icon style="color:#9e9e9e">{{ showAiSearch() ? 'expand_less' : 'expand_more' }}</mat-icon>
        </button>

        @if (showAiSearch()) {
          <div class="ai-search-panel fade-in">

            <!-- Mode selector -->
            <div class="mode-row">
              @for (m of modes; track m.key) {
                <button class="mode-pill" [class.mode-pill-active]="activeMode() === m.key"
                  [style.--mc]="m.color" (click)="setMode(m.key)">
                  <mat-icon style="font-size:16px;width:16px;height:16px">{{ m.icon }}</mat-icon>
                  {{ m.label }}
                </button>
              }
            </div>

            <!-- Query input -->
            <div class="ai-input-row">
              <input class="ai-input" [(ngModel)]="query" (keyup.enter)="search()"
                placeholder="e.g. I'm tired and stressed, what should I eat?">
              <button class="ai-search-btn" (click)="search()" [disabled]="!query.trim() || loading()">
                <mat-icon style="font-size:18px">eco</mat-icon>
                Get Recs
              </button>
            </div>

            @if (loading()) {
              <div class="ai-loading">
                <mat-spinner diameter="32"></mat-spinner>
                <span style="font-size:13px;color:#6b7c6b">Analyzing your request...</span>
              </div>
            }

            @if (result() && !loading()) {
              <div class="ai-results fade-in">

                <!-- Explanation -->
                <div class="explanation-card">
                  <div class="d-flex align-items-flex-start gap-2 mb-2">
                    <mat-icon style="color:#f57c00;font-size:20px;flex-shrink:0">healing</mat-icon>
                    <div>
                      <div class="fw-semibold" style="font-size:13px;margin-bottom:6px">Addressing:</div>
                      <div class="d-flex flex-wrap gap-2">
                        @for (a of result()!.detected_ailments; track a) {
                          <span class="ailment-chip">{{ a }}</span>
                        }
                      </div>
                    </div>
                  </div>
                  <p style="font-size:13px;color:#444;line-height:1.65;margin:0">{{ result()!.ai_explanation }}</p>
                </div>

                <!-- AI Recipe cards -->
                <div class="meals-grid mt-3">
                  @for (meal of result()!.recommendations; track meal.recipe_id) {
                    <div class="rec-card">
                      <div class="rec-card-img-wrap">
                        <img [src]="recipeImgUrl(meal.title, meal.meal_type)"
                             [alt]="meal.title" class="rec-card-img"
                             (error)="$any($event.target).src = fallbackImg">
                        <span class="time-badge">
                          <mat-icon style="font-size:10px;width:10px;height:10px">timer</mat-icon>
                          {{ (meal.prep_time_minutes ?? 0) + (meal.cook_time_minutes ?? 0) || '?' }} min
                        </span>
                        <span class="match-badge">{{ getMatchPct(meal.efficacy_score) }}%</span>
                      </div>
                      <div class="rec-card-body">
                        <div class="rec-card-title">{{ meal.title }}</div>
                        @if (meal.description) { <p class="rec-card-desc">{{ meal.description }}</p> }
                        <div class="rec-card-nut">
                          @for (label of meal.dietary_labels.slice(0,3); track label) {
                            <span>{{ label }}</span>
                          }
                        </div>
                        @if (meal.health_benefits[0]) {
                          <div class="rec-card-tag">
                            <mat-icon style="font-size:11px;width:11px;height:11px;color:#2e7d32">add_circle</mat-icon>
                            {{ meal.health_benefits[0] }}
                          </div>
                        }
                        <div class="ai-card-actions mt-2 d-flex gap-2">
                          <button class="card-action-btn action-like" (click)="feedback(meal,'like')">
                            <mat-icon style="font-size:13px">thumb_up</mat-icon> Helpful
                          </button>
                          <button class="card-action-btn action-save" (click)="feedback(meal,'save')">
                            <mat-icon style="font-size:13px">bookmark_border</mat-icon> Save
                          </button>
                        </div>
                      </div>
                    </div>
                  }
                </div>

                <!-- Shopping list -->
                @if (result()!.shopping_list.length) {
                  <div class="shopping-card mt-4">
                    <div class="d-flex align-items-center gap-2 mb-3">
                      <div style="width:36px;height:36px;border-radius:10px;background:#e8f5e9;display:flex;align-items:center;justify-content:center;flex-shrink:0">
                        <mat-icon style="color:#2e7d32;font-size:20px">shopping_cart</mat-icon>
                      </div>
                      <div>
                        <div class="fw-bold" style="font-size:14px">Shopping List</div>
                        <div class="text-muted" style="font-size:11px">{{ result()!.shopping_list.length }} items needed</div>
                      </div>
                      <button class="ms-auto select-all-btn" (click)="toggleSelectAll()">
                        {{ selectedCount() === result()!.shopping_list.length ? 'Clear All' : 'Select All' }}
                      </button>
                    </div>
                    <div class="shopping-items">
                      @for (item of result()!.shopping_list; track item.ingredient_name) {
                        <div class="shopping-item" [class.selected]="isSelected(item.ingredient_name)"
                          (click)="toggleItem(item.ingredient_name)">
                          <mat-icon style="font-size:20px" [style.color]="isSelected(item.ingredient_name) ? '#2e7d32' : '#bdbdbd'">
                            {{ isSelected(item.ingredient_name) ? 'check_box' : 'check_box_outline_blank' }}
                          </mat-icon>
                          <div class="flex-fill">
                            <div style="font-size:13px;font-weight:600">{{ item.ingredient_name }}</div>
                            @if (item.quantity) { <div style="font-size:11px;color:#9e9e9e">{{ item.quantity }}{{ item.unit ? ' ' + item.unit : '' }}</div> }
                          </div>
                        </div>
                      }
                    </div>
                    @if (auth.isLoggedIn()) {
                      <button class="add-pantry-btn mt-3" [disabled]="selectedCount() === 0 || addingToCart()" (click)="addToCart()">
                        @if (addingToCart()) {
                          <mat-spinner diameter="16"></mat-spinner> Adding...
                        } @else {
                          <mat-icon style="font-size:16px">add_shopping_cart</mat-icon>
                          Add{{ selectedCount() > 0 ? ' ' + selectedCount() : '' }} to Pantry
                        }
                      </button>
                    } @else {
                      <p style="font-size:12px;color:#9e9e9e;margin-top:10px">
                        <a routerLink="/auth/login" style="color:#2e7d32;font-weight:600">Sign in</a> to save items to your pantry
                      </p>
                    }
                  </div>
                }

              </div>
            }

          </div>
        }
      </div>

    </div>

    <!-- ── Right sidebar ──────────────────────────────────────── -->
    <div class="rec-sidebar">

      <!-- Filters -->
      <div class="sidebar-card">
        <div class="sidebar-card-hdr">
          <span class="sidebar-card-title">Filters</span>
          <mat-icon style="color:#2e7d32;font-size:18px">tune</mat-icon>
        </div>

        <label class="filter-label">Diet Preference</label>
        <select class="filter-select" [(ngModel)]="filterDiet">
          <option value="">Any</option>
          <option>Vegetarian</option>
          <option>Vegan</option>
          <option>Gluten-Free</option>
          <option>Keto</option>
        </select>

        <label class="filter-label">Health Goal</label>
        <select class="filter-select" [(ngModel)]="filterGoal">
          <option value="">Any</option>
          <option>Weight Loss</option>
          <option>Muscle Gain</option>
          <option>Heart Health</option>
          <option>Energy Boost</option>
          <option>Better Sleep</option>
        </select>

        <label class="filter-label">Cooking Time</label>
        <select class="filter-select" [(ngModel)]="filterTime">
          <option value="">Any</option>
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

        <button class="apply-filters-btn" (click)="applyFilters()">Apply Filters</button>
      </div>

      <!-- Nutrition Insights -->
      <div class="sidebar-card mt-3">
        <div class="sidebar-card-hdr">
          <span class="sidebar-card-title">Nutrition Insights</span>
          <button class="period-btn">Today <mat-icon style="font-size:14px">expand_more</mat-icon></button>
        </div>
        <div class="nut-stats-row">
          <div class="nut-stat">
            <div class="nut-val">{{ nutritionLeft().calories.toLocaleString() }}</div>
            <div class="nut-lbl">Calories Left</div>
          </div>
          <div class="nut-stat">
            <div class="nut-val">{{ nutritionLeft().protein }}g</div>
            <div class="nut-lbl">Protein Left</div>
          </div>
          <div class="nut-stat">
            <div class="nut-val">{{ nutritionLeft().fiber }}g</div>
            <div class="nut-lbl">Fiber Left</div>
          </div>
        </div>
        <div class="nut-bar-track mt-3">
          <div class="nut-bar-fill" style="width:72%"></div>
        </div>
        <p class="nut-msg">
          Great job! Keep it up.
          <mat-icon style="font-size:14px;color:#4caf50;vertical-align:middle">eco</mat-icon>
        </p>
      </div>

    </div>

  </div>

  <!-- ── Bottom AI bar ──────────────────────────────────────── -->
  <div class="ai-bottom-bar">
    <div class="ai-bar-content">
      <div class="ai-bar-icon-wrap">
        <mat-icon style="color:#fff;font-size:18px;width:18px;height:18px">psychology</mat-icon>
      </div>
      <div class="ai-bar-text">
        <div class="ai-bar-label">AI Suggestion</div>
        <div class="ai-bar-msg">{{ aiSuggestionText() }}</div>
      </div>
    </div>
    <button class="ask-ai-btn" (click)="showAiSearch.set(true)">
      <mat-icon style="font-size:16px;width:16px;height:16px">add</mat-icon>
      Ask AI
    </button>
  </div>

  <!-- ── Recipe detail modal ─────────────────────────────────── -->
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

            <!-- Ingredients -->
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

            <!-- Missing -->
            @if (pr.missingIngredients.length > 0) {
              <div class="modal-missing">
                <mat-icon style="font-size:16px;color:#f57c00;flex-shrink:0">shopping_cart</mat-icon>
                <span>Need: <strong>{{ pr.missingIngredients.join(', ') }}</strong></span>
              </div>
            }

            <!-- Steps -->
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
      padding-bottom: 90px;
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
    .rec-sidebar {
      display: none;
    }
    @media (min-width: 960px) {
      .rec-sidebar {
        display: block; width: 280px; flex-shrink: 0;
        padding: 20px 16px 20px 0;
      }
      .rec-main { padding: 20px 24px; }
    }

    /* ── Page header ─────────────────────────────────────────── */
    .back-link {
      display: inline-flex; align-items: center; gap: 4px;
      background: transparent; border: none; cursor: pointer;
      font-size: 13px; color: #2e7d32; font-weight: 600;
      padding: 0; margin-bottom: 12px;
      text-decoration: none;
    }
    .rec-page-title {
      font-size: clamp(18px, 4vw, 24px); font-weight: 800;
      color: #1a2a1a; margin: 0 0 6px;
    }
    .rec-page-sub {
      font-size: 13px; color: #6b7c6b; margin: 0 0 18px;
    }

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
      color: #4a5a4a; cursor: pointer;
      transition: all 0.18s;
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
    .view-all-btn {
      background: transparent; border: none; cursor: pointer;
      font-size: 13px; color: #2e7d32; font-weight: 600;
    }

    /* ── Recipe cards grid ───────────────────────────────────── */
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

    .rec-card-img-wrap {
      position: relative; height: 148px; overflow: hidden;
    }
    .rec-card-img {
      width: 100%; height: 100%; object-fit: cover;
      transition: transform 0.3s;
    }
    .rec-card:hover .rec-card-img { transform: scale(1.05); }

    .time-badge {
      position: absolute; bottom: 8px; left: 8px;
      display: inline-flex; align-items: center; gap: 3px;
      background: rgba(27,94,32,0.88); color: #fff;
      font-size: 10px; font-weight: 600;
      padding: 3px 8px; border-radius: 20px;
      backdrop-filter: blur(4px);
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
      font-size: 10px; font-weight: 700;
      padding: 2px 7px; border-radius: 10px;
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

    /* ── Skeleton card ───────────────────────────────────────── */
    .skeleton-card { min-height: 220px; }
    .skeleton {
      background: linear-gradient(90deg, #e0e0e0 25%, #f5f5f5 50%, #e0e0e0 75%);
      background-size: 200% 100%;
      animation: shimmer 1.5s infinite;
    }
    @keyframes shimmer { 0% { background-position: 200% 0; } 100% { background-position: -200% 0; } }

    /* ── Empty state ─────────────────────────────────────────── */
    .empty-meals {
      background: #fff; border-radius: 14px; padding: 40px 20px;
      text-align: center; box-shadow: 0 2px 8px rgba(0,0,0,0.05);
    }
    .example-chip {
      padding: 7px 14px; border-radius: 20px;
      border: 1.5px solid #e0ede0; background: #fff;
      font-size: 12px; color: #2e7d32; cursor: pointer; font-weight: 500;
      transition: all 0.15s;
    }
    .example-chip:hover { background: #f1f8e9; border-color: #4caf50; }
    .cta-btn {
      display: inline-block; background: #2e7d32; color: #fff;
      border: none; border-radius: 10px; padding: 10px 22px;
      font-size: 13px; font-weight: 600; cursor: pointer;
    }

    /* ── "Because You Bought" ────────────────────────────────── */
    .ing-row {
      display: flex; gap: 16px; overflow-x: auto;
      padding-bottom: 6px; scrollbar-width: none;
    }
    .ing-card {
      display: flex; flex-direction: column; align-items: center;
      flex-shrink: 0; cursor: pointer;
      text-align: center; width: 80px;
    }
    .ing-img-wrap {
      width: 72px; height: 72px; border-radius: 50%; overflow: hidden;
      margin-bottom: 6px; border: 2px solid #e8f5e9;
    }
    .ing-img { width: 100%; height: 100%; object-fit: cover; }
    .ing-name {
      font-size: 12px; font-weight: 600; color: #1a2a1a;
      margin-bottom: 3px; line-height: 1.3;
    }
    .ing-link { font-size: 11px; color: #2e7d32; font-weight: 600; }

    /* ── AI search toggle ────────────────────────────────────── */
    .ai-toggle-btn {
      width: 100%; display: flex; align-items: center; justify-content: space-between;
      background: #fff; border: 1.5px solid #e0ede0; border-radius: 12px;
      padding: 12px 16px; cursor: pointer; transition: border-color 0.15s;
    }
    .ai-toggle-btn:hover { border-color: #4caf50; }

    /* ── AI search panel ─────────────────────────────────────── */
    .ai-search-panel {
      background: #fff; border-radius: 14px; padding: 16px;
      margin-top: 10px; box-shadow: 0 2px 8px rgba(0,0,0,0.06);
    }
    .mode-row { display: flex; gap: 8px; margin-bottom: 14px; }
    .mode-pill {
      flex: 1; display: flex; align-items: center; justify-content: center; gap: 5px;
      padding: 8px 6px; border-radius: 10px;
      border: 1.5px solid #e0ede0; background: #fff;
      font-size: 12px; font-weight: 600; color: #6b7c6b; cursor: pointer;
      transition: all 0.18s;
    }
    .mode-pill-active {
      background: var(--mc, #2e7d32) !important;
      border-color: var(--mc, #2e7d32) !important;
      color: #fff !important;
    }
    .ai-input-row {
      display: flex; gap: 10px; margin-bottom: 14px;
    }
    .ai-input {
      flex: 1; border: 1.5px solid #e0ede0; border-radius: 10px;
      padding: 10px 14px; font-size: 13px; outline: none;
      transition: border-color 0.15s;
    }
    .ai-input:focus { border-color: #4caf50; }
    .ai-search-btn {
      display: flex; align-items: center; gap: 6px;
      background: #2e7d32; color: #fff; border: none; border-radius: 10px;
      padding: 10px 16px; font-size: 13px; font-weight: 600; cursor: pointer;
      white-space: nowrap;
    }
    .ai-search-btn:disabled { opacity: 0.5; cursor: not-allowed; }
    .ai-loading {
      display: flex; align-items: center; gap: 12px;
      padding: 16px 0; justify-content: center;
    }

    /* ── Explanation card ────────────────────────────────────── */
    .explanation-card {
      background: #f8fdf8; border-radius: 12px; padding: 14px;
      border-left: 3px solid #4caf50;
    }
    .ailment-chip {
      display: inline-flex; padding: 4px 10px;
      background: #fff3e0; color: #e65100;
      border-radius: 10px; font-size: 11px; font-weight: 600;
    }

    /* ── AI card actions ─────────────────────────────────────── */
    .card-action-btn {
      display: inline-flex; align-items: center; gap: 4px;
      padding: 5px 10px; border-radius: 8px;
      font-size: 11px; font-weight: 600; cursor: pointer; border: none;
    }
    .action-like { background: #e8f5e9; color: #2e7d32; }
    .action-save { background: #e3f2fd; color: #1565c0; }

    /* ── Shopping card ───────────────────────────────────────── */
    .shopping-card {
      background: #fff; border-radius: 14px; padding: 16px;
      box-shadow: 0 2px 8px rgba(0,0,0,0.06);
    }
    .select-all-btn {
      background: transparent; border: 1.5px solid #4caf50; color: #2e7d32;
      border-radius: 8px; padding: 5px 10px; font-size: 12px; font-weight: 600;
      cursor: pointer;
    }
    .shopping-items { display: flex; flex-direction: column; gap: 4px; }
    .shopping-item {
      display: flex; align-items: center; gap: 10px; padding: 9px 10px;
      border-radius: 10px; cursor: pointer; border: 1.5px solid transparent;
      transition: all 0.15s;
    }
    .shopping-item:hover { background: #f8faf8; }
    .shopping-item.selected { background: #f1f8e9; border-color: #a5d6a7; }
    .add-pantry-btn {
      width: 100%; display: flex; align-items: center; justify-content: center; gap: 6px;
      background: #2e7d32; color: #fff; border: none; border-radius: 10px;
      padding: 11px; font-size: 13px; font-weight: 600; cursor: pointer;
    }
    .add-pantry-btn:disabled { opacity: 0.5; cursor: not-allowed; }

    /* ── Right sidebar cards ─────────────────────────────────── */
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
      color: #6b7c6b; margin-bottom: 5px; margin-top: 10px;
    }
    .filter-select {
      width: 100%; padding: 8px 10px;
      border: 1.5px solid #e0ede0; border-radius: 8px;
      font-size: 13px; color: #1a2a1a; background: #fff;
      outline: none; cursor: pointer;
    }
    .filter-select:focus { border-color: #4caf50; }
    .apply-filters-btn {
      width: 100%; background: #2e7d32; color: #fff; border: none;
      border-radius: 10px; padding: 11px; margin-top: 16px;
      font-size: 13px; font-weight: 700; cursor: pointer;
      transition: background 0.15s;
    }
    .apply-filters-btn:hover { background: #1b5e20; }
    .period-btn {
      display: inline-flex; align-items: center; gap: 2px;
      background: transparent; border: 1.5px solid #e0ede0;
      border-radius: 8px; padding: 4px 8px;
      font-size: 12px; color: #6b7c6b; cursor: pointer;
    }

    /* ── Nutrition stats ─────────────────────────────────────── */
    .nut-stats-row { display: flex; gap: 8px; }
    .nut-stat { flex: 1; text-align: center; }
    .nut-val { font-size: 16px; font-weight: 800; color: #1a2a1a; }
    .nut-lbl { font-size: 10px; color: #9e9e9e; margin-top: 2px; line-height: 1.3; }
    .nut-bar-track {
      height: 6px; background: #e8f5e9; border-radius: 6px; overflow: hidden;
    }
    .nut-bar-fill {
      height: 100%; background: #4caf50; border-radius: 6px;
      transition: width 0.8s ease;
    }
    .nut-msg {
      font-size: 12px; color: #2e7d32; font-weight: 600;
      margin: 10px 0 0; text-align: center;
    }

    /* ── Bottom AI bar ───────────────────────────────────────── */
    .ai-bottom-bar {
      position: fixed; bottom: 0; left: 0; right: 0;
      background: #1b5e20;
      display: flex; align-items: center; justify-content: space-between;
      padding: 12px 16px; z-index: 100;
      box-shadow: 0 -4px 16px rgba(0,0,0,0.15);
    }
    .ai-bar-content { display: flex; align-items: center; gap: 10px; flex: 1; min-width: 0; }
    .ai-bar-icon-wrap {
      width: 32px; height: 32px; border-radius: 50%;
      background: rgba(255,255,255,0.2);
      display: flex; align-items: center; justify-content: center; flex-shrink: 0;
    }
    .ai-bar-text { flex: 1; min-width: 0; }
    .ai-bar-label { font-size: 10px; color: rgba(255,255,255,0.65); font-weight: 600; }
    .ai-bar-msg {
      font-size: 12px; color: rgba(255,255,255,0.9);
      white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
    }
    .ask-ai-btn {
      display: inline-flex; align-items: center; gap: 4px;
      background: #fff; color: #1b5e20;
      border: none; border-radius: 20px;
      padding: 8px 16px; font-size: 13px; font-weight: 700;
      cursor: pointer; flex-shrink: 0; margin-left: 12px;
      transition: background 0.15s;
    }
    .ask-ai-btn:hover { background: #e8f5e9; }

    /* ── Recipe modal ────────────────────────────────────────── */
    .modal-backdrop {
      position: fixed; inset: 0; background: rgba(0,0,0,0.52);
      z-index: 200; display: flex; align-items: flex-end; justify-content: center;
    }
    .rec-modal {
      background: #fff; border-radius: 20px 20px 0 0;
      width: 100%; max-height: 90vh; overflow-y: auto;
      position: relative;
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
    .modal-stats-row {
      display: flex; flex-wrap: wrap; gap: 14px; margin-bottom: 14px;
    }
    .modal-stat {
      display: flex; align-items: center; gap: 4px;
      font-size: 13px; color: #6b7c6b;
    }
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
  private recService    = inject(RecommendationService);
  private snackBar      = inject(MatSnackBar);
  private pantryService = inject(PantryService);
  private http          = inject(HttpClient);
  auth                  = inject(AuthService);

  // ── Filter / UI state ──────────────────────────────────────────────────────
  activeFilterChip = signal('all');
  showAiSearch     = signal(false);
  showModal        = signal(false);
  modalRecipe      = signal<PantryRecipeMatch | null>(null);
  pantryItemsList  = signal<PantryItem[]>([]);
  nutritionLeft    = signal({ calories: 1420, protein: 68, fiber: 12 });
  likedSet         = signal<Set<string>>(new Set());
  likedIds         = computed(() => this.likedSet());
  searchText       = '';
  filterDiet       = '';
  filterGoal       = '';
  filterTime       = '';
  filterSort       = 'recommended';

  readonly fallbackImg    = 'https://images.unsplash.com/photo-1512621776951-a57141f2eefd?w=400&auto=format&fit=crop&q=80';
  readonly fallbackIngImg = 'https://images.unsplash.com/photo-1498837167922-ddd27525d352?w=120&auto=format&fit=crop&q=80';
  readonly recipeImgUrl   = recipeImgUrl;
  readonly ingImgUrl      = ingImgUrl;
  readonly nut            = estimateNutrition;
  readonly parseSteps     = parseSteps;

  readonly filterChips = [
    { key: 'all',          label: 'All Recommendations', icon: 'eco' },
    { key: 'high-protein', label: 'High Protein',         icon: 'fitness_center' },
    { key: 'low-carb',     label: 'Low Carb',             icon: 'grass' },
    { key: 'quick',        label: 'Quick & Easy',         icon: 'timer' },
    { key: 'heart',        label: 'Heart Healthy',        icon: 'favorite' },
    { key: 'weight-loss',  label: 'Weight Loss',          icon: 'monitor_weight' },
  ];

  readonly modes = [
    { key: 'pantry' as ModeKey, label: 'Pantry',  icon: 'kitchen',      color: '#2e7d32' },
    { key: 'tobuy'  as ModeKey, label: 'To-Buy',  icon: 'shopping_cart', color: '#1565c0' },
    { key: 'hybrid' as ModeKey, label: 'Hybrid',  icon: 'blender',       color: '#6a1b9a' },
  ];

  readonly examples = [
    "I'm tired and need more energy",
    "Stress is overwhelming me",
    "My stomach is constantly bloated",
    "I can't sleep at night",
  ];

  // ── Existing AI-rec state ─────────────────────────────────────────────────
  query           = '';
  activeMode      = signal<ModeKey>('pantry');
  loading         = signal(false);
  result          = signal<RecommendationResponse | null>(null);
  pantryLoading   = signal(false);
  pantryRecipes   = signal<PantryRecipeMatch[]>([]);
  activeMealFilter = signal('');
  selectedItems   = signal<Set<string>>(new Set());
  addingToCart    = signal(false);

  filteredPantryRecipes = computed(() => {
    const f = this.activeMealFilter();
    return f
      ? this.pantryRecipes().filter(pr => pr.recipe.meal_type?.toLowerCase() === f)
      : this.pantryRecipes();
  });

  displayRecipes = computed(() => {
    let recs = this.filteredPantryRecipes();
    const chip = this.activeFilterChip();
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
    if (this.filterTime === 'Under 15 mins') recs = recs.filter(pr => this.totalMin(pr.recipe) <= 15);
    if (this.filterTime === 'Under 30 mins') recs = recs.filter(pr => this.totalMin(pr.recipe) <= 30);
    if (this.filterSort === 'quickest')   recs = [...recs].sort((a,b) => this.totalMin(a.recipe) - this.totalMin(b.recipe));
    if (this.filterSort === 'best-match') recs = [...recs].sort((a,b) => b.matchPct - a.matchPct);
    return recs;
  });

  aiSuggestionText = computed(() => {
    const items = this.pantryItemsList().map(p => p.ingredient_name).slice(0, 2).join(' and ');
    return items
      ? `You have ${items} in your pantry — try adding more leafy greens this week for better fiber.`
      : "You're doing great! Try adding more whole grains and leafy greens to hit your fiber goals.";
  });

  // ── Lifecycle ─────────────────────────────────────────────────────────────
  ngOnInit() {
    this.route.queryParams.subscribe(params => {
      if (params['mode'] && ['pantry','tobuy','hybrid'].includes(params['mode'])) {
        this.activeMode.set(params['mode'] as ModeKey);
      }
      if (params['mode'] === 'pantry' || !params['mode']) {
        if (this.auth.isLoggedIn()) this.loadPantryRecipes();
        else this.loadPublicRecipes();
      }
      if (params['mood']) {
        const moodMap: Record<string,string> = {
          happy:    "I'm feeling happy, suggest foods to boost my mood further",
          calm:     "I'm feeling calm, what foods help maintain calm energy?",
          tired:    "I'm feeling tired, what should I eat for energy?",
          stressed: "I'm feeling stressed, what foods help me calm down?",
          sick:     "I'm feeling sick, what foods boost my immune system?",
        };
        this.query = moodMap[params['mood']] || `I'm feeling ${params['mood']}, what foods help?`;
        this.showAiSearch.set(true);
        this.search();
      }
      if (params['q']) { this.query = params['q']; this.showAiSearch.set(true); this.search(); }
    });
  }

  // ── Data loading ──────────────────────────────────────────────────────────
  loadPantryRecipes() {
    if (!this.auth.isLoggedIn()) return;
    this.pantryLoading.set(true);
    forkJoin({
      recipes:     this.http.get<FullRecipe[]>(`${environment.apiUrl}/recipes?limit=100`),
      pantryItems: this.pantryService.list(),
    }).pipe(catchError(() => of({ recipes: [] as FullRecipe[], pantryItems: [] as PantryItem[] })))
      .subscribe(({ recipes, pantryItems }) => {
        this.pantryItemsList.set(pantryItems);
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

  applyFilters() { /* computed reacts automatically */ }

  searchByText() {
    if (!this.searchText.trim()) return;
    this.query = this.searchText;
    this.showAiSearch.set(true);
    this.search();
  }

  searchByIngredient(name: string) {
    this.query = `What can I make with ${name}?`;
    this.showAiSearch.set(true);
    this.search();
  }

  // ── AI search ─────────────────────────────────────────────────────────────
  setMode(mode: ModeKey) {
    this.activeMode.set(mode);
    if (this.result() && this.query.trim()) this.search();
  }

  search() {
    if (!this.query.trim()) return;
    this.loading.set(true);
    this.result.set(null);
    this.selectedItems.set(new Set());
    const usePantry = this.activeMode() !== 'tobuy';
    this.recService.getRecommendations(this.query, usePantry || this.auth.isLoggedIn()).subscribe({
      next: res => { this.result.set(res); this.loading.set(false); },
      error: () => {
        this.snackBar.open('Failed to get recommendations. Please try again.', 'Close', { duration: 5000 });
        this.loading.set(false);
      },
    });
  }

  // ── Shopping list ─────────────────────────────────────────────────────────
  isSelected(name: string)   { return this.selectedItems().has(name); }
  selectedCount()            { return this.selectedItems().size; }
  toggleItem(name: string) {
    const s = new Set(this.selectedItems());
    s.has(name) ? s.delete(name) : s.add(name);
    this.selectedItems.set(s);
  }
  toggleSelectAll() {
    const list = this.result()?.shopping_list ?? [];
    this.selectedItems.set(
      this.selectedItems().size === list.length ? new Set() : new Set(list.map(i => i.ingredient_name))
    );
  }
  addToCart() {
    const items = (this.result()?.shopping_list ?? [])
      .filter(i => this.selectedItems().has(i.ingredient_name))
      .map(i => ({ ingredient_name: i.ingredient_name, quantity: i.quantity ?? null, unit: i.unit ?? null, category: null, expiry_date: null, storage_tips: null }));
    if (!items.length) return;
    this.addingToCart.set(true);
    this.pantryService.addBulk(items).subscribe({
      next: () => {
        this.addingToCart.set(false);
        this.selectedItems.set(new Set());
        this.snackBar.open(`${items.length} item${items.length > 1 ? 's' : ''} added to your pantry!`, 'View Pantry', { duration: 4000 })
          .onAction().subscribe(() => this.router.navigate(['/pantry']));
      },
      error: () => { this.addingToCart.set(false); this.snackBar.open('Failed to add items.', 'Close', { duration: 3000 }); },
    });
  }

  // ── Misc helpers ──────────────────────────────────────────────────────────
  getMatchPct(score: number): string { return (score * 100).toFixed(0); }

  feedback(meal: MealRecommendation, type: 'like' | 'dislike' | 'save') {
    this.recService.submitFeedback({ session_id: this.result()?.session_id, recipe_id: meal.recipe_id, feedback_type: type })
      .subscribe({ next: () => this.snackBar.open(type === 'save' ? 'Recipe saved!' : 'Thanks for the feedback!', '', { duration: 2500 }) });
  }
}
