import { Component, inject, signal, computed, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { MatIconModule } from '@angular/material/icon';
import { FavoritesService, ApiRecipe } from '../../core/services/favorites.service';
import { AuthService } from '../../core/services/auth.service';
import { environment } from '../../../environments/environment';
import { catchError, of, debounceTime, distinctUntilChanged, Subject, switchMap } from 'rxjs';

// ── Types ─────────────────────────────────────────────────────────────────────

type TabKey = 'pantry' | 'explore';
type SortKey = 'best' | 'fastest' | 'fewest-missing';

interface PantryItem { id: string; ingredient_name: string; quantity: string | null; unit: string | null; }

interface PantryMatch {
  recipe: ApiRecipe;
  matchPct: number;
  haveCount: number;
  missingCount: number;
  haveNames: string[];
  missingNames: string[];
}

interface AiIngredient { name: string; quantity: string | null; unit: string | null; }

interface AiRecipe {
  id: string | null;
  is_ai_generated: true;
  title: string;
  description: string | null;
  prep_time_minutes: number | null;
  cook_time_minutes: number | null;
  servings: number;
  meal_type: string | null;
  cuisine_type: string | null;
  ingredients: AiIngredient[];
  instructions: string[];
  nutritional_info: Record<string, number> | null;
  cooking_tips: string[];
  dietary_labels: string[];
  health_benefits: string[];
  ailment_tags: string[];
  image_url: string | null;
}

type DetailRecipe = ApiRecipe | AiRecipe;

// ── Constants ─────────────────────────────────────────────────────────────────

const STOP = new Set(['and','the','with','for','from','made','a','an','in','on','of','easy','quick','style','fresh','organic','healthy']);
const MEAL_TYPES = ['All', 'Breakfast', 'Lunch', 'Dinner', 'Snacks', 'Beverage'];
const DIET_TAGS  = ['Vegan', 'Vegetarian', 'Gluten Free', 'Dairy Free', 'High Protein'];
const SORT_OPTIONS: { key: SortKey; label: string }[] = [
  { key: 'best',           label: 'Best Match'    },
  { key: 'fastest',        label: 'Fastest First' },
  { key: 'fewest-missing', label: 'Least Missing' },
];
const SUGGESTED   = ['Cheese', 'Bell Pepper', 'Zucchini', 'Fresh Basil'];
const FALLBACK    = 'https://images.unsplash.com/photo-1512621776951-a57141f2eefd?w=400&auto=format&fit=crop&q=80';

// ── Helpers ───────────────────────────────────────────────────────────────────

function recipeImg(r: DetailRecipe): string {
  if (r.image_url) return r.image_url;
  const title = r.title;
  const words = title.toLowerCase().replace(/[^a-z0-9\s]/g, '').split(/\s+/)
    .filter(w => w.length > 2 && !STOP.has(w)).slice(0, 2);
  const q = words.length ? words.join(',') : 'food';
  return `https://source.unsplash.com/featured/400x260/?food,${encodeURIComponent(q)}`;
}

function totalMin(r: DetailRecipe): number {
  return (r.prep_time_minutes ?? 0) + (r.cook_time_minutes ?? 0);
}

function diffLabel(r: DetailRecipe): string {
  const m = totalMin(r);
  if (m <= 0)  return 'Quick';
  if (m <= 20) return 'Easy';
  if (m <= 40) return 'Medium';
  return 'Advanced';
}

function isAiRecipe(r: DetailRecipe): r is AiRecipe {
  return (r as AiRecipe).is_ai_generated === true;
}

function parseInstructions(raw: string | null | undefined): string[] {
  if (!raw) return [];
  return raw.split('\n').map(l => l.replace(/^\d+[\.\):\-]\s*/, '').trim()).filter(Boolean);
}

function buildMatches(recipes: ApiRecipe[], pantrySet: Set<string>): PantryMatch[] {
  return recipes.map(r => {
    const all  = r.recipe_ingredients.map(ri => ri.ingredient.name);
    const have = all.filter(n => pantrySet.has(n.toLowerCase()));
    const miss = all.filter(n => !pantrySet.has(n.toLowerCase()));
    const pct  = all.length > 0
      ? Math.round((have.length / all.length) * 100)
      : Math.round(r.efficacy_score * 100);
    return { recipe: r, matchPct: pct, haveCount: have.length, missingCount: miss.length,
             haveNames: have.slice(0, 3), missingNames: miss.slice(0, 3) };
  });
}

// ── Component ─────────────────────────────────────────────────────────────────

