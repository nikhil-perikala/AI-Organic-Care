import { Component, inject, signal, computed, OnInit, OnDestroy } from '@angular/core';
import { Router } from '@angular/router';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatAutocompleteModule, MatAutocompleteSelectedEvent } from '@angular/material/autocomplete';
import { MatTooltipModule } from '@angular/material/tooltip';
import { Subject, debounceTime, distinctUntilChanged, switchMap, of, takeUntil, catchError, map } from 'rxjs';
import { PantryService, PantryItem, UsdaFood } from '../../core/services/pantry.service';

// Local ingredient list used as instant fallback when the API is unavailable
const LOCAL_INGREDIENTS = [
  'Tomato','Cherry tomatoes','Tomato paste','Tomato sauce',
  'Chicken breast','Chicken thighs','Chicken drumsticks','Ground chicken',
  'Beef steak','Ground beef','Pork chops','Lamb chops','Lamb mince',
  'Salmon fillet','Tuna','Shrimp','Cod','Sardines','Mackerel',
  'Eggs','Tofu','Tempeh','Paneer',
  'Whole milk','Butter','Cheddar cheese','Mozzarella','Greek yogurt','Heavy cream','Coconut milk',
  'Spinach','Kale','Lettuce','Arugula','Cabbage','Broccoli','Cauliflower',
  'Zucchini','Eggplant','Carrot','Beetroot','Sweet potato','Potato',
  'Bell pepper','Chilli pepper','Cucumber','Onion','Red onion','Spring onion',
  'Garlic','Ginger','Celery','Asparagus','Peas','Edamame',
  'Mushroom','Portobello mushroom','Shiitake mushroom',
  'Apple','Banana','Orange','Mango','Pineapple','Blueberries','Strawberries',
  'Raspberries','Grapes','Peach','Pear','Watermelon','Lemon','Lime','Avocado',
  'Basmati rice','Brown rice','Jasmine rice','Pasta','Spaghetti','Noodles',
  'Oats','Quinoa','Barley','Wheat flour','Bread','Cornmeal',
  'Lentils','Red lentils','Chickpeas','Black beans','Kidney beans','Mung beans',
  'Almonds','Walnuts','Cashews','Peanuts','Pistachios','Chia seeds','Flaxseeds','Sesame seeds',
  'Olive oil','Coconut oil','Sunflower oil','Vegetable oil','Sesame oil',
  'Honey','Sugar','Brown sugar','Maple syrup',
  'Salt','Black pepper','Cumin','Turmeric','Coriander','Paprika',
  'Cinnamon','Cardamom','Bay leaves','Oregano','Basil','Thyme','Rosemary',
  'Parsley','Cilantro','Dill','Mint','Chilli powder','Garam masala','Curry powder',
  'Soy sauce','Fish sauce','Oyster sauce','Worcestershire sauce',
  'Vinegar','Apple cider vinegar','Balsamic vinegar',
  'Chicken stock','Beef stock','Vegetable stock',
  'Baking powder','Baking soda','Cornstarch',
  'Dark chocolate','Cocoa powder','Vanilla extract','Almond flour','Coconut flour',
];

// ── Helpers ───────────────────────────────────────────────────────────────────

function daysLeft(expiryDate: string | null): number {
  if (!expiryDate) return Infinity;
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const exp   = new Date(expiryDate + 'T00:00:00');
  return Math.ceil((exp.getTime() - today.getTime()) / 86_400_000);
}

function statusOf(item: PantryItem): 'expired' | 'expiring' | 'fresh' {
  const d = daysLeft(item.expiry_date);
  if (d < 0)  return 'expired';
  if (d <= 7) return 'expiring';
  return 'fresh';
}

function inferCategory(description: string): string {
  const d = description.toLowerCase();
  if (/spinach|kale|lettuce|arugula|chard/.test(d))                                     return 'Leafy Greens';
  if (/chicken|beef|pork|turkey|lamb|veal/.test(d))                                     return 'Meat & Poultry';
  if (/salmon|tuna|cod|shrimp|tilapia|sardine|anchovy|herring|mackerel/.test(d))        return 'Fish & Seafood';
  if (/milk|cheese|yogurt|butter|cream|whey/.test(d))                                   return 'Dairy';
  if (/almond|walnut|pecan|cashew|pistachio|hazelnut|chia|flax|sunflower|pumpkin seed/.test(d)) return 'Nuts & Seeds';
  if (/oat|rice|wheat|barley|rye|quinoa|millet|corn|bread|pasta/.test(d))               return 'Grains';
  if (/lentil|chickpea|bean|pea|tofu|tempeh|edamame/.test(d))                           return 'Legumes';
  if (/blueberr|strawberr|raspberr|blackberr|cranberr/.test(d))                        return 'Berries';
  if (/apple|banana|orange|mango|pineapple|grape|peach|pear|plum|avocado/.test(d))      return 'Fruits';
  if (/broccoli|carrot|potato|tomato|onion|pepper|zucchini|eggplant|beet|celery/.test(d)) return 'Vegetables';
  if (/garlic|ginger|turmeric|pepper|cinnamon|cumin|oregano|basil|thyme|rosemary/.test(d)) return 'Herbs & Spices';
  if (/olive oil|coconut oil|avocado oil|vegetable oil/.test(d))                        return 'Oils';
  if (/honey|maple|sugar|stevia/.test(d))                                               return 'Sweeteners';
  return '';
}

const CAT_EMOJI: Record<string, string> = {
  'Leafy Greens': '🥬', 'Vegetables': '🥦', 'Fruits': '🍎', 'Berries': '🫐',
  'Nuts & Seeds': '🌰', 'Grains': '🌾',    'Legumes': '🫘', 'Fish & Seafood': '🐟',
  'Meat & Poultry': '🍗', 'Dairy': '🥛',  'Herbs & Spices': '🌿', 'Oils': '🫙',
  'Sweeteners': '🍯', 'Adaptogens': '🍵',
};

const CATEGORIES = [
  'Leafy Greens','Vegetables','Fruits','Berries','Nuts & Seeds','Grains',
  'Legumes','Fish & Seafood','Meat & Poultry','Dairy','Herbs & Spices',
  'Oils','Sweeteners','Adaptogens','Other',
];

const UNITS = ['g','kg','oz','lb','cup','tbsp','tsp','ml','L','bunch','piece','bag','bulb','count','can','box','pack','gallon'];

const QUICK_INGREDIENTS = ['Spinach','Kale','Ginger','Turmeric','Garlic','Almonds','Oats','Blueberries','Avocado','Quinoa','Chia Seeds','Salmon'];

// ── Component ─────────────────────────────────────────────────────────────────

