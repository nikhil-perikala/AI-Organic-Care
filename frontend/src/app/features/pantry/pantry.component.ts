import { Component, inject, signal, computed, OnInit, OnDestroy, ViewChild, ElementRef } from '@angular/core';
import { Router } from '@angular/router';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatAutocompleteModule, MatAutocompleteSelectedEvent } from '@angular/material/autocomplete';
import { MatTooltipModule } from '@angular/material/tooltip';
import { Subject, debounceTime, distinctUntilChanged, switchMap, of, takeUntil, catchError, map } from 'rxjs';
import { PantryService, PantryItem, UsdaFood, ExtractedItem } from '../../core/services/pantry.service';

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
          <!-- Upload Receipt Button -->
          <button class="btn fw-semibold d-flex align-items-center gap-2 px-3 py-2"
            style="background:linear-gradient(135deg,#2e7d32,#43a047);color:#fff;border-radius:10px;font-size:13px;border:none;box-shadow:0 2px 8px rgba(46,125,50,.3)"
            (click)="openReceiptModal()">
            <mat-icon style="font-size:18px;width:18px;height:18px;line-height:1">receipt_long</mat-icon>
            Upload Receipt
          </button>
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

        <!-- Scan Receipt card -->
        <div class="card border-0 shadow-sm position-relative overflow-hidden" style="border-radius:16px;cursor:pointer"
          (click)="openReceiptModal()">
          <div class="card-body p-3" style="background:linear-gradient(135deg,#e8f5e9,#f1f8e9)">
            <div class="d-flex align-items-center gap-2 mb-2">
              <div class="rounded-3 d-flex align-items-center justify-content-center"
                style="width:38px;height:38px;background:linear-gradient(135deg,#2e7d32,#43a047);flex-shrink:0">
                <mat-icon style="color:#fff;font-size:20px;width:20px;height:20px;line-height:1">receipt_long</mat-icon>
              </div>
              <div>
                <div class="fw-bold" style="font-size:14px;color:#1a2a1a">Scan Receipt</div>
                <div class="text-muted" style="font-size:11px">AI-powered grocery extraction</div>
              </div>
            </div>
            <p class="text-muted small mb-3" style="font-size:12px;line-height:1.4">
              Upload or photograph your grocery receipt — AI extracts all items and adds them to your pantry instantly.
            </p>
            <div class="d-flex gap-2">
              <span class="badge rounded-pill fw-normal" style="background:#e8f5e9;color:#2e7d32;border:1px solid #c8e6c9;font-size:11px">
                <mat-icon style="font-size:12px;vertical-align:middle">upload</mat-icon> Upload
              </span>
              <span class="badge rounded-pill fw-normal" style="background:#e8f5e9;color:#2e7d32;border:1px solid #c8e6c9;font-size:11px">
                <mat-icon style="font-size:12px;vertical-align:middle">photo_camera</mat-icon> Camera
              </span>
              <span class="badge rounded-pill fw-normal" style="background:#e8f5e9;color:#2e7d32;border:1px solid #c8e6c9;font-size:11px">
                <mat-icon style="font-size:12px;vertical-align:middle">picture_as_pdf</mat-icon> PDF
              </span>
            </div>
            <span class="position-absolute" style="bottom:6px;right:12px;font-size:36px;opacity:.12" aria-hidden="true">🧾</span>
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

        <!-- AI Pantry Assistant -->
        <div class="card border-0 shadow-sm position-relative overflow-hidden" style="border-radius:16px;background:linear-gradient(135deg,#f1f8e9,#e8f5e9)">
          <div class="card-body p-3">
            <div class="d-flex align-items-center gap-2 mb-2">
              <span style="font-size:22px">🤖</span>
              <div>
                <span class="fw-bold" style="font-size:14px">AI Pantry Assistant</span>
                <span class="badge ms-1 fw-bold" style="background:#e8f5e9;color:#2e7d32;font-size:9px">Beta</span>
              </div>
            </div>
            <p class="text-muted small mb-3">I can help you reduce waste and suggest recipes based on what you have!</p>
            <button class="btn btn-outline-primary btn-sm fw-semibold" (click)="goToAI()">Ask AI Assistant</button>
            <span class="position-absolute" style="bottom:8px;right:14px;font-size:32px;opacity:.15" aria-hidden="true">🌿</span>
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

        <!-- Loading / empty -->
        @if (loading()) {
          <div class="text-center py-5">
            <mat-spinner diameter="40"></mat-spinner>
          </div>
        } @else if (filteredItems().length === 0) {
          <div class="card border-0 shadow-sm text-center py-5" style="border-radius:14px">
            <div style="font-size:40px">🥦</div>
            <p class="text-muted mt-3 mb-2">
              {{ items().length === 0 ? 'Your pantry is empty. Add ingredients or scan a receipt!' : 'No items match your search.' }}
            </p>
            @if (items().length === 0) {
              <button class="btn btn-sm fw-semibold mx-auto"
                style="background:linear-gradient(135deg,#2e7d32,#43a047);color:#fff;border-radius:8px"
                (click)="openReceiptModal()">
                <mat-icon style="font-size:16px;vertical-align:middle">receipt_long</mat-icon>
                Scan a Receipt
              </button>
            }
          </div>
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
                    <tr>
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
                          <div style="font-size:11px;white-space:nowrap"
                            [style.color]="itemStatus(item)==='fresh'?'#2e7d32':itemStatus(item)==='expiring'?'#f57c00':'#c62828'">
                            {{ daysLeftLabel(item) }}
                          </div>
                        } @else {
                          <span class="text-muted">—</span>
                        }
                      </td>
                      <td>
                        <span class="badge rounded-pill fw-semibold" style="font-size:11px"
                          [style.background]="itemStatus(item)==='fresh'?'#e8f5e9':itemStatus(item)==='expiring'?'#fff3e0':!item.expiry_date?'#f5f5f5':'#ffebee'"
                          [style.color]="itemStatus(item)==='fresh'?'#2e7d32':itemStatus(item)==='expiring'?'#f57c00':!item.expiry_date?'#9e9e9e':'#c62828'">
                          @if (itemStatus(item) === 'expiring') { ⚠ Expiring Soon }
                          @else if (itemStatus(item) === 'expired') { ✕ Expired }
                          @else if (!item.expiry_date) { — }
                          @else { ✓ Fresh }
                        </span>
                      </td>
                      <td>
                        <div class="d-flex gap-1">
                          <button class="btn btn-sm btn-light p-1" (click)="openEditModal(item)"
                            [matTooltip]="'Edit ' + item.ingredient_name" style="border-radius:6px">
                            <mat-icon style="font-size:16px;color:#1565c0;line-height:1;display:block">edit</mat-icon>
                          </button>
                          <button class="btn btn-sm btn-light p-1" (click)="removeItem(item.id)"
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
                <div class="card border-0 shadow-sm h-100 position-relative"
                  style="border-radius:14px;transition:box-shadow .15s"
                  [style.border]="itemStatus(item)==='expiring'?'1.5px solid #ffe0b2':''">
                  <div class="card-body p-3 d-flex flex-column gap-1">
                    <div class="mb-2" style="font-size:28px">{{ catEmoji(item.category) }}</div>
                    <div class="fw-bold" style="font-size:13px;color:#1a2a1a">{{ item.ingredient_name }}</div>
                    @if (item.category) { <div class="text-muted" style="font-size:11px">{{ item.category }}</div> }
                    <div class="d-flex flex-column gap-1 mt-1" style="font-size:11px;color:#6b7c6b">
                      @if (item.quantity) { <span>{{ item.quantity }} {{ item.unit }}</span> }
                      @if (item.expiry_date) {
                        <span [style.color]="itemStatus(item)!=='fresh'?'#f57c00':'inherit'">{{ daysLeftLabel(item) }}</span>
                      }
                      <span style="color:#b0b8b0">Added {{ item.added_at | date:'MMM d, y' }}</span>
                    </div>
                    <span class="badge rounded-pill mt-auto align-self-start fw-semibold" style="font-size:10px"
                      [style.background]="itemStatus(item)==='fresh'?'#e8f5e9':itemStatus(item)==='expiring'?'#fff3e0':!item.expiry_date?'#f5f5f5':'#ffebee'"
                      [style.color]="itemStatus(item)==='fresh'?'#2e7d32':itemStatus(item)==='expiring'?'#f57c00':!item.expiry_date?'#9e9e9e':'#c62828'">
                      @if (itemStatus(item) === 'expiring') { ⚠ Expiring }
                      @else if (itemStatus(item) === 'expired') { ✕ Expired }
                      @else if (!item.expiry_date) { — }
                      @else { ✓ Fresh }
                    </span>
                  </div>
                  <div class="card-actions position-absolute top-0 end-0 p-1 d-flex gap-1 opacity-0">
                    <button class="btn btn-sm btn-light p-1" style="border-radius:6px" (click)="openEditModal(item)">
                      <mat-icon style="font-size:14px;color:#1565c0;line-height:1;display:block">edit</mat-icon>
                    </button>
                    <button class="btn btn-sm btn-light p-1" style="border-radius:6px" (click)="removeItem(item.id)">
                      <mat-icon style="font-size:14px;color:#9e9e9e;line-height:1;display:block">delete_outline</mat-icon>
                    </button>
                  </div>
                </div>
              </div>
            }
          </div>
        }

        <!-- Pantry Insights -->
        <div class="card border-0 shadow-sm" style="border-radius:14px">
          <div class="card-body p-3">
            <div class="d-flex align-items-center gap-2 mb-3 fw-bold" style="font-size:14px">
              <mat-icon style="color:#2e7d32;font-size:18px">bar_chart</mat-icon> Pantry Insights
            </div>
            <div class="row g-2">
              <div class="col-4">
                <div class="rounded-3 p-3 d-flex flex-column gap-1" style="background:#fff8f0">
                  <div class="fw-bold" style="font-size:22px;color:#f57c00">{{ expiringSoon().length }}</div>
                  <div class="text-muted" style="font-size:12px;line-height:1.3">Items expiring soon</div>
                  <button class="btn btn-link p-0 text-start fw-semibold" style="font-size:12px;color:#f57c00" (click)="filterExpiring()">View items →</button>
                </div>
              </div>
              <div class="col-4">
                <div class="rounded-3 p-3 d-flex flex-column gap-1" style="background:#f0f4ff">
                  <div class="fw-bold" style="font-size:22px;color:#1565c0">{{ lowStock().length }}</div>
                  <div class="text-muted" style="font-size:12px;line-height:1.3">Items low in stock</div>
                  <button class="btn btn-link p-0 text-start fw-semibold" style="font-size:12px;color:#1565c0" (click)="filterLowStock()">Restock now →</button>
                </div>
              </div>
              <div class="col-4">
                <div class="rounded-3 p-3 d-flex flex-column gap-1" style="background:#f5f0ff">
                  <div class="fw-bold" style="font-size:22px;color:#6a1b9a">{{ items().length > 0 ? '31%' : '—' }}</div>
                  <div class="text-muted" style="font-size:12px;line-height:1.3">Reduce waste</div>
                  <button class="btn btn-link p-0 text-start fw-semibold" style="font-size:12px;color:#6a1b9a" (click)="goToAI()">Learn how →</button>
                </div>
              </div>
            </div>
          </div>
        </div>

      </div>
    </div>

  </div>