@Component({
  selector: 'app-meals',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, MatIconModule],
  template: `
<div class="browse-page">

  <!-- ══ HEADER ══════════════════════════════════════════════ -->
  <header class="browse-header">
    <span class="leaf lf-tl"><mat-icon>eco</mat-icon></span>
    <span class="leaf lf-tr"><mat-icon>local_florist</mat-icon></span>
    <span class="leaf lf-br"><mat-icon>eco</mat-icon></span>

    <button class="back-btn" routerLink="/">
      <mat-icon style="font-size:15px;width:15px;height:15px">arrow_back</mat-icon>
      Back to Home
    </button>
    <h1 class="browse-title">Browse Recipes</h1>
    <p class="browse-sub">Find the perfect recipe for every moment.</p>
  </header>

  <!-- ══ TAB SELECTOR ════════════════════════════════════════ -->
  <div class="tab-wrap">
    <div class="tab-seg">
      <button class="seg-btn" [class.seg-active]="activeTab() === 'pantry'" (click)="setTab('pantry')">
        <div class="seg-icon-wrap"><mat-icon class="seg-ico">kitchen</mat-icon></div>
        <div class="seg-text">
          <div class="seg-label">Based on Pantry</div>
          <div class="seg-sub">Recipes you can make with what you have</div>
        </div>
      </button>
      <div class="seg-divider"></div>
      <button class="seg-btn" [class.seg-active]="activeTab() === 'explore'" (click)="setTab('explore')">
        <div class="seg-icon-wrap"><mat-icon class="seg-ico">travel_explore</mat-icon></div>
        <div class="seg-text">
          <div class="seg-label">Explore Recipes</div>
          <div class="seg-sub">Search or discover any recipe</div>
        </div>
      </button>
    </div>
  </div>

  <!-- ══ PANTRY TAB ══════════════════════════════════════════ -->
  @if (activeTab() === 'pantry') {
  <div class="tab-pane fade-in">

    @if (!auth.isLoggedIn()) {
      <div class="login-prompt">
        <div class="login-prompt-ico"><mat-icon>kitchen</mat-icon></div>
        <h3>Sign in to unlock pantry matching</h3>
        <p>We'll match recipes with ingredients you already have at home.</p>
        <a routerLink="/auth/login" class="primary-btn">Sign In</a>
      </div>

    } @else {

      <!-- Pantry Summary Card -->
      <div class="section-pad mt-4">
        <div class="pantry-summary-card">
          <div class="pantry-count-row">
            <div class="pcount-icon"><mat-icon style="font-size:18px;width:18px;height:18px;color:#2e7d32">kitchen</mat-icon></div>
            <span class="pcount-text">
              You have <strong>{{ pantryItems().length }}</strong> ingredient{{ pantryItems().length !== 1 ? 's' : '' }} in your pantry
            </span>
          </div>
          <div class="chip-row mt-3">
            @for (name of pantryChips(); track name) {
              <span class="ing-chip">{{ name }}</span>
            }
            @if (extraChipCount() > 0) {
              <span class="ing-chip ing-chip-more">+{{ extraChipCount() }} more</span>
            }
            @if (pantryItems().length === 0 && !pantryLoading()) {
              <span class="text-muted" style="font-size:12px">No items yet — add ingredients to your pantry.</span>
            }
          </div>
        </div>
      </div>

      <!-- Empty Pantry State -->
      @if (pantryItems().length === 0 && !pantryLoading()) {
        <div class="section-pad mt-4">
          <div class="empty-card">
            <mat-icon class="empty-ico" style="color:#a5d6a7">kitchen</mat-icon>
            <h3>Your pantry is empty</h3>
            <p>Add ingredients to your pantry to get personalized recipe recommendations.</p>
            <a routerLink="/pantry" class="primary-btn">Add Pantry Items</a>
          </div>
        </div>
      } @else {

        <!-- AI Insight Bar -->
        <div class="section-pad mt-3">
          <div class="ai-bar">
            <div class="ai-bar-left">
              <div class="ai-sparkle"><mat-icon style="font-size:18px;width:18px;height:18px;color:#fff">auto_awesome</mat-icon></div>
              <div>
                <div class="ai-bar-title">
                  @if (pantryLoading()) { Analysing your pantry… }
                  @else { Great! You can cook <strong>{{ pantryMatches().length }}</strong> recipes }
                </div>
                <div class="ai-bar-sub">Based on your current pantry items</div>
              </div>
            </div>
            <select class="sort-sel" [ngModel]="sortMode()" (ngModelChange)="sortMode.set($event)">
              @for (s of sortOptions; track s.key) {
                <option [value]="s.key">{{ s.label }}</option>
              }
            </select>
          </div>
        </div>

        <!-- Recipe Grid -->
        <div class="section-pad mt-3">
          @if (pantryLoading()) {
            <div class="recipe-grid">
              @for (s of [1,2,3,4]; track s) {
                <div class="rec-card">
                  <div class="skeleton" style="height:180px;border-radius:16px 16px 0 0"></div>
                  <div class="rec-card-body">
                    <div class="skeleton mb-2" style="height:14px;width:68%;border-radius:6px"></div>
                    <div class="skeleton mb-3" style="height:10px;width:44%;border-radius:4px"></div>
                    <div class="skeleton mb-1" style="height:10px;width:90%;border-radius:4px"></div>
                    <div class="skeleton" style="height:10px;width:75%;border-radius:4px"></div>
                  </div>
                </div>
              }
            </div>
          } @else if (sortedMatches().length === 0) {
            <div class="empty-card">
              <mat-icon class="empty-ico">search_off</mat-icon>
              <h3>No matching recipes found</h3>
              <p>Add more ingredients to your pantry and we'll suggest what you can cook.</p>
              <a routerLink="/pantry" class="primary-btn">Add Pantry Items</a>
            </div>
          } @else {
            <div class="recipe-grid">
              @for (m of sortedMatches(); track m.recipe.id) {
                <div class="rec-card" (click)="openDetail(m.recipe)">

                  <div class="rec-img-wrap">
                    <img [src]="recipeImg(m.recipe)" [alt]="m.recipe.title" class="rec-img"
                         (error)="$any($event.target).src = fallback">
                    <div class="match-badge"
                         [class.match-high]="m.matchPct >= 80"
                         [class.match-mid]="m.matchPct >= 50 && m.matchPct < 80"
                         [class.match-low]="m.matchPct < 50">
                      {{ m.matchPct }}% Match
                    </div>
                    <button class="heart-btn" [class.hearted]="favSvc.favouriteIds().has(m.recipe.id)"
                      (click)="$event.stopPropagation(); favSvc.toggle(m.recipe.id, m.recipe)">
                      <mat-icon style="font-size:17px">{{ favSvc.favouriteIds().has(m.recipe.id) ? 'favorite' : 'favorite_border' }}</mat-icon>
                    </button>
                  </div>

                  <div class="rec-card-body">
                    <div class="rec-title">{{ m.recipe.title }}</div>
                    <div class="rec-meta">
                      <mat-icon class="rec-meta-ico">schedule</mat-icon>
                      {{ totalMin(m.recipe) > 0 ? totalMin(m.recipe) + ' min' : 'Quick' }}
                      <span class="rec-sep">·</span>
                      <span class="rec-diff"
                            [class.diff-easy]="diffLabel(m.recipe) === 'Easy' || diffLabel(m.recipe) === 'Quick'"
                            [class.diff-med]="diffLabel(m.recipe) === 'Medium'">{{ diffLabel(m.recipe) }}</span>
                    </div>

                    <div class="ing-info">
                      @if (m.haveCount > 0) {
                        <div class="ing-row">
                          <mat-icon class="ing-ico have-ico">check_circle</mat-icon>
                          <span class="ing-text">
                            <strong>You have:</strong>
                            {{ m.haveNames.join(', ') }}{{ m.haveCount > 3 ? ' +' + (m.haveCount - 3) : '' }}
                          </span>
                        </div>
                      }
                      @if (m.missingCount > 0) {
                        <div class="ing-row">
                          <mat-icon class="ing-ico miss-ico">remove_circle_outline</mat-icon>
                          <span class="ing-text">
                            <strong>Missing:</strong>
                            {{ m.missingNames.join(', ') }}{{ m.missingCount > 3 ? ' +' + (m.missingCount - 3) : '' }}
                          </span>
                        </div>
                      }
                      @if (m.missingCount === 0) {
                        <div class="can-make-tag">
                          <mat-icon style="font-size:12px;width:12px;height:12px">check</mat-icon> Ready to cook!
                        </div>
                      }
                    </div>

                    <button class="cook-btn" (click)="$event.stopPropagation(); openDetail(m.recipe)">
                      <mat-icon style="font-size:13px;width:13px;height:13px">restaurant</mat-icon>
                      Cook Now
                    </button>
                  </div>
                </div>
              }
            </div>
          }
        </div>

        <!-- Bottom Insight Card -->
        <div class="section-pad mt-4 mb-5">
          <div class="insight-card">
            <div class="insight-top-row">
              <div class="insight-icon"><mat-icon style="font-size:20px;width:20px;height:20px;color:#f57c00">lightbulb</mat-icon></div>
              <div>
                <div class="insight-title">Add 2 more ingredients to unlock more recipes</div>
                <div class="insight-sub">Get even better recipe matches by adding these to your pantry.</div>
              </div>
            </div>
            <div class="suggest-chips mt-3">
              @for (s of suggested; track s) {
                <button class="suggest-chip" (click)="router.navigate(['/pantry'])">
                  <mat-icon style="font-size:11px;width:11px;height:11px">add</mat-icon> {{ s }}
                </button>
              }
            </div>
            <button class="outline-btn mt-3" routerLink="/pantry">
              <mat-icon style="font-size:15px;width:15px;height:15px">shopping_cart</mat-icon>
              View All Missing Ingredients
            </button>
          </div>
        </div>

      }
    }
  </div>
  }

  <!-- ══ EXPLORE TAB ═════════════════════════════════════════ -->
  @if (activeTab() === 'explore') {
  <div class="tab-pane fade-in explore-pane">

    <!-- Search bar -->
    <div class="section-pad mt-4">
      <div class="exp-search" [class.exp-search-active]="searchText()">
        <mat-icon class="exp-search-ico">search</mat-icon>
        <input class="exp-search-input" placeholder="Search any recipe — we'll find or create it for you…"
               [ngModel]="searchText()" (ngModelChange)="onSearchChange($event)">
        @if (searchText()) {
          <button class="exp-search-clear" (click)="clearSearch()">
            <mat-icon style="font-size:15px">close</mat-icon>
          </button>
        }
      </div>
    </div>

    <!-- Meal type chips -->
    <div class="section-pad mt-3">
      <div class="filter-row">
        @for (f of mealTypes; track f) {
          <button class="filter-pill" [class.filter-pill-active]="activeFilter() === f" (click)="activeFilter.set(f)">
            {{ f }}
          </button>
        }
      </div>
    </div>

    <!-- Diet chips -->
    <div class="section-pad mt-2">
      <div class="filter-row">
        @for (d of dietTags; track d) {
          <button class="filter-pill filter-pill-diet"
                  [class.filter-pill-active]="activeDietFilter() === d"
                  (click)="toggleDiet(d)">
            {{ d }}
          </button>
        }
      </div>
    </div>

    <!-- AI Search loading -->
    @if (aiSearchLoading()) {
      <div class="section-pad mt-4">
        <div class="ai-search-loading">
          <div class="ai-search-spinner"></div>
          <div>
            <div class="ai-search-label">AI is generating this recipe…</div>
            <div class="ai-search-sub">Not found in our database — creating a fresh recipe for you</div>
          </div>
        </div>
      </div>
    }

    <!-- AI Generated Result -->
    @if (aiRecipe() && !aiSearchLoading()) {
      <div class="section-pad mt-4">
        <div class="ai-result-banner">
          <mat-icon style="font-size:16px;width:16px;height:16px;color:#fff">auto_awesome</mat-icon>
          <span>AI Generated Recipe — not in our database</span>
        </div>
        <div class="rec-card ai-rec-card" (click)="openDetail(aiRecipe()!)">
          <div class="rec-img-wrap">
            <img [src]="recipeImg(aiRecipe()!)" [alt]="aiRecipe()!.title" class="rec-img"
                 (error)="$any($event.target).src = fallback">
            <div class="ai-badge">
              <mat-icon style="font-size:11px;width:11px;height:11px">auto_awesome</mat-icon> AI
            </div>
          </div>
          <div class="rec-card-body">
            <div class="rec-title">{{ aiRecipe()!.title }}</div>
            @if (aiRecipe()!.description) {
              <p class="rec-desc">{{ aiRecipe()!.description }}</p>
            }
            <div class="rec-meta">
              <mat-icon class="rec-meta-ico">schedule</mat-icon>
              {{ totalMin(aiRecipe()!) > 0 ? totalMin(aiRecipe()!) + ' min' : 'Quick' }}
              <span class="rec-sep">·</span>
              <span class="rec-diff" [class.diff-easy]="diffLabel(aiRecipe()!) === 'Easy' || diffLabel(aiRecipe()!) === 'Quick'"
                    [class.diff-med]="diffLabel(aiRecipe()!) === 'Medium'">{{ diffLabel(aiRecipe()!) }}</span>
            </div>
            @if (aiRecipe()!.nutritional_info) {
              <div class="mini-nutrition">
                @if (aiRecipe()!.nutritional_info!['calories']) {
                  <span class="mini-nutr-chip">🔥 {{ aiRecipe()!.nutritional_info!['calories'] }} cal</span>
                }
                @if (aiRecipe()!.nutritional_info!['protein_g']) {
                  <span class="mini-nutr-chip">💪 {{ aiRecipe()!.nutritional_info!['protein_g'] }}g protein</span>
                }
              </div>
            }
            <button class="cook-btn mt-2" (click)="$event.stopPropagation(); openDetail(aiRecipe()!)">
              <mat-icon style="font-size:13px;width:13px;height:13px">menu_book</mat-icon>
              View Recipe
            </button>
          </div>
        </div>
      </div>
    }

    <!-- Result count / default label -->
    @if (!aiSearchLoading()) {
      <div class="section-pad mt-3">
        @if (searchText() && !aiRecipe()) {
          <p class="results-label">{{ filteredExplore().length }} recipe{{ filteredExplore().length !== 1 ? 's' : '' }} found</p>
        } @else if (!searchText()) {
          <p class="results-label">{{ featuredRecipes().length }} featured recipes</p>
        }
      </div>
    }

    <!-- Recipe grid -->
    <div class="section-pad mt-2 pb-5">
      @if (exploreLoading()) {
        <div class="explore-grid">
          @for (s of [1,2,3,4,5,6]; track s) {
            <div class="exp-card">
              <div class="skeleton" style="height:160px;border-radius:14px 14px 0 0"></div>
              <div style="padding:10px 12px 12px">
                <div class="skeleton mb-2" style="height:14px;width:75%;border-radius:6px"></div>
                <div class="skeleton mb-2" style="height:10px;width:90%;border-radius:4px"></div>
                <div class="skeleton" style="height:10px;width:45%;border-radius:4px"></div>
              </div>
            </div>
          }
        </div>
      } @else if (!aiRecipe() && filteredExplore().length === 0 && searchText()) {
        <!-- Empty state shown only if AI hasn't loaded yet -->
        @if (!aiSearchLoading()) {
          <div class="empty-card">
            <mat-icon class="empty-ico" style="color:#b0bec5">search_off</mat-icon>
            <h3>No recipes found</h3>
            <p>Try a different search term or clear your filters.</p>
            <button class="primary-btn" (click)="clearExplore()">Clear Filters</button>
          </div>
        }
      } @else {
        <!-- Default: 5 featured. Filtered: all matches -->
        <div class="explore-grid">
          @for (r of displayedExplore(); track r.id) {
            <div class="exp-card" (click)="openDetail(r)">
              <div class="exp-img-wrap">
                <img [src]="recipeImg(r)" [alt]="r.title" class="exp-img"
                     (error)="$any($event.target).src = fallback">
                <button class="exp-heart" [class.hearted]="favSvc.favouriteIds().has(r.id)"
                  (click)="$event.stopPropagation(); favSvc.toggle(r.id, r)">
                  <mat-icon style="font-size:15px">{{ favSvc.favouriteIds().has(r.id) ? 'favorite' : 'favorite_border' }}</mat-icon>
                </button>
                @if (r.meal_type) {
                  <div class="exp-type-badge">{{ r.meal_type | titlecase }}</div>
                }
              </div>
              <div class="exp-card-body">
                <div class="exp-title">{{ r.title }}</div>
                @if (r.description) {
                  <p class="exp-desc">{{ r.description }}</p>
                }
                <div class="exp-meta-row">
                  <mat-icon style="font-size:11px;width:11px;height:11px;color:#9e9e9e">schedule</mat-icon>
                  <span>{{ totalMin(r) > 0 ? totalMin(r) + ' min' : 'Quick' }}</span>
                  <span class="exp-dot">·</span>
                  <span>{{ diffLabel(r) }}</span>
                </div>
                @if (r.health_benefits.length > 0) {
                  <span class="exp-benefit">{{ r.health_benefits[0] }}</span>
                }
                <button class="view-btn" (click)="$event.stopPropagation(); openDetail(r)">
                  <mat-icon style="font-size:12px;width:12px;height:12px">menu_book</mat-icon>
                  View Recipe
                </button>
              </div>
            </div>
          }
        </div>

        <!-- Show all button when in default (5 featured) view -->
        @if (!searchText() && activeFilter() === 'All' && !activeDietFilter() && exploreRecipes().length > 5) {
          <div class="show-all-wrap mt-4">
            <button class="show-all-btn" (click)="showAllExplore.set(!showAllExplore())">
              <mat-icon style="font-size:15px;width:15px;height:15px">
                {{ showAllExplore() ? 'expand_less' : 'expand_more' }}
              </mat-icon>
              {{ showAllExplore() ? 'Show Less' : 'Show All ' + exploreRecipes().length + ' Recipes' }}
            </button>
          </div>
        }
      }
    </div>

  </div>
  }

  <!-- ══ FLOATING AI BUTTON ══════════════════════════════════ -->
  <button class="fab" (click)="router.navigate(['/chat'])">
    <mat-icon style="font-size:19px">smart_toy</mat-icon>
    <span>Ask AI</span>
  </button>

  <!-- ══ RECIPE DETAIL MODAL ════════════════════════════════ -->
  @if (detailOpen() && detailRecipe(); as r) {
    <div class="detail-backdrop" (click)="closeDetail()">
      <div class="detail-modal" (click)="$event.stopPropagation()">

        <div class="detail-img-wrap">
          <img [src]="recipeImg(r)" [alt]="r.title" class="detail-img"
               (error)="$any($event.target).src = fallback">
          <div class="detail-img-overlay"></div>
          <button class="d-close" (click)="closeDetail()">
            <mat-icon style="font-size:17px">close</mat-icon>
          </button>
          @if (!isAiRecipe(r)) {
            <button class="d-heart" [class.hearted]="favSvc.favouriteIds().has($any(r).id)"
              (click)="favSvc.toggle($any(r).id, $any(r))">
              <mat-icon style="font-size:19px">{{ favSvc.favouriteIds().has($any(r).id) ? 'favorite' : 'favorite_border' }}</mat-icon>
            </button>
          }
          @if (isAiRecipe(r)) {
            <div class="d-ai-badge">
              <mat-icon style="font-size:12px;width:12px;height:12px">auto_awesome</mat-icon> AI Generated
            </div>
          }
          <div class="detail-img-footer">
            <h2 class="d-title">{{ r.title }}</h2>
            <div class="d-meta-row">
              <span class="d-meta-chip">
                <mat-icon style="font-size:12px;width:12px;height:12px">schedule</mat-icon>
                {{ totalMin(r) > 0 ? totalMin(r) + ' min' : 'Quick' }}
              </span>
              <span class="d-meta-chip">
                <mat-icon style="font-size:12px;width:12px;height:12px">signal_cellular_alt</mat-icon>
                {{ diffLabel(r) }}
              </span>
              @if (r.servings) {
                <span class="d-meta-chip">
                  <mat-icon style="font-size:12px;width:12px;height:12px">people</mat-icon>
                  {{ r.servings }} servings
                </span>
              }
              @if (r.cuisine_type) {
                <span class="d-meta-chip">
                  <mat-icon style="font-size:12px;width:12px;height:12px">public</mat-icon>
                  {{ r.cuisine_type }}
                </span>
              }
            </div>
          </div>
        </div>

        <div class="detail-body">

          <!-- Tags -->
          <div class="d-tags-row">
            @for (l of r.dietary_labels.slice(0,4); track l) {
              <span class="d-tag d-tag-diet">{{ l }}</span>
            }
            @for (t of r.ailment_tags.slice(0,2); track t) {
              <span class="d-tag d-tag-ailment">{{ t }}</span>
            }
          </div>

          <!-- Description -->
          @if (r.description) {
            <p class="d-desc">{{ r.description }}</p>
          }

          <!-- Nutrition Grid -->
          @if (r.nutritional_info) {
            <div class="d-section">
              <div class="d-section-title">
                <mat-icon style="font-size:15px;width:15px;height:15px;color:#2e7d32;vertical-align:middle">bar_chart</mat-icon>
                Nutrition Info
              </div>
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
            </div>
          }

          <!-- Ingredients (AI recipe) -->
          @if (isAiRecipe(r) && r.ingredients.length > 0) {
            <div class="d-section">
              <div class="d-section-title">
                <mat-icon style="font-size:15px;width:15px;height:15px;color:#2e7d32;vertical-align:middle">grocery</mat-icon>
                Ingredients
              </div>
              <ul class="d-ing-list">
                @for (ing of r.ingredients; track ing.name) {
                  <li class="d-ing-item">
                    <span class="d-ing-dot"></span>
                    <span class="d-ing-qty">{{ ing.quantity ?? '' }} {{ ing.unit ?? '' }}</span>
                    {{ ing.name }}
                  </li>
                }
              </ul>
            </div>
          }

          <!-- Ingredients (DB recipe) -->
          @if (!isAiRecipe(r) && $any(r).recipe_ingredients?.length > 0) {
            <div class="d-section">
              <div class="d-section-title">
                <mat-icon style="font-size:15px;width:15px;height:15px;color:#2e7d32;vertical-align:middle">grocery</mat-icon>
                Ingredients
              </div>
              <ul class="d-ing-list">
                @for (ri of $any(r).recipe_ingredients; track ri.ingredient.name) {
                  <li class="d-ing-item">
                    <span class="d-ing-dot"></span>
                    <span class="d-ing-qty">{{ ri.quantity ?? '' }} {{ ri.unit ?? '' }}</span>
                    {{ ri.ingredient.name }}
                  </li>
                }
              </ul>
            </div>
          }

          <!-- Instructions (AI recipe) -->
          @if (isAiRecipe(r) && r.instructions.length > 0) {
            <div class="d-section">
              <div class="d-section-title">
                <mat-icon style="font-size:15px;width:15px;height:15px;color:#2e7d32;vertical-align:middle">format_list_numbered</mat-icon>
                Instructions
              </div>
              <ol class="d-steps-list">
                @for (step of r.instructions; track $index) {
                  <li class="d-step-item">
                    <span class="d-step-num">{{ $index + 1 }}</span>
                    <span class="d-step-text">{{ step }}</span>
                  </li>
                }
              </ol>
            </div>
          }

          <!-- Instructions (DB recipe) -->
          @if (!isAiRecipe(r) && $any(r).instructions) {
            <div class="d-section">
              <div class="d-section-title">
                <mat-icon style="font-size:15px;width:15px;height:15px;color:#2e7d32;vertical-align:middle">format_list_numbered</mat-icon>
                Instructions
              </div>
              <ol class="d-steps-list">
                @for (step of parseInstructions($any(r).instructions); track $index) {
                  <li class="d-step-item">
                    <span class="d-step-num">{{ $index + 1 }}</span>
                    <span class="d-step-text">{{ step }}</span>
                  </li>
                }
              </ol>
            </div>
          }

          <!-- Cooking Tips (AI recipe) -->
          @if (isAiRecipe(r) && r.cooking_tips.length > 0) {
            <div class="d-section">
              <div class="d-section-title">
                <mat-icon style="font-size:15px;width:15px;height:15px;color:#f57c00;vertical-align:middle">lightbulb</mat-icon>
                Cooking Tips
              </div>
              <ul class="d-tips-list">
                @for (tip of r.cooking_tips; track $index) {
                  <li class="d-tip-item">{{ tip }}</li>
                }
              </ul>
            </div>
          }

          <!-- Health Benefits -->
          @if (r.health_benefits.length > 0) {
            <div class="d-section">
              <div class="d-section-title">Health Benefits</div>
              <div class="d-benefit-chips">
                @for (b of r.health_benefits; track b) {
                  <span class="d-benefit">{{ b }}</span>
                }
              </div>
            </div>
          }

        </div>
      </div>
    </div>
  }

</div>
  `,
  styles: [`
    /* ── Base ──────────────────────────────────────────────── */
    .browse-page {
      min-height: 100vh;
      background: #f4faf4;
      padding-bottom: 100px;
      position: relative;
    }

    /* ── Header ─────────────────────────────────────────────── */
    .browse-header {
      position: relative;
      background: linear-gradient(160deg, #1b5e20 0%, #2e7d32 45%, #388e3c 100%);
      text-align: center;
      padding: 28px 24px 36px;
      overflow: hidden;
    }
    .leaf {
      position: absolute;
      opacity: 0.18;
      mat-icon { font-size: 36px; width: 36px; height: 36px; color: #fff; }
    }
    .lf-tl { top: 10px; left: 12px; transform: rotate(-20deg); }
    .lf-tr { top: 8px;  right: 14px; transform: rotate(25deg); }
    .lf-br { bottom: 10px; left: 50%; transform: translateX(-50%) rotate(5deg); }

    .back-btn {
      display: inline-flex; align-items: center; gap: 5px;
      background: rgba(255,255,255,0.15); border: 1px solid rgba(255,255,255,0.3);
      color: #fff; border-radius: 20px; padding: 6px 14px;
      font-size: 12px; font-weight: 500; cursor: pointer;
      transition: background 0.15s; margin-bottom: 16px;
      text-decoration: none;
    }
    .back-btn:hover { background: rgba(255,255,255,0.25); }

    .browse-title {
      font-size: clamp(24px, 5vw, 34px); font-weight: 900;
      color: #fff; margin: 0 0 8px; letter-spacing: -0.5px;
    }
    .browse-sub {
      font-size: 14px; color: rgba(255,255,255,0.78); margin: 0;
    }

    /* ── Tab Selector ───────────────────────────────────────── */
    .tab-wrap {
      padding: 20px 16px 0;
      background: #f4faf4;
    }
    .tab-seg {
      display: flex; background: #fff;
      border-radius: 18px; padding: 6px;
      box-shadow: 0 2px 12px rgba(0,0,0,0.08);
    }
    .seg-btn {
      flex: 1; display: flex; align-items: center; gap: 10px;
      padding: 12px 14px; border: none; background: transparent;
      border-radius: 13px; cursor: pointer; text-align: left;
      transition: background 0.2s, color 0.2s;
      color: #6b7c6b;
    }
    .seg-btn.seg-active {
      background: #2e7d32; color: #fff;
      box-shadow: 0 4px 14px rgba(46,125,50,0.35);
    }
    .seg-divider { width: 1px; background: #e8f0e8; align-self: center; height: 36px; flex-shrink: 0; }
    .seg-icon-wrap {
      width: 36px; height: 36px; border-radius: 10px;
      background: rgba(46,125,50,0.1); display: flex; align-items: center; justify-content: center;
      flex-shrink: 0; transition: background 0.2s;
    }
    .seg-btn.seg-active .seg-icon-wrap { background: rgba(255,255,255,0.2); }
    .seg-ico { font-size: 20px; width: 20px; height: 20px; color: #2e7d32; }
    .seg-btn.seg-active .seg-ico { color: #fff; }
    .seg-label { font-size: 13px; font-weight: 700; line-height: 1.2; }
    .seg-sub   { font-size: 10px; opacity: 0.75; margin-top: 2px; line-height: 1.3; }

    /* ── Tab pane ───────────────────────────────────────────── */
    .tab-pane { animation: fadeSlide 0.25s ease-out; }
    @keyframes fadeSlide {
      from { opacity: 0; transform: translateY(8px); }
      to   { opacity: 1; transform: translateY(0); }
    }

    /* ── Common section padding ─────────────────────────────── */
    .section-pad { padding: 0 16px; }
    @media (min-width: 768px) { .section-pad { padding: 0 24px; } }

    /* ── Login Prompt ───────────────────────────────────────── */
    .login-prompt {
      text-align: center; padding: 60px 32px;
    }
    .login-prompt-ico {
      width: 72px; height: 72px; border-radius: 50%;
      background: #e8f5e9; display: flex; align-items: center; justify-content: center;
      margin: 0 auto 20px;
      mat-icon { font-size: 36px; width: 36px; height: 36px; color: #2e7d32; }
    }
    .login-prompt h3 { font-size: 18px; font-weight: 700; color: #1a2a1a; margin: 0 0 8px; }
    .login-prompt p  { font-size: 14px; color: #6b7c6b; margin: 0 0 24px; }

    /* ── Pantry Summary Card ─────────────────────────────────── */
    .pantry-summary-card {
      background: #fff; border-radius: 16px;
      padding: 16px 18px; box-shadow: 0 2px 10px rgba(0,0,0,0.06);
    }
    .pantry-count-row {
      display: flex; align-items: center; gap: 10px;
    }
    .pcount-icon {
      width: 34px; height: 34px; border-radius: 10px;
      background: #e8f5e9; display: flex; align-items: center; justify-content: center;
      flex-shrink: 0;
    }
    .pcount-text { font-size: 14px; color: #1a2a1a; }
    .pcount-text strong { color: #2e7d32; }

    .chip-row { display: flex; flex-wrap: wrap; gap: 7px; }
    .ing-chip {
      padding: 4px 12px; background: #f1f8f1; border: 1px solid #c8e6c9;
      border-radius: 20px; font-size: 12px; font-weight: 500; color: #2e7d32;
    }
    .ing-chip-more {
      background: #e8f5e9; border-color: #a5d6a7; color: #1b5e20; font-weight: 600;
    }

    /* ── AI Insight Bar ─────────────────────────────────────── */
    .ai-bar {
      background: linear-gradient(135deg, #1b5e20, #2e7d32, #43a047);
      border-radius: 16px; padding: 14px 16px;
      display: flex; align-items: center; justify-content: space-between; gap: 12px;
      box-shadow: 0 4px 16px rgba(46,125,50,0.3);
    }
    .ai-bar-left { display: flex; align-items: center; gap: 12px; flex: 1; min-width: 0; }
    .ai-sparkle {
      width: 36px; height: 36px; border-radius: 10px;
      background: rgba(255,255,255,0.2); display: flex; align-items: center;
      justify-content: center; flex-shrink: 0;
    }
    .ai-bar-title { font-size: 14px; font-weight: 600; color: #fff; }
    .ai-bar-title strong { font-weight: 800; }
    .ai-bar-sub   { font-size: 11px; color: rgba(255,255,255,0.72); margin-top: 2px; }
    .sort-sel {
      background: rgba(255,255,255,0.15); border: 1px solid rgba(255,255,255,0.3);
      color: #fff; border-radius: 10px; padding: 7px 10px;
      font-size: 12px; font-weight: 500; cursor: pointer;
      flex-shrink: 0;
      option { background: #2e7d32; }
    }

    /* ── Recipe Grid ────────────────────────────────────────── */
    .recipe-grid {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: 14px;
    }
    @media (min-width: 640px)  { .recipe-grid { grid-template-columns: repeat(3, 1fr); } }
    @media (min-width: 1024px) { .recipe-grid { grid-template-columns: repeat(4, 1fr); } }

    .rec-card {
      background: #fff; border-radius: 16px; overflow: hidden;
      box-shadow: 0 2px 10px rgba(0,0,0,0.07); cursor: pointer;
      transition: transform 0.18s, box-shadow 0.18s;
      display: flex; flex-direction: column;
    }
    .rec-card:hover { transform: translateY(-3px); box-shadow: 0 8px 24px rgba(0,0,0,0.12); }
    .ai-rec-card { max-width: 340px; }

    .rec-img-wrap { position: relative; height: 160px; overflow: hidden; }
    .rec-img { width: 100%; height: 100%; object-fit: cover; display: block; transition: transform 0.3s; }
    .rec-card:hover .rec-img { transform: scale(1.05); }

    .match-badge {
      position: absolute; top: 9px; left: 9px;
      padding: 3px 9px; border-radius: 20px;
      font-size: 11px; font-weight: 700; color: #fff;
    }
    .match-high { background: #2e7d32; }
    .match-mid  { background: #f57c00; }
    .match-low  { background: #c62828; }

    .ai-badge {
      position: absolute; top: 9px; left: 9px;
      display: flex; align-items: center; gap: 3px;
      background: linear-gradient(135deg, #6a1b9a, #9c27b0);
      color: #fff; border-radius: 20px; padding: 3px 9px;
      font-size: 11px; font-weight: 700;
    }

    .heart-btn {
      position: absolute; top: 8px; right: 8px;
      width: 32px; height: 32px; border-radius: 50%;
      background: rgba(255,255,255,0.9); border: none; cursor: pointer;
      display: flex; align-items: center; justify-content: center;
      transition: transform 0.15s;
      mat-icon { color: #bdbdbd; transition: color 0.15s; }
      &.hearted mat-icon { color: #e53935; }
      &:hover { transform: scale(1.12); }
    }

    .rec-card-body { padding: 12px; flex: 1; display: flex; flex-direction: column; gap: 6px; }
    .rec-title {
      font-size: 13px; font-weight: 700; color: #1a2a1a;
      line-height: 1.3; display: -webkit-box; -webkit-line-clamp: 2;
      -webkit-box-orient: vertical; overflow: hidden;
    }
    .rec-desc {
      font-size: 11px; color: #6b7c6b; line-height: 1.4; margin: 0;
      display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;
    }
    .rec-meta {
      display: flex; align-items: center; gap: 4px;
      font-size: 11px; color: #9e9e9e;
    }
    .rec-meta-ico { font-size: 12px; width: 12px; height: 12px; color: #9e9e9e; }
    .rec-sep { margin: 0 2px; }
    .rec-diff { font-weight: 600; }
    .diff-easy { color: #2e7d32; }
    .diff-med  { color: #f57c00; }

    .mini-nutrition { display: flex; gap: 6px; flex-wrap: wrap; }
    .mini-nutr-chip {
      font-size: 10px; font-weight: 600; color: #1a2a1a;
      background: #f1f8f1; border-radius: 8px; padding: 2px 8px;
    }

    .ing-info { display: flex; flex-direction: column; gap: 4px; flex: 1; }
    .ing-row  { display: flex; align-items: flex-start; gap: 5px; }
    .ing-ico  { font-size: 13px; width: 13px; height: 13px; flex-shrink: 0; margin-top: 1px; }
    .have-ico { color: #43a047; }
    .miss-ico { color: #e53935; }
    .ing-text { font-size: 10px; color: #555; line-height: 1.4; }
    .ing-text strong { color: #1a2a1a; }

    .can-make-tag {
      display: inline-flex; align-items: center; gap: 3px;
      background: #e8f5e9; color: #2e7d32; border-radius: 8px;
      padding: 3px 8px; font-size: 10px; font-weight: 700;
    }

    .cook-btn, .view-btn {
      display: flex; align-items: center; justify-content: center; gap: 5px;
      border: none; border-radius: 10px;
      padding: 8px; font-size: 12px; font-weight: 600; cursor: pointer;
      transition: background 0.15s; margin-top: auto;
    }
    .cook-btn { background: #2e7d32; color: #fff; &:hover { background: #1b5e20; } }
    .view-btn { background: #e8f5e9; color: #2e7d32; border: 1px solid #c8e6c9; &:hover { background: #d4edda; } }

    /* ── Empty / skeleton ───────────────────────────────────── */
    .empty-card {
      background: #fff; border-radius: 16px; padding: 40px 24px;
      text-align: center; box-shadow: 0 2px 10px rgba(0,0,0,0.06);
    }
    .empty-ico { font-size: 44px; width: 44px; height: 44px; color: #a5d6a7; display: block; margin: 0 auto; }
    .empty-card h3 { font-size: 17px; font-weight: 700; color: #1a2a1a; margin: 12px 0 6px; }
    .empty-card p  { font-size: 13px; color: #6b7c6b; margin: 0 0 20px; }

    .skeleton { background: linear-gradient(90deg,#f0f0f0 25%,#e8e8e8 50%,#f0f0f0 75%); background-size: 200% 100%; animation: shimmer 1.2s infinite; }
    @keyframes shimmer { to { background-position: -200% 0; } }

    /* ── Bottom Insight Card ────────────────────────────────── */
    .insight-card {
      background: linear-gradient(135deg, #fffbf0, #fff8e1);
      border: 1.5px solid #ffe082; border-radius: 18px;
      padding: 18px; box-shadow: 0 2px 12px rgba(245,124,0,0.1);
    }
    .insight-top-row { display: flex; align-items: flex-start; gap: 12px; }
    .insight-icon {
      width: 38px; height: 38px; border-radius: 10px;
      background: rgba(245,124,0,0.12); display: flex; align-items: center;
      justify-content: center; flex-shrink: 0;
    }
    .insight-title { font-size: 14px; font-weight: 700; color: #1a2a1a; line-height: 1.4; }
    .insight-sub   { font-size: 12px; color: #6b5a3a; margin-top: 2px; }

    .suggest-chips { display: flex; flex-wrap: wrap; gap: 8px; }
    .suggest-chip {
      display: inline-flex; align-items: center; gap: 4px;
      background: #fff; border: 1.5px solid #ffc107; border-radius: 20px;
      padding: 5px 13px; font-size: 12px; font-weight: 600; color: #f57c00;
      cursor: pointer; transition: background 0.15s;
      &:hover { background: #fff8e1; }
    }
    .outline-btn {
      display: flex; align-items: center; gap: 7px; width: 100%;
      justify-content: center; background: #fff;
      border: 1.5px solid #2e7d32; color: #2e7d32;
      border-radius: 12px; padding: 11px; font-size: 13px; font-weight: 600;
      cursor: pointer; transition: background 0.15s;
      &:hover { background: #f1f8f1; }
    }

    /* ── Primary Button ─────────────────────────────────────── */
    .primary-btn {
      display: inline-flex; align-items: center; justify-content: center;
      background: #2e7d32; color: #fff; border: none;
      border-radius: 12px; padding: 12px 28px;
      font-size: 14px; font-weight: 600; cursor: pointer; text-decoration: none;
      transition: background 0.15s;
      &:hover { background: #1b5e20; }
    }

    /* ── Explore Tab ────────────────────────────────────────── */
    .explore-pane { background: #f4faf4; }

    .exp-search {
      display: flex; align-items: center; gap: 10px;
      background: #fff; border-radius: 14px; padding: 12px 16px;
      box-shadow: 0 2px 10px rgba(0,0,0,0.07);
      transition: box-shadow 0.2s;
    }
    .exp-search.exp-search-active { box-shadow: 0 4px 18px rgba(46,125,50,0.18); border: 1.5px solid #a5d6a7; }
    .exp-search-ico { font-size: 20px; width: 20px; height: 20px; color: #9e9e9e; flex-shrink: 0; }
    .exp-search-input {
      flex: 1; border: none; outline: none;
      font-size: 14px; color: #1a2a1a; background: transparent;
      &::placeholder { color: #b0b8b0; }
    }
    .exp-search-clear {
      background: none; border: none; cursor: pointer; padding: 0;
      display: flex; align-items: center; color: #9e9e9e;
    }

    /* ── AI Search Loading ──────────────────────────────────── */
    .ai-search-loading {
      display: flex; align-items: center; gap: 14px;
      background: linear-gradient(135deg, #f3e5f5, #ede7f6);
      border: 1.5px solid #ce93d8; border-radius: 14px; padding: 14px 16px;
    }
    .ai-search-spinner {
      width: 28px; height: 28px; border-radius: 50%; flex-shrink: 0;
      border: 3px solid #ce93d8; border-top-color: #9c27b0;
      animation: spin 0.8s linear infinite;
    }
    @keyframes spin { to { transform: rotate(360deg); } }
    .ai-search-label { font-size: 13px; font-weight: 700; color: #6a1b9a; }
    .ai-search-sub   { font-size: 11px; color: #9c27b0; margin-top: 2px; }

    /* ── AI Result Banner ───────────────────────────────────── */
    .ai-result-banner {
      display: flex; align-items: center; gap: 8px;
      background: linear-gradient(135deg, #6a1b9a, #9c27b0);
      color: #fff; border-radius: 10px; padding: 8px 14px;
      font-size: 12px; font-weight: 600; margin-bottom: 10px;
    }

    .filter-row { display: flex; gap: 7px; overflow-x: auto; scrollbar-width: none; padding-bottom: 2px; &::-webkit-scrollbar { display: none; } }
    .filter-pill {
      flex-shrink: 0; padding: 6px 16px; border-radius: 20px;
      border: 1.5px solid #d4e6d4; background: #fff;
      font-size: 12px; font-weight: 500; cursor: pointer; color: #5a6b5a;
      transition: all 0.15s;
      &.filter-pill-active { background: #2e7d32; border-color: #2e7d32; color: #fff; font-weight: 600; }
    }
    .filter-pill-diet {
      border-color: #c8d8e8; color: #2e5090;
      &.filter-pill-active { background: #1565c0; border-color: #1565c0; color: #fff; }
    }

    .results-label { font-size: 12px; color: #6b7c6b; margin: 0; }

    /* ── Explore Grid ───────────────────────────────────────── */
    .explore-grid {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: 12px;
    }
    @media (min-width: 640px)  { .explore-grid { grid-template-columns: repeat(3, 1fr); } }
    @media (min-width: 1024px) { .explore-grid { grid-template-columns: repeat(4, 1fr); } }

    .exp-card {
      background: #fff; border-radius: 14px; overflow: hidden;
      box-shadow: 0 2px 8px rgba(0,0,0,0.07); cursor: pointer;
      transition: transform 0.18s, box-shadow 0.18s;
      display: flex; flex-direction: column;
    }
    .exp-card:hover { transform: translateY(-3px); box-shadow: 0 8px 20px rgba(0,0,0,0.12); }

    .exp-img-wrap { position: relative; height: 160px; overflow: hidden; }
    .exp-img { width: 100%; height: 100%; object-fit: cover; display: block; transition: transform 0.3s; }
    .exp-card:hover .exp-img { transform: scale(1.06); }

    .exp-heart {
      position: absolute; top: 7px; right: 7px;
      width: 28px; height: 28px; border-radius: 50%;
      background: rgba(255,255,255,0.88); border: none; cursor: pointer;
      display: flex; align-items: center; justify-content: center;
      mat-icon { color: #bdbdbd; transition: color 0.15s; }
      &.hearted mat-icon { color: #e53935; }
    }
    .exp-type-badge {
      position: absolute; bottom: 7px; left: 7px;
      background: rgba(0,0,0,0.5); color: #fff;
      border-radius: 8px; padding: 2px 8px; font-size: 10px; font-weight: 600;
    }

    .exp-card-body { padding: 10px 12px 12px; flex: 1; display: flex; flex-direction: column; gap: 5px; }
    .exp-title {
      font-size: 13px; font-weight: 700; color: #1a2a1a; margin-bottom: 2px;
      display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;
    }
    .exp-desc {
      font-size: 11px; color: #6b7c6b; line-height: 1.4; margin: 0;
      display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;
    }
    .exp-meta-row { display: flex; align-items: center; gap: 4px; font-size: 11px; color: #9e9e9e; }
    .exp-dot { margin: 0 2px; }
    .exp-benefit {
      display: inline-block;
      background: #e8f5e9; color: #2e7d32; border-radius: 8px;
      padding: 2px 8px; font-size: 10px; font-weight: 600;
    }

    /* ── Show All Button ────────────────────────────────────── */
    .show-all-wrap { display: flex; justify-content: center; }
    .show-all-btn {
      display: flex; align-items: center; gap: 6px;
      background: #fff; border: 1.5px solid #c8e6c9; color: #2e7d32;
      border-radius: 24px; padding: 10px 24px; font-size: 13px; font-weight: 600;
      cursor: pointer; transition: all 0.15s;
      &:hover { background: #e8f5e9; border-color: #81c784; }
    }

    /* ── Floating AI Button ─────────────────────────────────── */
    .fab {
      position: fixed; bottom: 88px; right: 18px;
      display: flex; align-items: center; gap: 7px;
      background: linear-gradient(135deg, #1b5e20, #2e7d32);
      color: #fff; border: none; border-radius: 28px;
      padding: 12px 20px; font-size: 14px; font-weight: 600;
      cursor: pointer; z-index: 200;
      box-shadow: 0 6px 20px rgba(46,125,50,0.45);
      transition: transform 0.18s, box-shadow 0.18s;
      &:hover { transform: translateY(-2px); box-shadow: 0 10px 28px rgba(46,125,50,0.55); }
    }

    /* ── Recipe Detail Modal ────────────────────────────────── */
    .detail-backdrop {
      position: fixed; inset: 0; background: rgba(0,0,0,0.52); z-index: 500;
      display: flex; align-items: flex-end; justify-content: center;
    }
    .detail-modal {
      width: 100%; max-width: 560px; max-height: 90vh;
      background: #fff; border-radius: 24px 24px 0 0; overflow-y: auto;
      animation: slideUp 0.28s ease-out;
    }
    @media (min-width: 768px) {
      .detail-backdrop { align-items: center; }
      .detail-modal { border-radius: 24px; max-height: 85vh; }
    }

    .detail-img-wrap { position: relative; height: 230px; overflow: hidden; flex-shrink: 0; }
    .detail-img { width: 100%; height: 100%; object-fit: cover; display: block; }
    .detail-img-overlay {
      position: absolute; inset: 0;
      background: linear-gradient(to bottom, rgba(0,0,0,0.1) 0%, rgba(0,0,0,0.65) 100%);
    }
    .d-close, .d-heart {
      position: absolute; top: 12px; width: 34px; height: 34px; border-radius: 50%;
      background: rgba(255,255,255,0.9); border: none; cursor: pointer;
      display: flex; align-items: center; justify-content: center; z-index: 2;
    }
    .d-close  { left: 12px;  mat-icon { color: #555; } }
    .d-heart  { right: 12px; mat-icon { color: #bdbdbd; } &.hearted mat-icon { color: #e53935; } }
    .d-ai-badge {
      position: absolute; top: 14px; right: 14px; z-index: 2;
      display: flex; align-items: center; gap: 4px;
      background: linear-gradient(135deg, #6a1b9a, #9c27b0);
      color: #fff; border-radius: 20px; padding: 5px 12px;
      font-size: 11px; font-weight: 700;
    }

    .detail-img-footer {
      position: absolute; bottom: 0; left: 0; right: 0;
      padding: 16px 16px 14px; z-index: 2;
    }
    .d-title { font-size: 20px; font-weight: 800; color: #fff; margin: 0 0 8px; }
    .d-meta-row { display: flex; flex-wrap: wrap; gap: 6px; }
    .d-meta-chip {
      display: inline-flex; align-items: center; gap: 4px;
      background: rgba(255,255,255,0.22); color: #fff;
      border-radius: 8px; padding: 4px 9px; font-size: 11px; font-weight: 600;
    }

    .detail-body { padding: 16px 18px 36px; }
    .d-tags-row { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 12px; }
    .d-tag { padding: 4px 10px; border-radius: 10px; font-size: 11px; font-weight: 600; }
    .d-tag-diet    { background: #e3f2fd; color: #1565c0; }
    .d-tag-ailment { background: #e0f2f1; color: #00695c; }
    .d-desc { font-size: 14px; color: #555; line-height: 1.6; margin-bottom: 16px; }

    /* ── Nutrition Grid ─────────────────────────────────────── */
    .nutrition-grid {
      display: flex; gap: 8px; flex-wrap: wrap;
    }
    .nutr-card {
      flex: 1; min-width: 60px; border-radius: 12px;
      padding: 10px 8px; text-align: center;
    }
    .nutr-val   { font-size: 16px; font-weight: 800; color: #1a2a1a; }
    .nutr-label { font-size: 10px; font-weight: 500; color: #6b7c6b; margin-top: 2px; }
    .nutr-cal  { background: #fff3e0; }
    .nutr-pro  { background: #e8f5e9; }
    .nutr-carb { background: #e3f2fd; }
    .nutr-fat  { background: #fce4ec; }
    .nutr-fib  { background: #f3e5f5; }

    /* ── Detail Sections ────────────────────────────────────── */
    .d-section { margin-bottom: 18px; }
    .d-section-title {
      font-size: 14px; font-weight: 700; color: #1a2a1a; margin-bottom: 10px;
      padding-bottom: 6px; border-bottom: 1px solid #f0f0f0;
      display: flex; align-items: center; gap: 6px;
    }
    .d-benefit-chips { display: flex; flex-wrap: wrap; gap: 6px; }
    .d-benefit { padding: 4px 10px; background: #e8f5e9; color: #2e7d32; border-radius: 10px; font-size: 11px; font-weight: 600; }

    /* ── Ingredients List ───────────────────────────────────── */
    .d-ing-list { list-style: none; padding: 0; margin: 0; display: flex; flex-direction: column; gap: 7px; }
    .d-ing-item { display: flex; align-items: flex-start; gap: 8px; font-size: 13px; color: #444; }
    .d-ing-dot  { width: 7px; height: 7px; border-radius: 50%; background: #2e7d32; flex-shrink: 0; margin-top: 5px; }
    .d-ing-qty  { font-weight: 600; color: #2e7d32; min-width: 44px; flex-shrink: 0; }

    /* ── Steps List ─────────────────────────────────────────── */
    .d-steps-list { list-style: none; padding: 0; margin: 0; display: flex; flex-direction: column; gap: 10px; }
    .d-step-item  { display: flex; align-items: flex-start; gap: 10px; }
    .d-step-num   {
      width: 24px; height: 24px; border-radius: 50%;
      background: #2e7d32; color: #fff;
      font-size: 11px; font-weight: 800;
      display: flex; align-items: center; justify-content: center; flex-shrink: 0; margin-top: 1px;
    }
    .d-step-text  { font-size: 13px; color: #444; line-height: 1.55; }

    /* ── Tips List ──────────────────────────────────────────── */
    .d-tips-list  { list-style: none; padding: 0; margin: 0; display: flex; flex-direction: column; gap: 8px; }
    .d-tip-item   {
      font-size: 13px; color: #5a4a2a; line-height: 1.5;
      background: #fff8e1; border-left: 3px solid #ffc107;
      border-radius: 0 8px 8px 0; padding: 8px 12px;
    }

    @keyframes slideUp {
      from { transform: translateY(40px); opacity: 0; }
      to   { transform: translateY(0);    opacity: 1; }
    }

    /* ── Desktop tweaks ─────────────────────────────────────── */
    @media (min-width: 768px) {
      .browse-header { padding: 40px 40px 48px; }
      .tab-wrap { padding: 24px 40px 0; }
      .section-pad { padding: 0 40px; }
      .fab { bottom: 32px; right: 32px; }
    }

    .mt-2 { margin-top: 8px; }
    .mt-3 { margin-top: 12px; }
    .mt-4 { margin-top: 16px; }
    .mb-5 { margin-bottom: 32px; }
  `],
})
export class MealsComponent implements OnInit {
  router = inject(Router);
  auth   = inject(AuthService);
  favSvc = inject(FavoritesService);
  private http = inject(HttpClient);