@Component({
  selector: 'app-pantry',
  standalone: true,
  imports: [
    CommonModule, FormsModule, ReactiveFormsModule,
    MatIconModule, MatProgressSpinnerModule, MatSnackBarModule,
    MatAutocompleteModule, MatTooltipModule,
  ],
  template: `
<div class="pantry-page">

  <!-- ══ Page Header ══════════════════════════════════════════ -->
  <div class="card border-0 shadow-sm mb-3" style="border-radius:16px">
    <div class="card-body p-3 p-md-4">
      <div class="d-flex align-items-center gap-3 flex-wrap">
        <div class="d-flex align-items-center gap-3 flex-fill">
          <span style="font-size:28px">🌿</span>
          <div>
            <h1 class="fw-bold mb-0" style="font-size:18px;color:#1a2a1a">My Organic Pantry</h1>
            <p class="text-muted small mb-0">Track, manage &amp; get smart recommendations for your ingredients.</p>
          </div>
        </div>
        <div class="d-flex gap-2 align-items-center flex-wrap">
          <div class="rounded-3 px-3 py-2 text-center" style="background:#f8faf8;min-width:100px">
            <div class="text-muted" style="font-size:11px">Total Items</div>
            <div class="fw-bold" style="font-size:18px">{{ items().length }}</div>
          </div>
          <button class="rounded-3 px-3 py-2 text-start border-0 transition"
            [class.active-filter]="statusFilter() === 'expiring'"
            style="min-width:110px;background:#fff8f0;border:1.5px solid #ffe0b2 !important"
            (click)="filterExpiring()">
            <div class="text-muted" style="font-size:11px">Expiring Soon</div>
            <div class="fw-bold" style="font-size:18px;color:#e65100">
              {{ expiringSoon().length }}
              <span style="font-size:11px;color:#f57c00;font-weight:600;margin-left:4px">
                {{ statusFilter() === 'expiring' ? '✓' : '→' }}
              </span>
            </div>
          </button>
        </div>
      </div>
    </div>
  </div>

  <!-- ══ Critical Expiry Alert Banner ═══════════════════════ -->
  @if (criticalItems().length > 0 && !alertDismissed()) {
    <div class="expiry-alert mb-3" role="alert">
      <div class="expiry-alert-inner">
        <div class="expiry-alert-icon">⏰</div>
        <div class="flex-fill">
          <div class="fw-bold" style="font-size:14px;color:#7f1d1d">
            {{ criticalItems().length }} item{{ criticalItems().length > 1 ? 's' : '' }} expiring very soon!
          </div>
          <div style="font-size:12px;color:#991b1b;margin-top:2px">
            @for (item of criticalItems().slice(0, 3); track item.id; let last = $last) {
              <span class="fw-semibold">{{ item.ingredient_name }}</span>
              ({{ daysLeft(item.expiry_date) === 0 ? 'today' : daysLeft(item.expiry_date) + 'd left' }}){{ !last ? ' · ' : '' }}
            }
            @if (criticalItems().length > 3) {
              <span class="text-muted"> +{{ criticalItems().length - 3 }} more</span>
            }
          </div>
        </div>
        <button class="expiry-alert-btn" (click)="goToChat(criticalItems())">
          <mat-icon style="font-size:14px;vertical-align:middle">smart_toy</mat-icon>
          Cook These
        </button>
        <button class="btn-close btn-close-sm ms-1" style="opacity:.5;font-size:10px" (click)="dismissAlert()"></button>
      </div>
    </div>
  }

  <!-- ══ Main Layout ══════════════════════════════════════════ -->
  <div class="row g-3">

    <!-- ── LEFT PANEL ──────────────────────────────────────── -->
    <div class="col-12 col-md-4 col-lg-3">
      <div class="d-flex flex-column gap-3">

        <!-- Add Ingredient card -->
        <div class="card border-0 shadow-sm" style="border-radius:16px">
          <div class="card-body p-3">
            <div class="d-flex align-items-start gap-2 mb-3">
              <span style="font-size:20px">✨</span>
              <div>
                <div class="fw-bold" style="font-size:14px">Add Ingredient</div>
                <div class="text-muted" style="font-size:11px">Search from USDA whole foods database</div>
              </div>
            </div>

            <form [formGroup]="addForm" (ngSubmit)="addItem()">
              <div class="input-group mb-3" style="border:1.5px solid #e8f0e8;border-radius:10px;overflow:hidden;background:#f8faf8">
                <span class="input-group-text border-0 bg-transparent">
                  <mat-icon style="font-size:20px;color:#9e9e9e">search</mat-icon>
                </span>
                <input class="form-control border-0 bg-transparent"
                  style="font-size:13px;outline:none;box-shadow:none"
                  formControlName="ingredient_name"
                  [matAutocomplete]="auto"
                  (input)="onSearchInput($event)"
                  (blur)="autoFillCategory()"
                  placeholder="Search ingredient (e.g. Quinoa)"
                  autocomplete="off">
                <mat-autocomplete #auto="matAutocomplete" (optionSelected)="onFoodSelected($event)" panelWidth="320px">
                  @if (searching()) {
                    <mat-option disabled>
                      <span class="spinner-border spinner-border-sm me-2"></span> Searching...
                    </mat-option>
                  }
                  @for (food of foodResults(); track food.fdc_id) {
                    <mat-option [value]="food.description">
                      <div class="d-flex flex-column" style="line-height:1.3;padding:2px 0">
                        <span style="font-size:13px;font-weight:500">{{ food.description }}</span>
                        @if (food.calories != null) {
                          <span class="text-muted" style="font-size:10px">
                            {{ food.calories }} kcal · P{{ food.protein }}g · C{{ food.carbs }}g · F{{ food.fat }}g
                          </span>
                        }
                      </div>
                    </mat-option>
                  }
                </mat-autocomplete>
              </div>

              @if (selectedFood()) {
                <div class="row g-0 text-center rounded-3 mb-3 py-2" style="background:#f1f8e9">
                  <div class="col-3">
                    <div class="fw-bold" style="font-size:15px;color:#2e7d32">{{ selectedFood()!.calories ?? '—' }}</div>
                    <div class="text-muted" style="font-size:9px;text-transform:uppercase;letter-spacing:.5px">kcal</div>
                  </div>
                  <div class="col-3">
                    <div class="fw-bold" style="font-size:15px;color:#2e7d32">{{ selectedFood()!.protein ?? '—' }}g</div>
                    <div class="text-muted" style="font-size:9px;text-transform:uppercase;letter-spacing:.5px">protein</div>
                  </div>
                  <div class="col-3">
                    <div class="fw-bold" style="font-size:15px;color:#2e7d32">{{ selectedFood()!.carbs ?? '—' }}g</div>
                    <div class="text-muted" style="font-size:9px;text-transform:uppercase;letter-spacing:.5px">carbs</div>
                  </div>
                  <div class="col-3">
                    <div class="fw-bold" style="font-size:15px;color:#2e7d32">{{ selectedFood()!.fat ?? '—' }}g</div>
                    <div class="text-muted" style="font-size:9px;text-transform:uppercase;letter-spacing:.5px">fat</div>
                  </div>
                </div>
              }

              <div class="row g-2 mb-3">
                <div class="col-6">
                  <label class="form-label fw-semibold" style="font-size:11px">Category</label>
                  <select class="form-select form-select-sm" formControlName="category">
                    <option value="">Select category</option>
                    @for (cat of categories; track cat) { <option [value]="cat">{{ cat }}</option> }
                  </select>
                </div>
                <div class="col-6">
                  <label class="form-label fw-semibold" style="font-size:11px">Unit</label>
                  <select class="form-select form-select-sm" formControlName="unit">
                    <option value="">Select unit</option>
                    @for (u of units; track u) { <option [value]="u">{{ u }}</option> }
                  </select>
                </div>
                <div class="col-6">
                  <label class="form-label fw-semibold" style="font-size:11px">Quantity</label>
                  <input class="form-control form-control-sm" type="text" inputmode="decimal"
                    formControlName="quantity" placeholder="e.g. 2.5">
                </div>
                <div class="col-6">
                  <label class="form-label fw-semibold" style="font-size:11px">Expiry Date</label>
                  <input class="form-control form-control-sm" type="date" formControlName="expiry_date">
                </div>
                <div class="col-12">
                  <label class="form-label fw-semibold" style="font-size:11px">
                    Storage Tips <span class="text-muted fw-normal">(optional)</span>
                  </label>
                  <input class="form-control form-control-sm" formControlName="storage_tips" placeholder="e.g. Keep in fridge">
                </div>
              </div>

              <button class="btn btn-primary w-100 fw-bold" type="submit" [disabled]="addForm.invalid || saving()">
                @if (saving()) {
                  <span class="spinner-border spinner-border-sm me-2"></span>
                }
                + Add to Pantry
              </button>
            </form>
          </div>
        </div>

        <!-- Quick Add -->
        <div class="card border-0 shadow-sm" style="border-radius:16px">
          <div class="card-body p-3">
            <div class="fw-bold mb-2" style="font-size:14px">⚡ Quick Add</div>
            <div class="d-flex flex-wrap gap-2">
              @for (ing of quickIngredients; track ing) {
                <button class="btn btn-sm btn-outline-success rounded-pill" style="font-size:12px" (click)="quickAdd(ing)">
                  + {{ ing }}
                </button>
              }
            </div>
          </div>
        </div>

      </div>
    </div>

    <!-- ── RIGHT PANEL ─────────────────────────────────────── -->
    <div class="col-12 col-md-8 col-lg-9">
      <div class="d-flex flex-column gap-3">

        <!-- Controls bar -->
        <div class="card border-0 shadow-sm" style="border-radius:14px">
          <div class="card-body p-3 d-flex align-items-center gap-2 flex-wrap">
            <div class="fw-bold me-2 d-flex align-items-center gap-2" style="font-size:16px">
              My Pantry
              <span class="badge rounded-pill" style="background:#4caf50;color:#fff;font-size:12px">{{ filteredItems().length }}</span>
            </div>
            <div class="d-flex align-items-center gap-2 ms-auto flex-wrap">
              <select class="form-select form-select-sm" style="width:auto;font-size:12px"
                [ngModel]="catFilter()" (ngModelChange)="catFilter.set($event)">
                <option value="">All Categories</option>
                @for (cat of categories; track cat) { <option [value]="cat">{{ cat }}</option> }
              </select>
              <div class="input-group input-group-sm" style="width:180px">
                <span class="input-group-text border-end-0 bg-light">
                  <mat-icon style="font-size:16px;color:#9e9e9e">search</mat-icon>
                </span>
                <input class="form-control border-start-0 bg-light" style="font-size:12px"
                  placeholder="Search pantry…"
                  [ngModel]="searchFilter()" (ngModelChange)="searchFilter.set($event)">
              </div>
              <div class="btn-group btn-group-sm">
                <button class="btn" [class.btn-success]="viewMode==='table'" [class.btn-outline-secondary]="viewMode!=='table'"
                  (click)="viewMode='table'">
                  <mat-icon style="font-size:16px;line-height:1;vertical-align:middle">table_rows</mat-icon>
                </button>
                <button class="btn" [class.btn-success]="viewMode==='grid'" [class.btn-outline-secondary]="viewMode!=='grid'"
                  (click)="viewMode='grid'">
                  <mat-icon style="font-size:16px;line-height:1;vertical-align:middle">grid_view</mat-icon>
                </button>
              </div>
            </div>
          </div>
        </div>

        <!-- Expiring filter banner -->
        @if (statusFilter() === 'expiring') {
          <div class="alert d-flex align-items-center gap-2 py-2 mb-0" id="expiring-list"
            style="background:#fff8f0;border:1.5px solid #ffe0b2;color:#e65100;border-radius:10px">
            <mat-icon style="font-size:18px;flex-shrink:0">warning_amber</mat-icon>
            <span class="flex-fill small">
              Showing <strong>{{ filteredItems().length }}</strong> item{{ filteredItems().length !== 1 ? 's' : '' }} expiring within 7 days
            </span>
            <button class="btn btn-sm btn-outline-warning py-0 px-2" style="font-size:12px" (click)="clearStatusFilter()">
              Clear ✕
            </button>
          </div>
        }

        <!-- Loading skeleton -->
        @if (loading()) {
          <div class="card border-0 shadow-sm" style="border-radius:14px;overflow:hidden">
            @for (sk of [1,2,3,4,5]; track sk) {
              <div class="skeleton-row" [style.border-top]="sk > 1 ? '1px solid #f0f4f0' : 'none'">
                <div class="sk-block sk-name"></div>
                <div class="sk-block sk-tag"></div>
                <div class="sk-block sk-short"></div>
                <div class="sk-block sk-short"></div>
                <div class="sk-block sk-badge"></div>
              </div>
            }
          </div>
        } @else if (filteredItems().length === 0) {
          @if (items().length === 0) {
            <div class="card border-0 shadow-sm text-center py-4 px-3" style="border-radius:14px">
              <div style="font-size:48px">🌿</div>
              <div class="fw-bold mt-3" style="font-size:16px;color:#1a2a1a">Your pantry is empty</div>
              <p class="text-muted small mt-1 mb-3">Start tracking your ingredients to get personalised recipes and expiry alerts.</p>
              <button class="btn btn-success px-4 py-2 mx-auto" style="border-radius:12px;font-weight:700;font-size:14px"
                (click)="showOnboarding.set(true)">
                <mat-icon style="font-size:16px;vertical-align:middle;margin-right:4px">auto_awesome</mat-icon>
                Get Started
              </button>
            </div>
          } @else {
            <div class="card border-0 shadow-sm text-center py-5" style="border-radius:14px">
              <div style="font-size:40px">🔍</div>
              <p class="text-muted mt-3 mb-2">No items match your search.</p>
            </div>
          }
        } @else if (viewMode === 'table') {
          <div class="card border-0 shadow-sm" style="border-radius:14px;overflow:hidden">
            <div class="table-responsive">
              <table class="table table-hover align-middle mb-0" style="font-size:13px">
                <thead class="table-light">
                  <tr>
                    <th class="ps-3">Ingredient <span class="text-muted ms-1" style="font-size:11px">⇅</span></th>
                    <th>Unit <span class="text-muted" style="font-size:11px">⇅</span></th>
                    <th>Qty <span class="text-muted" style="font-size:11px">⇅</span></th>
                    <th>Added <span class="text-muted" style="font-size:11px">⇅</span></th>
                    <th>Expiry <span class="text-muted" style="font-size:11px">⇅</span></th>
                    <th>Status</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  @for (item of filteredItems(); track item.id) {
                    <tr [class]="'row-' + itemStatus(item)" (click)="openDetail(item)" style="cursor:pointer">
                      <td class="ps-3">
                        <div class="d-flex align-items-center gap-2">
                          <div class="rounded-3 d-flex align-items-center justify-content-center flex-shrink-0"
                            [style.background]="catBg(item.category)" style="width:36px;height:36px;font-size:18px">
                            {{ catEmoji(item.category) }}
                          </div>
                          <div>
                            <div class="fw-semibold" style="color:#1a2a1a;white-space:nowrap">{{ item.ingredient_name }}</div>
                            @if (item.category) {
                              <div class="text-muted" style="font-size:11px">{{ item.category }}</div>
                            }
                          </div>
                        </div>
                      </td>
                      <td class="text-muted">{{ item.unit || '—' }}</td>
                      <td class="text-muted">{{ item.quantity || '—' }}</td>
                      <td class="text-muted" style="white-space:nowrap">
                        {{ item.added_at | date:'MMM d, y' }}
                      </td>
                      <td>
                        @if (item.expiry_date) {
                          <div style="white-space:nowrap">{{ item.expiry_date | date:'MMM d, y' }}</div>
                          <div class="fw-semibold" style="font-size:11px;white-space:nowrap"
                            [style.color]="itemStatus(item)==='fresh'?'#2e7d32':itemStatus(item)==='expiring'?'#f57c00':'#c62828'">
                            {{ daysLeftLabel(item) }}
                          </div>
                        } @else {
                          <span class="text-muted">—</span>
                        }
                      </td>
                      <td>
                        <span class="status-badge" [class]="'status-' + (item.expiry_date ? itemStatus(item) : 'none')">
                          @if (itemStatus(item) === 'expiring') { ⚠ Expiring Soon }
                          @else if (itemStatus(item) === 'expired') { ✕ Expired }
                          @else if (!item.expiry_date) { No date }
                          @else { ✓ Fresh }
                        </span>
                      </td>
                      <td>
                        <div class="d-flex gap-1">
                          <button class="btn btn-sm btn-light p-1" (click)="$event.stopPropagation(); openEditModal(item)"
                            [matTooltip]="'Edit ' + item.ingredient_name" style="border-radius:6px">
                            <mat-icon style="font-size:16px;color:#1565c0;line-height:1;display:block">edit</mat-icon>
                          </button>
                          <button class="btn btn-sm btn-light p-1" (click)="$event.stopPropagation(); removeItem(item.id)"
                            [matTooltip]="'Remove ' + item.ingredient_name" style="border-radius:6px">
                            <mat-icon style="font-size:16px;color:#9e9e9e;line-height:1;display:block">delete_outline</mat-icon>
                          </button>
                        </div>
                      </td>
                    </tr>
                  }
                </tbody>
              </table>
            </div>
          </div>
        } @else {
          <div class="row g-3">
            @for (item of filteredItems(); track item.id) {
              <div class="col-6 col-md-4 col-lg-3">
                <div class="card border-0 shadow-sm h-100 position-relative pantry-card"
                  [class]="'pantry-card card-' + itemStatus(item)"
                  (click)="openDetail(item)" style="cursor:pointer">
                  <div class="card-accent" [class]="'accent-' + itemStatus(item)"></div>
                  <div class="card-body p-3 d-flex flex-column gap-1">
                    <div class="mb-2" style="font-size:28px">{{ catEmoji(item.category) }}</div>
                    <div class="fw-bold" style="font-size:13px;color:#1a2a1a">{{ item.ingredient_name }}</div>
                    @if (item.category) { <div class="text-muted" style="font-size:11px">{{ item.category }}</div> }
                    <div class="d-flex flex-column gap-1 mt-1" style="font-size:11px;color:#6b7c6b">
                      @if (item.quantity) { <span>{{ item.quantity }} {{ item.unit }}</span> }
                      @if (item.expiry_date) {
                        <span class="fw-semibold"
                          [style.color]="itemStatus(item)==='expired'?'#c62828':itemStatus(item)==='expiring'?'#f57c00':'#2e7d32'">
                          {{ daysLeftLabel(item) }}
                        </span>
                      }
                      <span style="color:#b0b8b0">Added {{ item.added_at | date:'MMM d, y' }}</span>
                    </div>
                    <span class="status-badge mt-auto align-self-start" [class]="'status-' + (item.expiry_date ? itemStatus(item) : 'none')">
                      @if (itemStatus(item) === 'expiring') { ⚠ Expiring }
                      @else if (itemStatus(item) === 'expired') { ✕ Expired }
                      @else if (!item.expiry_date) { No date }
                      @else { ✓ Fresh }
                    </span>
                  </div>
                  <div class="card-actions position-absolute top-0 end-0 p-1 d-flex gap-1 opacity-0">
                    <button class="btn btn-sm btn-light p-1" style="border-radius:6px" (click)="$event.stopPropagation(); openEditModal(item)">
                      <mat-icon style="font-size:14px;color:#1565c0;line-height:1;display:block">edit</mat-icon>
                    </button>
                    <button class="btn btn-sm btn-light p-1" style="border-radius:6px" (click)="$event.stopPropagation(); removeItem(item.id)">
                      <mat-icon style="font-size:14px;color:#9e9e9e;line-height:1;display:block">delete_outline</mat-icon>
                    </button>
                  </div>
                </div>
              </div>
            }
          </div>
        }


      </div>
    </div>

  </div>
</div>

<!-- ════════════════════════════════════════════════════════════
     Onboarding Modal
     ════════════════════════════════════════════════════════════ -->
@if (showOnboarding()) {
  <div class="modal-overlay" (click)="closeOnboarding()">
    <div class="card border-0 shadow-lg modal-card" style="border-radius:20px;overflow:hidden" (click)="$event.stopPropagation()">

      <!-- Step indicators -->
      <div class="onboard-steps">
        @for (s of [0,1,2]; track s) {
          <div class="onboard-dot" [class.onboard-dot-active]="onboardStep() === s" (click)="onboardStep.set(s)"></div>
        }
      </div>

      <!-- Step content -->
      @if (onboardStep() === 0) {
        <div class="onboard-body">
          <div class="onboard-icon">🌿</div>
          <div class="onboard-title">Track Your Ingredients</div>
          <div class="onboard-desc">Add what you have in your kitchen. Set expiry dates and get alerts before food goes to waste.</div>
        </div>
      } @else if (onboardStep() === 1) {
        <div class="onboard-body">
          <div class="onboard-icon">⏰</div>
          <div class="onboard-title">Never Waste Food Again</div>
          <div class="onboard-desc">We track expiry dates and alert you when items are about to expire so you can cook them first.</div>
        </div>
      } @else {
        <div class="onboard-body">
          <div class="onboard-icon">🤖</div>
          <div class="onboard-title">AI Recipes From Your Pantry</div>
          <div class="onboard-desc">Ask the AI what to cook with exactly what you have. Personalised recipes, instantly.</div>
        </div>
      }

      <!-- Navigation -->
      <div class="onboard-footer">
        @if (onboardStep() < 2) {
          <button class="btn btn-light px-4" style="border-radius:10px" (click)="closeOnboarding()">Skip</button>
          <button class="btn btn-success px-4" style="border-radius:10px;font-weight:700"
            (click)="onboardStep.set(onboardStep() + 1)">
            Next →
          </button>
        } @else {
          <button class="btn btn-success w-100 py-3" style="border-radius:12px;font-size:16px;font-weight:800"
            (click)="closeOnboarding()">
            Start Adding Ingredients 🚀
          </button>
        }
      </div>
    </div>
  </div>
}

<!-- ════════════════════════════════════════════════════════════
     Item Detail Panel
     ════════════════════════════════════════════════════════════ -->
@if (selectedItem()) {
  <div class="detail-overlay" (click)="closeDetail()">
    <div class="detail-panel" (click)="$event.stopPropagation()">
      <div class="detail-handle"></div>

      <!-- Header -->
      <div class="detail-header">
        <div class="detail-emoji">{{ catEmoji(selectedItem()!.category) }}</div>
        <div class="detail-title-block">
          <div class="detail-name">{{ selectedItem()!.ingredient_name }}</div>
          @if (selectedItem()!.category) {
            <div class="detail-cat">{{ selectedItem()!.category }}</div>
          }
        </div>
        <button class="detail-close" (click)="closeDetail()">
          <mat-icon>close</mat-icon>
        </button>
      </div>

      <!-- Days bar -->
      <div class="detail-section">
        @if (selectedItem()!.expiry_date) {
          <div class="detail-label">Freshness</div>
          <div class="days-bar-wrap">
            <div class="days-bar-track">
              <div class="days-bar-fill"
                [style.width]="daysBarPct(selectedItem()!) + '%'"
                [style.background]="itemStatus(selectedItem()!)==='fresh' ? '#4caf50' : itemStatus(selectedItem()!)==='expiring' ? '#ff9800' : '#f44336'">
              </div>
            </div>
            <div class="days-bar-label"
              [style.color]="itemStatus(selectedItem()!)==='fresh' ? '#2e7d32' : itemStatus(selectedItem()!)==='expiring' ? '#e65100' : '#c62828'">
              @if (daysLeft(selectedItem()!.expiry_date) < 0) {
                Expired {{ -daysLeft(selectedItem()!.expiry_date) }} day{{ -daysLeft(selectedItem()!.expiry_date) !== 1 ? 's' : '' }} ago
              } @else if (daysLeft(selectedItem()!.expiry_date) === 0) {
                Expires today!
              } @else {
                {{ daysLeft(selectedItem()!.expiry_date) }} day{{ daysLeft(selectedItem()!.expiry_date) !== 1 ? 's' : '' }} left
              }
            </div>
          </div>
        } @else {
          <div class="detail-label">Expiry</div>
          <div class="detail-value text-muted">No expiry date set</div>
        }
      </div>

      <!-- Info grid -->
      <div class="detail-info-grid">
        @if (selectedItem()!.quantity) {
          <div class="detail-info-cell">
            <div class="detail-info-label">Quantity</div>
            <div class="detail-info-val">{{ selectedItem()!.quantity }} {{ selectedItem()!.unit }}</div>
          </div>
        }
        @if (selectedItem()!.expiry_date) {
          <div class="detail-info-cell">
            <div class="detail-info-label">Expiry Date</div>
            <div class="detail-info-val">{{ selectedItem()!.expiry_date | date:'MMM d, y' }}</div>
          </div>
        }
        <div class="detail-info-cell">
          <div class="detail-info-label">Added</div>
          <div class="detail-info-val">{{ selectedItem()!.added_at | date:'MMM d, y' }}</div>
        </div>
        <div class="detail-info-cell">
          <div class="detail-info-label">Status</div>
          <div class="detail-info-val">
            <span class="status-badge" [class]="'status-' + (selectedItem()!.expiry_date ? itemStatus(selectedItem()!) : 'none')">
              @if (itemStatus(selectedItem()!) === 'expiring') { ⚠ Expiring Soon }
              @else if (itemStatus(selectedItem()!) === 'expired') { ✕ Expired }
              @else if (!selectedItem()!.expiry_date) { No date }
              @else { ✓ Fresh }
            </span>
          </div>
        </div>
      </div>

      @if (selectedItem()!.storage_tips) {
        <div class="detail-section">
          <div class="detail-label">Storage Tips</div>
          <div class="detail-tips">{{ selectedItem()!.storage_tips }}</div>
        </div>
      }

      <!-- Actions -->
      <div class="detail-actions">
        <button class="detail-ai-btn" (click)="askAIAbout(selectedItem()!)">
          <mat-icon style="font-size:18px">smart_toy</mat-icon>
          Ask AI for Recipes
        </button>
        <button class="detail-edit-btn" (click)="openEditModal(selectedItem()!); closeDetail()">
          <mat-icon style="font-size:18px">edit</mat-icon>
          Edit
        </button>
      </div>
    </div>
  </div>
}

<!-- ════════════════════════════════════════════════════════════
     Edit Modal
     ════════════════════════════════════════════════════════════ -->
@if (editingItem()) {
  <div class="modal-overlay" (click)="closeEditModal()">
    <div class="card border-0 shadow-lg modal-card" (click)="$event.stopPropagation()" style="border-radius:18px">
      <div class="card-body p-4">
        <div class="d-flex align-items-center justify-content-between mb-3">
          <div class="fw-bold" style="font-size:16px">✏️ Edit Ingredient</div>
          <button class="btn btn-sm btn-light rounded-circle p-1" (click)="closeEditModal()">
            <mat-icon style="font-size:20px;color:#9e9e9e;line-height:1;display:block">close</mat-icon>
          </button>
        </div>
        <form [formGroup]="editForm" (ngSubmit)="saveEdit()">
          <div class="mb-3">
            <label class="form-label fw-semibold small">Ingredient Name</label>
            <input class="form-control" formControlName="ingredient_name" placeholder="Ingredient name">
          </div>
          <div class="row g-2 mb-3">
            <div class="col-6">
              <label class="form-label fw-semibold small">Category</label>
              <select class="form-select form-select-sm" formControlName="category">
                <option value="">Select category</option>
                @for (cat of categories; track cat) { <option [value]="cat">{{ cat }}</option> }
              </select>
            </div>
            <div class="col-6">
              <label class="form-label fw-semibold small">Unit</label>
              <select class="form-select form-select-sm" formControlName="unit">
                <option value="">Select unit</option>
                @for (u of units; track u) { <option [value]="u">{{ u }}</option> }
              </select>
            </div>
            <div class="col-6">
              <label class="form-label fw-semibold small">Quantity</label>
              <input class="form-control form-control-sm" type="number" min="0" step="0.1"
                formControlName="quantity" placeholder="0.0">
            </div>
            <div class="col-6">
              <label class="form-label fw-semibold small">Expiry Date</label>
              <input class="form-control form-control-sm" type="date" formControlName="expiry_date">
            </div>
            <div class="col-12">
              <label class="form-label fw-semibold small">
                Storage Tips <span class="text-muted fw-normal">(optional)</span>
              </label>
              <input class="form-control form-control-sm" formControlName="storage_tips" placeholder="e.g. Keep in fridge">
            </div>
          </div>
          <div class="d-flex justify-content-end gap-2">
            <button type="button" class="btn btn-light fw-semibold" (click)="closeEditModal()">Cancel</button>
            <button type="submit" class="btn btn-primary fw-bold" [disabled]="editForm.invalid || editSaving()">
              @if (editSaving()) { <span class="spinner-border spinner-border-sm me-2"></span> }
              Save Changes
            </button>
          </div>
        </form>
      </div>
    </div>
  </div>
}
  `,
  styles: [`
    .pantry-page { padding: 20px 16px 80px; background: #f7f9f7; min-height: 100vh; }

    @media (min-width: 768px) {
      .pantry-page { padding: 24px 32px 40px; max-width: 1280px; margin: 0 auto; }
    }

    /* Grid card hover actions */
    .card:hover .card-actions { opacity: 1 !important; }

    /* Modal overlay */
    .modal-overlay {
      position: fixed; inset: 0; background: rgba(0,0,0,0.5);
      display: flex; align-items: center; justify-content: center;
      z-index: 1000; padding: 16px;
    }
    .modal-card { width: 100%; max-width: 480px; max-height: 90vh; overflow-y: auto; }

    /* Active filter button */
    .active-filter { background: #f57c00 !important; border-color: #f57c00 !important; color: #fff !important; }

    /* ── Critical expiry alert banner ── */
    .expiry-alert {
      background: linear-gradient(135deg, #fef2f2, #fee2e2);
      border: 1.5px solid #fca5a5;
      border-left: 4px solid #ef4444;
      border-radius: 12px;
      animation: slideDown 0.3s ease-out;
    }
    @keyframes slideDown {
      from { opacity: 0; transform: translateY(-8px); }
      to   { opacity: 1; transform: translateY(0); }
    }
    .expiry-alert-inner {
      display: flex; align-items: center; gap: 12px;
      padding: 12px 14px;
    }
    .expiry-alert-icon { font-size: 22px; flex-shrink: 0; }
    .expiry-alert-btn {
      display: inline-flex; align-items: center; gap: 4px;
      background: #ef4444; color: #fff; border: none;
      border-radius: 8px; padding: 6px 12px;
      font-size: 12px; font-weight: 600; cursor: pointer;
      flex-shrink: 0; white-space: nowrap;
      transition: background 0.15s;
    }
    .expiry-alert-btn:hover { background: #dc2626; }

    /* ── Expiry status: table row left-border stripe ── */
    tr.row-expired  { border-left: 4px solid #ef5350; background: #fff8f8; }
    tr.row-expiring { border-left: 4px solid #ffa726; background: #fffaf5; }
    tr.row-fresh    { border-left: 4px solid #66bb6a; }

    /* ── Expiry status: grid card top accent bar ── */
    .pantry-card { border-radius: 14px; transition: box-shadow .15s; overflow: hidden; }
    .card-accent { height: 4px; width: 100%; }
    .accent-expired  { background: #ef5350; }
    .accent-expiring { background: #ffa726; }
    .accent-fresh    { background: #66bb6a; }
    .card-expired    { background: #fff8f8; }
    .card-expiring   { background: #fffaf5; }

    /* ── Status badge ── */
    .status-badge {
      display: inline-flex; align-items: center;
      padding: 2px 8px; border-radius: 20px;
      font-size: 11px; font-weight: 600;
    }
    .status-fresh    { background: #e8f5e9; color: #2e7d32; }
    .status-expiring { background: #fff3e0; color: #e65100; }
    .status-expired  { background: #ffebee; color: #c62828; }
    .status-none     { background: #f5f5f5; color: #9e9e9e; }

    /* ── Onboarding Modal ── */
    .onboard-steps {
      display: flex; justify-content: center; gap: 8px; padding: 20px 0 0;
    }
    .onboard-dot {
      width: 8px; height: 8px; border-radius: 50%; background: #e0e0e0;
      cursor: pointer; transition: all 0.2s;
    }
    .onboard-dot-active { background: #2e7d32; width: 24px; border-radius: 4px; }
    .onboard-body {
      display: flex; flex-direction: column; align-items: center; text-align: center;
      padding: 24px 28px 20px;
    }
    .onboard-icon { font-size: 52px; margin-bottom: 16px; }
    .onboard-title { font-size: 20px; font-weight: 800; color: #1a2a1a; margin-bottom: 10px; }
    .onboard-desc { font-size: 14px; color: #6b7c6b; line-height: 1.65; max-width: 280px; }
    .onboard-footer {
      display: flex; gap: 10px; padding: 0 24px 24px;
      justify-content: space-between;
    }

    /* ── Item Detail Panel ── */
    .detail-overlay {
      position: fixed; inset: 0; background: rgba(0,0,0,0.45);
      z-index: 1050; display: flex; align-items: flex-end;
      animation: fadeIn 0.2s ease;
    }
    @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
    .detail-panel {
      background: #fff; width: 100%; max-height: 85vh; overflow-y: auto;
      border-radius: 20px 20px 0 0; padding: 0 0 24px;
      animation: slideUp 0.28s cubic-bezier(0.34,1.56,0.64,1);
    }
    @keyframes slideUp {
      from { transform: translateY(100%); }
      to   { transform: translateY(0); }
    }
    .detail-handle {
      width: 40px; height: 4px; border-radius: 2px; background: #e0e0e0;
      margin: 12px auto 0;
    }
    .detail-header {
      display: flex; align-items: center; gap: 14px;
      padding: 16px 20px 12px;
      border-bottom: 1px solid #f0f4f0;
    }
    .detail-emoji {
      font-size: 36px; line-height: 1; flex-shrink: 0;
      background: #f4f9f4; border-radius: 12px;
      width: 56px; height: 56px; display: flex; align-items: center; justify-content: center;
    }
    .detail-title-block { flex: 1; min-width: 0; }
    .detail-name { font-size: 18px; font-weight: 800; color: #1a2a1a; }
    .detail-cat  { font-size: 13px; color: #6b7c6b; margin-top: 2px; }
    .detail-close {
      width: 36px; height: 36px; border-radius: 50%; border: none;
      background: #f5f5f5; cursor: pointer; flex-shrink: 0;
      display: flex; align-items: center; justify-content: center;
      mat-icon { font-size: 20px; color: #9e9e9e; }
      &:hover { background: #e8e8e8; }
    }
    .detail-section { padding: 14px 20px; border-bottom: 1px solid #f0f4f0; }
    .detail-label { font-size: 11px; font-weight: 700; color: #9e9e9e; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 8px; }
    .detail-value { font-size: 14px; color: #1a2a1a; }
    .days-bar-wrap { }
    .days-bar-track {
      height: 8px; background: #f0f4f0; border-radius: 4px; overflow: hidden; margin-bottom: 6px;
    }
    .days-bar-fill { height: 100%; border-radius: 4px; transition: width 0.4s ease; }
    .days-bar-label { font-size: 13px; font-weight: 700; }
    .detail-info-grid {
      display: grid; grid-template-columns: 1fr 1fr;
      gap: 0; border-bottom: 1px solid #f0f4f0;
    }
    .detail-info-cell {
      padding: 12px 20px;
      &:nth-child(odd) { border-right: 1px solid #f0f4f0; }
    }
    .detail-info-label { font-size: 11px; font-weight: 700; color: #9e9e9e; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 4px; }
    .detail-info-val   { font-size: 14px; font-weight: 600; color: #1a2a1a; }
    .detail-tips {
      font-size: 13px; color: #4a5a4a; line-height: 1.6;
      background: #f4f9f4; border-radius: 10px; padding: 10px 14px;
    }
    .detail-actions {
      display: flex; gap: 12px; padding: 16px 20px 0;
    }
    .detail-ai-btn {
      flex: 1; display: flex; align-items: center; justify-content: center; gap: 8px;
      background: linear-gradient(135deg, #2e7d32, #1b5e20); color: #fff;
      border: none; border-radius: 14px; padding: 14px;
      font-size: 15px; font-weight: 700; cursor: pointer; font-family: inherit;
      box-shadow: 0 3px 12px rgba(46,125,50,0.28);
      transition: transform 0.15s, box-shadow 0.15s;
      &:hover { transform: translateY(-1px); box-shadow: 0 5px 16px rgba(46,125,50,0.35); }
    }
    .detail-edit-btn {
      display: flex; align-items: center; justify-content: center; gap: 6px;
      background: #f5f5f5; color: #555; border: 1.5px solid #e0e0e0;
      border-radius: 14px; padding: 14px 20px;
      font-size: 14px; font-weight: 600; cursor: pointer; font-family: inherit;
      transition: background 0.15s;
      &:hover { background: #eee; }
    }

    /* ── Skeleton loading ── */
    .skeleton-row {
      display: flex; align-items: center; gap: 12px;
      padding: 14px 16px;
    }
    .sk-block {
      border-radius: 6px; background: linear-gradient(90deg, #f0f0f0 25%, #e0e8e0 50%, #f0f0f0 75%);
      background-size: 200% 100%;
      animation: shimmer 1.4s infinite;
      flex-shrink: 0;
    }
    .sk-name  { height: 14px; width: 38%; }
    .sk-tag   { height: 14px; width: 16%; }
    .sk-short { height: 14px; width: 12%; }
    .sk-badge { height: 20px; width: 14%; border-radius: 20px; margin-left: auto; }
    @keyframes shimmer {
      0%   { background-position: 200% 0; }
      100% { background-position: -200% 0; }
    }
  `],
})
export class PantryComponent implements OnInit, OnDestroy {