</div>

<!-- Hidden file inputs -->
<input #fileInput type="file" accept="image/jpeg,image/png,image/webp,application/pdf"
  style="display:none" (change)="onFileInput($event)">
<input #cameraInput type="file" accept="image/*" capture="environment"
  style="display:none" (change)="onFileInput($event)">

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

<!-- ════════════════════════════════════════════════════════════
     Receipt Scanner Modal
     ════════════════════════════════════════════════════════════ -->
@if (receiptOpen()) {
  <div class="modal-overlay" (click)="closeReceiptModal()">
    <div class="receipt-modal card border-0 shadow-lg" (click)="$event.stopPropagation()" style="border-radius:20px">

      <!-- Header -->
      <div class="card-body p-4 pb-0">
        <div class="d-flex align-items-center justify-content-between mb-1">
          <div class="d-flex align-items-center gap-2">
            <div class="rounded-3 d-flex align-items-center justify-content-center"
              style="width:36px;height:36px;background:linear-gradient(135deg,#2e7d32,#43a047)">
              <mat-icon style="color:#fff;font-size:20px;width:20px;height:20px;line-height:1">receipt_long</mat-icon>
            </div>
            <div>
              <div class="fw-bold" style="font-size:16px">Upload Receipt</div>
              <div class="text-muted" style="font-size:11px">AI extracts grocery items automatically</div>
            </div>
          </div>
          <button class="btn btn-sm btn-light rounded-circle p-1" (click)="closeReceiptModal()">
            <mat-icon style="font-size:20px;color:#9e9e9e;line-height:1;display:block">close</mat-icon>
          </button>
        </div>

        <!-- Step indicator -->
        <div class="d-flex align-items-center gap-2 mt-3 mb-3">
          <div class="step-dot" [class.active]="receiptStep() === 1" [class.done]="receiptStep() > 1">1</div>
          <div class="step-line" [class.done]="receiptStep() > 1"></div>
          <div class="step-dot" [class.active]="receiptStep() === 2" [class.done]="receiptStep() > 2">2</div>
          <div class="step-line" [class.done]="receiptStep() > 2"></div>
          <div class="step-dot" [class.active]="receiptStep() === 3">3</div>
          <div class="ms-2 text-muted" style="font-size:11px">
            @if (receiptStep() === 1) { Upload Receipt }
            @else if (receiptStep() === 2) { Scanning... }
            @else { Review Items }
          </div>
        </div>
      </div>

      <div class="card-body p-4 pt-2" style="overflow-y:auto;max-height:60vh">

        <!-- ── Step 1: Upload / Camera ───────────────────────────── -->
        @if (receiptStep() === 1) {
          <!-- Drag & drop zone -->
          <div class="drop-zone rounded-3 p-4 text-center mb-3"
            [class.drag-over]="dragOver()"
            (dragover)="onDragOver($event)"
            (dragleave)="onDragLeave()"
            (drop)="onDrop($event)"
            (click)="fileInput.click()">
            <div style="font-size:40px;margin-bottom:8px">🧾</div>
            <div class="fw-semibold" style="font-size:14px;color:#2e7d32">Drop your receipt here</div>
            <div class="text-muted" style="font-size:12px;margin-top:4px">or click to browse files</div>
            <div class="text-muted mt-2" style="font-size:11px">Supports: JPG, PNG, WebP, PDF · Max 10 MB</div>
          </div>

          <!-- OR divider + Camera button -->
          <div class="d-flex align-items-center gap-2 mb-3">
            <div style="flex:1;height:1px;background:#e0e0e0"></div>
            <span class="text-muted" style="font-size:12px">or</span>
            <div style="flex:1;height:1px;background:#e0e0e0"></div>
          </div>

          <div class="row g-2">
            <div class="col-6">
              <button class="btn w-100 fw-semibold d-flex align-items-center justify-content-center gap-2 py-3"
                style="background:#f8faf8;border:1.5px dashed #c8e6c9;border-radius:12px;font-size:13px;color:#2e7d32"
                (click)="fileInput.click()">
                <mat-icon style="font-size:20px;width:20px;height:20px;line-height:1">upload_file</mat-icon>
                Upload File
              </button>
            </div>
            <div class="col-6">
              <button class="btn w-100 fw-semibold d-flex align-items-center justify-content-center gap-2 py-3"
                style="background:#f8faf8;border:1.5px dashed #c8e6c9;border-radius:12px;font-size:13px;color:#2e7d32"
                (click)="cameraInput.click()">
                <mat-icon style="font-size:20px;width:20px;height:20px;line-height:1">photo_camera</mat-icon>
                Use Camera
              </button>
            </div>
          </div>

          <div class="mt-3 rounded-3 p-2 d-flex gap-2 align-items-start"
            style="background:#f1f8e9;font-size:11px;color:#388e3c">
            <mat-icon style="font-size:14px;flex-shrink:0;margin-top:1px">tips_and_updates</mat-icon>
            <span>For best results, ensure the receipt is flat, well-lit, and fully visible. Phone camera works great on mobile!</span>
          </div>
        }

        <!-- ── Step 2: Scanning Animation ────────────────────────── -->
        @if (receiptStep() === 2) {
          <div class="text-center py-4">
            @if (receiptPreview()) {
              <div class="position-relative d-inline-block mb-4">
                <img [src]="receiptPreview()!" alt="Receipt preview"
                  style="max-height:200px;max-width:100%;border-radius:12px;object-fit:contain;box-shadow:0 4px 16px rgba(0,0,0,.15)">
                <div class="scan-line"></div>
              </div>
            } @else {
              <div class="mb-4" style="font-size:60px">📄</div>
            }
            <mat-spinner diameter="36" style="margin:0 auto 12px"></mat-spinner>
            <div class="fw-semibold" style="font-size:15px;color:#1a2a1a">Scanning Receipt...</div>
            <div class="text-muted mt-1" style="font-size:12px">AI is extracting grocery items</div>
            <div class="scanning-dots mt-2">
              <span></span><span></span><span></span>
            </div>
          </div>
        }

        <!-- ── Step 3: Review Extracted Items ────────────────────── -->
        @if (receiptStep() === 3) {
          @if (extractedItems().length === 0) {
            <div class="text-center py-4">
              <div style="font-size:40px">🤔</div>
              <div class="fw-semibold mt-2" style="font-size:14px">No grocery items found</div>
              <p class="text-muted small mt-1">The AI couldn't identify grocery items in this receipt. Try uploading a clearer image.</p>
              <button class="btn btn-outline-success btn-sm mt-2" (click)="resetReceipt()">Try Again</button>
            </div>
          } @else {
            <!-- Preview image + count -->
            <div class="d-flex align-items-center gap-3 mb-3">
              @if (receiptPreview()) {
                <img [src]="receiptPreview()!" alt="Receipt"
                  style="width:56px;height:72px;object-fit:cover;border-radius:8px;box-shadow:0 2px 8px rgba(0,0,0,.12)">
              }
              <div>
                <div class="fw-bold" style="font-size:15px;color:#2e7d32">
                  ✓ {{ extractedItems().length }} item{{ extractedItems().length !== 1 ? 's' : '' }} found
                </div>
                <div class="text-muted" style="font-size:12px">Review and edit before adding to pantry</div>
              </div>
              <button class="btn btn-sm btn-light ms-auto fw-semibold" style="font-size:12px" (click)="resetReceipt()">
                <mat-icon style="font-size:14px;vertical-align:middle">refresh</mat-icon> Rescan
              </button>
            </div>

            <!-- Extracted items list -->
            <div class="d-flex flex-column gap-2">
              @for (item of extractedItems(); track $index) {
                <div class="extracted-item rounded-3 p-3 position-relative"
                  style="background:#f8faf8;border:1.5px solid #e8f0e8">
                  <div class="d-flex align-items-center gap-2 mb-2">
                    <span style="font-size:18px">{{ catEmoji(inferCat(item.ingredient_name)) }}</span>
                    <input class="form-control form-control-sm fw-semibold"
                      style="font-size:13px;border:none;background:transparent;padding:0;box-shadow:none;color:#1a2a1a"
                      [value]="item.ingredient_name"
                      (change)="updateExtracted($index, 'ingredient_name', $any($event.target).value)"
                      placeholder="Item name">
                    <button class="btn btn-sm p-0 ms-auto flex-shrink-0" style="color:#bdbdbd;line-height:1"
                      (click)="removeExtracted($index)" [matTooltip]="'Remove ' + item.ingredient_name">
                      <mat-icon style="font-size:18px;display:block">close</mat-icon>
                    </button>
                  </div>
                  <div class="row g-2">
                    <div class="col-4">
                      <label class="form-label fw-semibold mb-1" style="font-size:10px;color:#9e9e9e;text-transform:uppercase">Qty</label>
                      <input class="form-control form-control-sm" type="text" inputmode="decimal"
                        style="font-size:12px"
                        [value]="item.quantity ?? ''"
                        (change)="updateExtracted($index, 'quantity', $any($event.target).value)"
                        placeholder="—">
                    </div>
                    <div class="col-4">
                      <label class="form-label fw-semibold mb-1" style="font-size:10px;color:#9e9e9e;text-transform:uppercase">Unit</label>
                      <select class="form-select form-select-sm" style="font-size:12px"
                        [value]="item.unit ?? ''"
                        (change)="updateExtracted($index, 'unit', $any($event.target).value)">
                        <option value="">—</option>
                        @for (u of units; track u) { <option [value]="u">{{ u }}</option> }
                      </select>
                    </div>
                    <div class="col-4">
                      <label class="form-label fw-semibold mb-1" style="font-size:10px;color:#9e9e9e;text-transform:uppercase">Expiry</label>
                      <input class="form-control form-control-sm" type="date"
                        style="font-size:12px"
                        [value]="item.expiry_date ?? ''"
                        (change)="updateExtracted($index, 'expiry_date', $any($event.target).value)">
                    </div>
                  </div>
                </div>
              }
            </div>

            <!-- Add item button -->
            <button class="btn btn-outline-success btn-sm mt-2 w-100" style="border-style:dashed;font-size:12px"
              (click)="addBlankExtracted()">
              <mat-icon style="font-size:14px;vertical-align:middle">add</mat-icon>
              Add another item
            </button>
          }
        }

      </div>

      <!-- Footer actions -->
      <div class="card-body pt-2 pb-4 px-4 border-top d-flex gap-2 justify-content-end flex-wrap">
        @if (receiptStep() === 1 || receiptStep() === 2) {
          <button class="btn btn-light fw-semibold" (click)="closeReceiptModal()" [disabled]="receiptScanning()">
            Cancel
          </button>
        }
        @if (receiptStep() === 3) {
          <button class="btn btn-light fw-semibold" (click)="closeReceiptModal()">
            Cancel
          </button>
          @if (extractedItems().length > 0) {
            <button class="btn fw-bold d-flex align-items-center gap-2"
              style="background:linear-gradient(135deg,#2e7d32,#43a047);color:#fff;border:none"
              [disabled]="receiptSaving()"
              (click)="confirmAddToPantry()">
              @if (receiptSaving()) {
                <span class="spinner-border spinner-border-sm"></span>
              } @else {
                <mat-icon style="font-size:18px;width:18px;height:18px;line-height:1">add_shopping_cart</mat-icon>
              }
              Add {{ extractedItems().length }} Item{{ extractedItems().length !== 1 ? 's' : '' }} to Pantry
            </button>
          }
        }
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

    /* Receipt modal */
    .receipt-modal { width: 100%; max-width: 560px; max-height: 92vh; display: flex; flex-direction: column; }

    /* Active filter button */
    .active-filter { background: #f57c00 !important; border-color: #f57c00 !important; color: #fff !important; }

    /* Drop zone */
    .drop-zone {
      border: 2px dashed #a5d6a7; background: #f8faf8; cursor: pointer;
      transition: all .2s ease;
    }
    .drop-zone:hover, .drop-zone.drag-over {
      border-color: #2e7d32; background: #f1f8e9;
      transform: scale(1.01);
    }

    /* Step indicator */
    .step-dot {
      width: 24px; height: 24px; border-radius: 50%;
      background: #e0e0e0; color: #9e9e9e;
      display: flex; align-items: center; justify-content: center;
      font-size: 11px; font-weight: 700; flex-shrink: 0;
      transition: all .3s ease;
    }
    .step-dot.active { background: #2e7d32; color: #fff; }
    .step-dot.done   { background: #a5d6a7; color: #2e7d32; }
    .step-line {
      flex: 1; height: 2px; background: #e0e0e0;
      transition: background .3s ease;
    }
    .step-line.done { background: #a5d6a7; }

    /* Scan line animation */
    @keyframes scanMove {
      0%   { top: 0; opacity: 1; }
      100% { top: 100%; opacity: 0; }
    }
    .scan-line {
      position: absolute; left: 0; right: 0; height: 3px;
      background: linear-gradient(90deg, transparent, #4caf50, transparent);
      box-shadow: 0 0 8px rgba(76,175,80,.8);
      animation: scanMove 2s linear infinite;
    }

    /* Scanning dots */
    @keyframes dotBlink { 0%,80%,100% { opacity: 0; } 40% { opacity: 1; } }
    .scanning-dots span {
      display: inline-block; width: 6px; height: 6px; border-radius: 50%;
      background: #4caf50; margin: 0 3px;
      animation: dotBlink 1.4s infinite;
    }
    .scanning-dots span:nth-child(2) { animation-delay: .2s; }
    .scanning-dots span:nth-child(3) { animation-delay: .4s; }

    /* Extracted item */
    .extracted-item { transition: box-shadow .15s; }
    .extracted-item:hover { box-shadow: 0 2px 8px rgba(0,0,0,.08); }
  `],
})
export class PantryComponent implements OnInit, OnDestroy {
  @ViewChild('fileInput')   fileInput!: ElementRef<HTMLInputElement>;
  @ViewChild('cameraInput') cameraInput!: ElementRef<HTMLInputElement>;

  private pantryService = inject(PantryService);
  private snackBar      = inject(MatSnackBar);
  private router        = inject(Router);
  private fb            = inject(FormBuilder);
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

  // ── Receipt scanner state ──────────────────────────────────────────────────
  receiptOpen     = signal(false);
  receiptStep     = signal<1 | 2 | 3>(1);
  receiptScanning = signal(false);
  receiptPreview  = signal<string | null>(null);
  extractedItems  = signal<ExtractedItem[]>([]);
  receiptSaving   = signal(false);
  dragOver        = signal(false);

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
    return list;
  });

  expiringSoon = computed(() => {
    return this.items().filter(i => {
      if (!i.expiry_date) return false;
      const d = daysLeft(i.expiry_date);
      return d >= 0 && d <= 7;
    });
  });

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

  // ── Receipt Scanner ────────────────────────────────────────────────────────

  openReceiptModal() {
    this.receiptOpen.set(true);
    this.receiptStep.set(1);
    this.receiptPreview.set(null);
    this.extractedItems.set([]);
    this.dragOver.set(false);
  }

  closeReceiptModal() {
    if (this.receiptScanning()) return;
    this.receiptOpen.set(false);
    this.resetReceipt();
  }

  resetReceipt() {
    this.receiptStep.set(1);
    this.receiptPreview.set(null);
    this.extractedItems.set([]);
    this.dragOver.set(false);
    // Clear file inputs so the same file can be re-selected
    if (this.fileInput?.nativeElement)   this.fileInput.nativeElement.value   = '';
    if (this.cameraInput?.nativeElement) this.cameraInput.nativeElement.value = '';
  }

  onFileInput(event: Event) {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (file) this.processFile(file);
  }

  onDragOver(event: DragEvent) {
    event.preventDefault();
    event.stopPropagation();
    this.dragOver.set(true);
  }

  onDragLeave() {
    this.dragOver.set(false);
  }

  onDrop(event: DragEvent) {
    event.preventDefault();
    event.stopPropagation();
    this.dragOver.set(false);
    const file = event.dataTransfer?.files?.[0];
    if (file) this.processFile(file);
  }

  processFile(file: File) {
    const allowed = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'application/pdf'];
    if (!allowed.includes(file.type) && !file.name.toLowerCase().endsWith('.pdf')) {
      this.snackBar.open('Unsupported file. Use JPG, PNG, WebP, or PDF.', 'OK', { duration: 4000 });
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      this.snackBar.open('File too large. Maximum size is 10 MB.', 'OK', { duration: 4000 });
      return;
    }

    // Generate preview for images
    if (file.type.startsWith('image/')) {
      const reader = new FileReader();
      reader.onload = e => this.receiptPreview.set(e.target?.result as string);
      reader.readAsDataURL(file);
    } else {
      this.receiptPreview.set(null);
    }

    // Move to scanning step
    this.receiptStep.set(2);
    this.receiptScanning.set(true);

    this.pantryService.uploadReceipt(file).subscribe({
      next: resp => {
        this.extractedItems.set(resp.items);
        this.receiptScanning.set(false);
        this.receiptStep.set(3);
      },
      error: err => {
        this.receiptScanning.set(false);
        this.receiptStep.set(1);
        const msg = err.error?.detail || 'Failed to scan receipt. Please try again.';
        this.snackBar.open(msg, 'OK', { duration: 5000 });
      },
    });
  }

  updateExtracted(index: number, field: keyof ExtractedItem, value: string) {
    this.extractedItems.update(items => {
      const copy = [...items];
      copy[index] = { ...copy[index], [field]: value || null };
      return copy;
    });
  }

  removeExtracted(index: number) {
    this.extractedItems.update(items => items.filter((_, i) => i !== index));
  }

  addBlankExtracted() {
    this.extractedItems.update(items => [
      ...items,
      { ingredient_name: '', quantity: null, unit: null, expiry_date: null },
    ]);
  }

  confirmAddToPantry() {
    const toAdd = this.extractedItems().filter(i => i.ingredient_name.trim());
    if (!toAdd.length) return;

    this.receiptSaving.set(true);
    const payload = toAdd.map(i => ({
      ingredient_name: i.ingredient_name.trim(),
      quantity:        i.quantity || null,
      unit:            i.unit     || null,
      category:        inferCategory(i.ingredient_name) || null,
      expiry_date:     i.expiry_date || null,
      storage_tips:    null,
    }));

    this.pantryService.addBulk(payload).subscribe({
      next: newItems => {
        this.items.update(list => [...newItems, ...list]);
        this.receiptSaving.set(false);
        this.closeReceiptModal();
        this.snackBar.open(
          `✓ ${newItems.length} item${newItems.length !== 1 ? 's' : ''} added to pantry from receipt!`,
          '',
          { duration: 3000 },
        );
      },
      error: () => {
        this.receiptSaving.set(false);
        this.snackBar.open('Failed to save items. Please try again.', 'OK', { duration: 4000 });
      },
    });
  }

  // ── Helpers ────────────────────────────────────────────────────────────────

  inferCat(name: string): string { return inferCategory(name); }

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

  goToAI() {
    this.router.navigate(['/recommendations'], { queryParams: { mode: 'pantry' } });
  }
}