  // ── State ─────────────────────────────────────────────────
  activeTab        = signal<TabKey>('pantry');

  pantryItems      = signal<PantryItem[]>([]);
  pantryLoading    = signal(true);
  rawPantryRecipes = signal<ApiRecipe[]>([]);
  sortMode         = signal<SortKey>('best');

  exploreRecipes   = signal<ApiRecipe[]>([]);
  exploreLoading   = signal(true);
  searchText       = signal('');
  activeFilter     = signal('All');
  activeDietFilter = signal('');
  showAllExplore   = signal(false);

  aiRecipe         = signal<AiRecipe | null>(null);
  aiSearchLoading  = signal(false);

  detailOpen   = signal(false);
  detailRecipe = signal<DetailRecipe | null>(null);

  private searchSubject = new Subject<string>();

  // ── Constants exposed to template ─────────────────────────
  sortOptions = SORT_OPTIONS;
  mealTypes   = MEAL_TYPES;
  dietTags    = DIET_TAGS;
  suggested   = SUGGESTED;
  fallback    = FALLBACK;

  // ── Computed ──────────────────────────────────────────────
  pantryNames = computed(() =>
    new Set(this.pantryItems().map(p => p.ingredient_name.toLowerCase()))
  );

  pantryMatches = computed(() =>
    buildMatches(this.rawPantryRecipes(), this.pantryNames())
  );