  private pantryService = inject(PantryService);
  private snackBar      = inject(MatSnackBar);
  private fb            = inject(FormBuilder);
  private router        = inject(Router);
  private destroy$      = new Subject<void>();
  private search$       = new Subject<string>();

  // ── Pantry state ───────────────────────────────────────────────────────────
  items        = signal<PantryItem[]>([]);
  loading      = signal(false);
  saving       = signal(false);
  searching    = signal(false);
  foodResults  = signal<UsdaFood[]>([]);
  selectedFood = signal<UsdaFood | null>(null);
  editingItem  = signal<PantryItem | null>(null);
  editSaving   = signal(false);

  searchFilter = signal('');
  catFilter    = signal('');
  statusFilter = signal<'expiring' | 'expired' | ''>('');
  viewMode: 'table' | 'grid' = 'table';


  // ── Constants ──────────────────────────────────────────────────────────────
  categories       = CATEGORIES;
  units            = UNITS;
  quickIngredients = QUICK_INGREDIENTS;

  addForm = this.fb.group({
    ingredient_name: ['', Validators.required],
    quantity:        [''],
    unit:            [''],
    category:        [''],
    expiry_date:     [''],
    storage_tips:    [''],
  });

  editForm = this.fb.group({
    ingredient_name: ['', Validators.required],
    quantity:        [''],
    unit:            [''],
    category:        [''],
    expiry_date:     [''],
    storage_tips:    [''],
  });

  // ── Computed ───────────────────────────────────────────────────────────────

  filteredItems = computed(() => {
    let list = this.items();
    const q      = this.searchFilter().trim().toLowerCase();
    const cat    = this.catFilter();
    const status = this.statusFilter();
    if (q) list = list.filter(i =>
      i.ingredient_name.toLowerCase().includes(q) ||
      (i.category ?? '').toLowerCase().includes(q)
    );
    if (cat)    list = list.filter(i => i.category === cat);
    if (status) list = list.filter(i => statusOf(i) === status);
    return [...list].sort((a, b) =>
      new Date(b.added_at).getTime() - new Date(a.added_at).getTime()
    );
  });

  expiringSoon = computed(() => {
    return this.items().filter(i => {
      if (!i.expiry_date) return false;
      const d = daysLeft(i.expiry_date);
      return d >= 0 && d <= 7;
    });
  });

  criticalItems = computed(() =>
    this.items().filter(i => {
      if (!i.expiry_date) return false;
      const d = daysLeft(i.expiry_date);
      return d >= 0 && d <= 2;
    }).sort((a, b) => daysLeft(a.expiry_date!) - daysLeft(b.expiry_date!))
  );

  alertDismissed = signal(false);

  lowStock = computed(() =>
    this.items().filter(i => {
      if (!i.quantity) return false;
      const n = parseFloat(i.quantity);
      return !isNaN(n) && n <= 1;
    })
  );