  pantryChips = computed(() =>
    this.pantryItems().slice(0, 5).map(p => p.ingredient_name)
  );

  extraChipCount = computed(() =>
    Math.max(0, this.pantryItems().length - 5)
  );

  sortedMatches = computed(() => {
    const list = [...this.pantryMatches()];
    if (this.sortMode() === 'fastest')        return list.sort((a, b) => totalMin(a.recipe) - totalMin(b.recipe));
    if (this.sortMode() === 'fewest-missing') return list.sort((a, b) => a.missingCount - b.missingCount);
    return list.sort((a, b) => b.matchPct - a.matchPct);
  });

  filteredExplore = computed(() => {
    let list = this.exploreRecipes();
    const q    = this.searchText().toLowerCase().trim();
    const meal = this.activeFilter();
    const diet = this.activeDietFilter().toLowerCase();

    if (q) list = list.filter(r =>
      r.title.toLowerCase().includes(q) ||
      r.description?.toLowerCase().includes(q) ||
      r.ailment_tags.some(t => t.toLowerCase().includes(q)) ||
      r.recipe_ingredients.some(ri => ri.ingredient.name.toLowerCase().includes(q))
    );

    if (meal !== 'All') {
      const key = meal === 'Snacks' ? 'snack' : meal === 'Beverage' ? 'beverage' : meal.toLowerCase();
      list = list.filter(r => r.meal_type?.toLowerCase() === key);
    }

    if (diet) list = list.filter(r =>
      r.dietary_labels.some(l => l.toLowerCase().includes(diet))
    );

    return list;
  });