  // ── Lifecycle ──────────────────────────────────────────────────────────────

  ngOnInit() {
    this.loadPantry();
    this.search$.pipe(
      debounceTime(300),
      distinctUntilChanged(),
      switchMap(q => {
        if (q.length < 2) { this.foodResults.set([]); this.searching.set(false); return of([]); }
        this.searching.set(true);
        return this.pantryService.searchFoods(q).pipe(
          map(results => results.length > 0 ? results : this.localSuggestions(q)),
          catchError(() => of(this.localSuggestions(q))),
        );
      }),
      takeUntil(this.destroy$),
    ).subscribe(results => { this.foodResults.set(results); this.searching.set(false); });
  }

  ngOnDestroy() { this.destroy$.next(); this.destroy$.complete(); }

  private localSuggestions(q: string): UsdaFood[] {
    const ql = q.toLowerCase();
    return LOCAL_INGREDIENTS
      .filter(name => name.toLowerCase().includes(ql))
      .slice(0, 8)
      .map((name, i) => ({
        fdc_id: i + 1, description: name, data_type: 'ingredient',
        calories: null, protein: null, carbs: null, fat: null,
      }));
  }

  // ── USDA search ────────────────────────────────────────────────────────────

  onSearchInput(event: Event) {
    const q = (event.target as HTMLInputElement).value.trim();
    this.selectedFood.set(null);
    this.search$.next(q);
  }

  onFoodSelected(event: MatAutocompleteSelectedEvent) {
    const name: string = event.option.value;
    const food = this.foodResults().find(f => f.description === name) ?? null;
    this.selectedFood.set(food);
    if (food) {
      const cat = inferCategory(food.description);
      if (cat) this.addForm.patchValue({ category: cat });
    }
  }

  autoFillCategory() {
    if (this.addForm.value.category) return;
    const name = this.addForm.value.ingredient_name?.trim() ?? '';
    if (!name) return;
    const cat = inferCategory(name);
    if (cat) this.addForm.patchValue({ category: cat });
  }

  // ── CRUD ───────────────────────────────────────────────────────────────────

  loadPantry() {
    this.loading.set(true);
    this.pantryService.list().subscribe({
      next: items => { this.items.set(items); this.loading.set(false); },
      error: ()    => this.loading.set(false),
    });
  }

  addItem() {
    if (this.addForm.invalid) return;
    this.saving.set(true);
    const v = this.addForm.value;
    this.pantryService.add({
      ingredient_name: v.ingredient_name!,
      quantity:        v.quantity?.trim()    || null,
      unit:            v.unit?.trim()        || null,
      category:        v.category?.trim()    || null,
      expiry_date:     v.expiry_date?.trim() || null,
      storage_tips:    v.storage_tips?.trim() || null,
    }).subscribe({
      next: item => {
        this.items.update(list => [item, ...list]);
        this.addForm.reset();
        this.selectedFood.set(null);
        this.foodResults.set([]);
        this.saving.set(false);
        this.snackBar.open(`${item.ingredient_name} added to pantry`, '', { duration: 2000 });
      },
      error: () => this.saving.set(false),
    });
  }