  featuredRecipes = computed(() => this.exploreRecipes().slice(0, 5));

  displayedExplore = computed(() => {
    const q    = this.searchText().toLowerCase().trim();
    const meal = this.activeFilter();
    const diet = this.activeDietFilter();
    const isFiltered = q || meal !== 'All' || diet;
    if (isFiltered) return this.filteredExplore();
    return this.showAllExplore() ? this.exploreRecipes() : this.featuredRecipes();
  });

  // ── Lifecycle ─────────────────────────────────────────────
  ngOnInit() {
    if (this.auth.isLoggedIn()) {
      this.loadPantry();
      this.loadPantryRecipes();
      this.favSvc.load();
    } else {
      this.pantryLoading.set(false);
    }
    this.loadExploreRecipes();

    // Debounced AI search: triggers when local results are empty
    this.searchSubject.pipe(
      debounceTime(700),
      distinctUntilChanged(),
    ).subscribe(q => this.runAiSearch(q));
  }

  // ── Data ──────────────────────────────────────────────────
  private loadPantry() {
    this.http.get<PantryItem[]>(`${environment.apiUrl}/pantry`)
      .pipe(catchError(() => of([])))
      .subscribe(items => this.pantryItems.set(items));
  }

  private loadPantryRecipes() {
    this.pantryLoading.set(true);
    this.http.get<ApiRecipe[]>(`${environment.apiUrl}/recipes/from-pantry?limit=20`)
      .pipe(catchError(() => of([])))
      .subscribe(recipes => {
        this.rawPantryRecipes.set(recipes);
        this.pantryLoading.set(false);
      });
  }