  quickAdd(name: string) {
    this.pantryService.add({
      ingredient_name: name, quantity: null, unit: null,
      category: inferCategory(name) || null,
      expiry_date: null, storage_tips: null,
    }).subscribe({
      next: item => {
        this.items.update(list => [item, ...list]);
        this.snackBar.open(`${name} added`, '', { duration: 1500 });
      },
    });
  }

  removeItem(id: string) {
    this.pantryService.remove(id).subscribe({
      next: () => {
        this.items.update(list => list.filter(i => i.id !== id));
        this.snackBar.open('Removed from pantry', '', { duration: 1500 });
      },
    });
  }

  openEditModal(item: PantryItem) {
    this.editingItem.set(item);
    this.editForm.patchValue({
      ingredient_name: item.ingredient_name,
      quantity:        item.quantity     ?? '',
      unit:            item.unit         ?? '',
      category:        item.category     ?? '',
      expiry_date:     item.expiry_date  ?? '',
      storage_tips:    item.storage_tips ?? '',
    });
  }

  closeEditModal() {
    this.editingItem.set(null);
    this.editForm.reset();
  }

  saveEdit() {
    if (this.editForm.invalid) return;
    const item = this.editingItem();
    if (!item) return;
    this.editSaving.set(true);
    const v = this.editForm.value;
    this.pantryService.update(item.id, {
      ingredient_name: v.ingredient_name!,
      quantity:        v.quantity?.trim()     || null,
      unit:            v.unit?.trim()         || null,
      category:        v.category?.trim()     || null,
      expiry_date:     v.expiry_date?.trim()  || null,
      storage_tips:    v.storage_tips?.trim() || null,
    }).subscribe({
      next: updated => {
        this.items.update(list => list.map(i => i.id === updated.id ? updated : i));
        this.editSaving.set(false);
        this.closeEditModal();
        this.snackBar.open(`${updated.ingredient_name} updated`, '', { duration: 2000 });
      },
      error: () => this.editSaving.set(false),
    });
  }

  // ── Helpers ────────────────────────────────────────────────────────────────

  daysLeft(expiry: string | null): number { return daysLeft(expiry); }
  dismissAlert() { this.alertDismissed.set(true); }
  goToChat(items: PantryItem[]) {
    const names = items.slice(0, 3).map(i => i.ingredient_name).join(', ');
    this.router.navigate(['/chat'], { queryParams: { q: `I need to use up ${names} before they expire. Give me a quick recipe.` } });
  }

  // ── Onboarding ────────────────────────────────────────────────────────────
  showOnboarding = signal(false);
  onboardStep    = signal(0);
  closeOnboarding() { this.showOnboarding.set(false); this.onboardStep.set(0); }

  // ── Detail panel ──────────────────────────────────────────────────────────
  selectedItem = signal<PantryItem | null>(null);
  openDetail(item: PantryItem) { this.selectedItem.set(item); }
  closeDetail() { this.selectedItem.set(null); }
  askAIAbout(item: PantryItem) {
    this.closeDetail();
    this.router.navigate(['/chat'], { queryParams: { q: `I have ${item.ingredient_name}${item.expiry_date ? ' expiring on ' + item.expiry_date : ''}. Give me the best recipe idea and how to store it properly.` } });
  }
  daysBarPct(item: PantryItem): number {
    const d = daysLeft(item.expiry_date);
    if (d < 0) return 0;
    return Math.min(100, Math.round((d / 30) * 100));
  }

  itemStatus(item: PantryItem): 'fresh' | 'expiring' | 'expired' { return statusOf(item); }

  daysLeftLabel(item: PantryItem): string {
    const d = daysLeft(item.expiry_date);
    if (d < 0)  return `${Math.abs(d)} days ago`;
    if (d === 0) return 'Today';
    if (d === 1) return '1 day left';
    return `${d} days left`;
  }

  catEmoji(cat: string | null): string { return CAT_EMOJI[cat ?? ''] ?? '🥘'; }

  catBg(cat: string | null): string {
    const MAP: Record<string, string> = {
      'Leafy Greens': '#e8f5e9', 'Vegetables': '#f1f8e9', 'Fruits': '#fff8e1',
      'Berries': '#fce4ec',      'Nuts & Seeds': '#fff3e0', 'Grains': '#fafafa',
      'Legumes': '#e8f5e9',      'Fish & Seafood': '#e3f2fd', 'Meat & Poultry': '#fff3e0',
      'Dairy': '#f3e5f5',        'Herbs & Spices': '#e8f5e9', 'Oils': '#fffde7',
      'Sweeteners': '#fff8e1',   'Adaptogens': '#e8f5e9',
    };
    return MAP[cat ?? ''] ?? '#f5f5f5';
  }

  // ── Insight shortcuts ──────────────────────────────────────────────────────

  filterExpiring() {
    this.viewMode = 'table';
    this.catFilter.set('');
    this.searchFilter.set('');
    this.statusFilter.set('expiring');
    setTimeout(() =>
      document.getElementById('expiring-list')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    , 60);
  }

  clearStatusFilter() { this.statusFilter.set(''); }

  filterLowStock() {
    this.viewMode = 'table';
    this.catFilter.set('');
    this.searchFilter.set('');
    this.statusFilter.set('');
  }

}