  private loadExploreRecipes() {
    this.exploreLoading.set(true);
    this.http.get<ApiRecipe[]>(`${environment.apiUrl}/recipes?limit=40`)
      .pipe(catchError(() => of([])))
      .subscribe(recipes => {
        this.exploreRecipes.set(recipes);
        this.exploreLoading.set(false);
      });
  }

  private runAiSearch(q: string) {
    if (!q.trim() || this.filteredExplore().length > 0) {
      this.aiRecipe.set(null);
      this.aiSearchLoading.set(false);
      return;
    }
    this.aiSearchLoading.set(true);
    this.http.get<AiRecipe>(`${environment.apiUrl}/recipes/generate?q=${encodeURIComponent(q)}`)
      .pipe(catchError(() => of(null)))
      .subscribe(recipe => {
        this.aiRecipe.set(recipe);
        this.aiSearchLoading.set(false);
      });
  }

  // ── Actions ───────────────────────────────────────────────
  setTab(tab: TabKey) { this.activeTab.set(tab); }

  onSearchChange(q: string) {
    this.searchText.set(q);
    this.aiRecipe.set(null);
    if (!q.trim()) {
      this.aiSearchLoading.set(false);
      return;
    }
    // Start AI search after debounce
    this.searchSubject.next(q);
  }

  clearSearch() {
    this.searchText.set('');
    this.aiRecipe.set(null);
    this.aiSearchLoading.set(false);
  }

  toggleDiet(d: string) {
    this.activeDietFilter.set(this.activeDietFilter() === d ? '' : d);
  }

  clearExplore() {
    this.searchText.set('');
    this.activeFilter.set('All');
    this.activeDietFilter.set('');
    this.aiRecipe.set(null);
    this.aiSearchLoading.set(false);
  }

  openDetail(r: DetailRecipe) { this.detailRecipe.set(r); this.detailOpen.set(true); }
  closeDetail()                { this.detailOpen.set(false); this.detailRecipe.set(null); }

  readonly recipeImg        = recipeImg;
  readonly totalMin         = totalMin;
  readonly diffLabel        = diffLabel;
  readonly isAiRecipe       = isAiRecipe;
  readonly parseInstructions = parseInstructions;
}
