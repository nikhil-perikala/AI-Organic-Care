import { Component, inject, signal, computed, OnInit, OnDestroy, AfterViewInit, ViewChild, ElementRef, NgZone, effect } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { MatIconModule } from '@angular/material/icon';
import { AuthService } from '../../core/services/auth.service';
import { FavoritesService, ApiRecipe } from '../../core/services/favorites.service';
import { environment } from '../../../environments/environment';
import { catchError, of } from 'rxjs';

// ── Types ────────────────────────────────────────────────────────────────────

interface HeroSlide  { imageUrl: string; chip: string; title: string; sub: string; btnLabel: string; mode: string; }
interface MoodOption { key: string; emoji: string; label: string; tip: string; foods: string; iconColor: string; iconBg: string; }
interface ModeCard   { key: string; emoji: string; title: string; subtitle: string; color: string; btnBg: string; imgBg: string; imageUrl: string; }
interface RecipeCard { id: string; title: string; emoji: string; cardBg: string; matchPct: number; matchBg: string; time: string; difficulty: string; chip: string; chipBg: string; imageUrl: string; }
interface RecipeIngredientDetail { ingredient: { id: string; name: string; category: string | null }; quantity: string | null; unit: string | null; notes: string | null; is_optional: boolean; }
interface RecipeDetail { id: string; title: string; description: string | null; instructions: string | null; prep_time_minutes: number | null; cook_time_minutes: number | null; servings: number; cuisine_type: string | null; meal_type: string | null; ailment_tags: string[]; health_benefits: string[]; dietary_labels: string[]; efficacy_score: number; recipe_ingredients: RecipeIngredientDetail[]; }
interface DailyTip { title: string; tip: string; icon: string; }
// ── Constants ────────────────────────────────────────────────────────────────

const HERO_SLIDES: HeroSlide[] = [
  {
    imageUrl: 'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=1200&auto=format&fit=crop&q=85',
    chip: 'Personalized for you', title: 'Eat Smart, Live Well',
    sub: 'AI-powered recommendations built around what\'s already in your pantry.',
    btnLabel: 'Explore Recommendations', mode: 'pantry',
  },
  {
    imageUrl: 'https://images.unsplash.com/photo-1498837167922-ddd27525d352?w=1200&auto=format&fit=crop&q=85',
    chip: 'Fresh & Seasonal', title: 'Fresh From Nature',
    sub: 'Browse hundreds of organic recipes curated for your dietary goals.',
    btnLabel: 'Browse Recipes', mode: 'meals',
  },
  {
    imageUrl: 'https://images.unsplash.com/photo-1490645935967-10de6ba17061?w=1200&auto=format&fit=crop&q=85',
    chip: 'Meal Planning', title: 'Plan Your Week',
    sub: 'AI-generated weekly meal plan with pantry matching, macros & grocery list.',
    btnLabel: 'Start Planning', mode: 'plan',
  },
  {
    imageUrl: 'https://images.unsplash.com/photo-1512621776951-a57141f2eefd?w=1200&auto=format&fit=crop&q=85',
    chip: 'AI Wellness Coach', title: 'Heal With Every Bite',
    sub: 'Ask our AI anything about nutrition, organic living, or your health goals.',
    btnLabel: 'Ask AI Assistant', mode: 'chat',
  },
];

const MOODS: MoodOption[] = [
  { key: 'happy',    emoji: 'sentiment_satisfied',    label: 'Happy',             iconColor: '#2e7d32', iconBg: '#e8f5e9', tip: 'Boost your mood further with antioxidant-rich berries and dark chocolate.', foods: 'Blueberries, dark chocolate, walnuts' },
  { key: 'calm',     emoji: 'self_improvement',       label: 'Calm',              iconColor: '#5e35b1', iconBg: '#ede7f6', tip: 'Maintain your calm with magnesium-rich leafy greens and chamomile.',        foods: 'Spinach, chamomile, almonds' },
  { key: 'tired',    emoji: 'bedtime',                label: 'Tired',             iconColor: '#283593', iconBg: '#e8eaf6', tip: 'Recharge with iron-rich greens, complex carbs, and B-vitamin foods.',       foods: 'Spinach, oats, lentils, bananas' },
  { key: 'stressed', emoji: 'sentiment_dissatisfied', label: 'Stressed',          iconColor: '#e65100', iconBg: '#fff3e0', tip: 'Lower cortisol with omega-3 rich foods and adaptogenic herbs.',            foods: 'Salmon, ashwagandha, avocado' },
  { key: 'sick',     emoji: 'cloud',                  label: 'Under the Weather', iconColor: '#0277bd', iconBg: '#e1f5fe', tip: 'Support your immune system with vitamin C, zinc, and anti-inflammatory ginger.', foods: 'Ginger, turmeric, citrus, garlic' },
];

const MODE_CARDS: ModeCard[] = [
  { key: 'meals',      emoji: 'restaurant_menu', title: 'Recipes',      subtitle: 'Browse organic recipes',     color: '#2e7d32', btnBg: '#2e7d32', imgBg: 'linear-gradient(135deg,#e8f5e9,#a5d6a7)', imageUrl: 'https://images.unsplash.com/photo-1498837167922-ddd27525d352?w=400&auto=format&fit=crop&q=80' },
  { key: 'favourites', emoji: 'favorite',        title: 'Favorites',    subtitle: 'Your saved recipes',         color: '#c62828', btnBg: '#c62828', imgBg: 'linear-gradient(135deg,#fce4ec,#ef9a9a)', imageUrl: 'https://images.unsplash.com/photo-1504754524776-8f4f37790ca0?w=400&auto=format&fit=crop&q=80' },
  { key: 'plan',       emoji: 'calendar_month',  title: 'Meal Planner', subtitle: 'Plan your week',             color: '#6a1b9a', btnBg: '#6a1b9a', imgBg: 'linear-gradient(135deg,#f3e5f5,#ce93d8)', imageUrl: 'https://images.unsplash.com/photo-1490645935967-10de6ba17061?w=400&auto=format&fit=crop&q=80' },
];

const MEAL_ICON: Record<string, string> = { breakfast: 'free_breakfast', lunch: 'lunch_dining', dinner: 'dinner_dining', beverage: 'local_cafe', snack: 'apple' };

const IMG_FALLBACK = 'https://images.unsplash.com/photo-1512621776951-a57141f2eefd?w=300&auto=format&fit=crop&q=80';
const IMG_STOP = new Set(['a','an','the','with','and','or','of','in','on','for','to','my','your','our','its','from','made','style','easy','quick','healthy','organic','fresh']);


function titleToImageUrl(title: string, mealType: string | null): string {
  const words = title.toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .split(/\s+/)
    .filter(w => w.length > 2 && !IMG_STOP.has(w))
    .slice(0, 3);
  const q = words.length ? words.join(',') : (mealType ?? 'food');
  return `https://source.unsplash.com/featured/300x200/?food,${encodeURIComponent(q)}`;
}

const AILMENT_THEME: Record<string, { cardBg: string; matchBg: string; chipBg: string }> = {
  fatigue:          { cardBg: '#e8f5e9', matchBg: '#2e7d32', chipBg: '#e8f5e9' },
  inflammation:     { cardBg: '#fce4ec', matchBg: '#00897b', chipBg: '#e0f2f1' },
  stress:           { cardBg: '#fff8e1', matchBg: '#558b2f', chipBg: '#f9fbe7' },
  anxiety:          { cardBg: '#fff8e1', matchBg: '#558b2f', chipBg: '#f9fbe7' },
  insomnia:         { cardBg: '#e8eaf6', matchBg: '#3949ab', chipBg: '#e8eaf6' },
  'gut health':     { cardBg: '#e0f2f1', matchBg: '#00897b', chipBg: '#e0f7fa' },
  'immune support': { cardBg: '#e8f5e9', matchBg: '#2e7d32', chipBg: '#e8f5e9' },
};
const DEFAULT_THEME = { cardBg: '#f3e5f5', matchBg: '#6a1b9a', chipBg: '#f3e5f5' };

function recipeToCard(r: ApiRecipe): RecipeCard {
  const tag   = r.ailment_tags[0] ?? '';
  const theme = AILMENT_THEME[tag] ?? DEFAULT_THEME;
  const totalMin = (r.prep_time_minutes ?? 0) + (r.cook_time_minutes ?? 0);
  return {
    id:         r.id,
    title:      r.title,
    emoji:      MEAL_ICON[r.meal_type ?? ''] ?? 'restaurant',
    cardBg:     theme.cardBg,
    matchPct:   Math.round(r.efficacy_score * 100),
    matchBg:    theme.matchBg,
    time:       totalMin > 0 ? `${totalMin} min` : 'Quick',
    difficulty: totalMin <= 10 ? 'Easy' : totalMin <= 25 ? 'Medium' : 'Involved',
    chip:       r.health_benefits[0] ?? r.ailment_tags[0] ?? 'Healthy',
    chipBg:     theme.chipBg,
    imageUrl:   titleToImageUrl(r.title, r.meal_type),
  };
}

const DAILY_TIPS: DailyTip[] = [
  { title: 'Warm Lemon Water',     icon: 'water_drop',       tip: 'Start your day with warm lemon water for a gentle liver detox and digestion boost.' },
  { title: 'Eat the Rainbow',      icon: 'palette',          tip: 'Eating colorful vegetables daily provides a range of antioxidants and phytonutrients.' },
  { title: 'Turmeric Power',       icon: 'science',          tip: 'Turmeric and black pepper together enhance curcumin absorption by up to 2000%.' },
  { title: 'Feed Your Gut',        icon: 'bubble_chart',     tip: 'Fermented foods like yogurt and kimchi support a healthy gut microbiome.' },
  { title: 'Omega-3 Benefits',     icon: 'favorite',         tip: 'Omega-3 fatty acids from walnuts and flaxseeds help reduce systemic inflammation.' },
  { title: 'Sleep & Metabolism',   icon: 'bedtime',          tip: 'Aim for 7–9 hours of sleep — it directly regulates hunger hormones and metabolism.' },
  { title: 'Chew Mindfully',       icon: 'sentiment_satisfied', tip: 'Mindful eating — chewing slowly and thoroughly — dramatically improves digestion.' },
  { title: 'Ginger Before Meals',  icon: 'local_cafe',       tip: 'Ginger tea before meals supports digestion and helps reduce bloating.' },
  { title: 'Leafy Greens Daily',   icon: 'eco',              tip: 'Dark leafy greens like spinach and kale are among the most nutrient-dense foods you can eat.' },
  { title: 'Hydration Matters',    icon: 'opacity',          tip: 'Staying hydrated (8+ glasses of water daily) keeps energy stable throughout the day.' },
  { title: 'Plant Protein Power',  icon: 'grass',            tip: 'Legumes are excellent plant-based protein sources rich in fiber, iron, and folate.' },
  { title: 'Adapt to Stress',      icon: 'self_improvement', tip: 'Ashwagandha is an adaptogen that helps your body manage stress more effectively.' },
  { title: 'Avocado for Heart',    icon: 'monitor_heart',    tip: 'Avocado is rich in monounsaturated fats and potassium that actively support heart health.' },
  { title: 'Berries for Brain',    icon: 'psychology',       tip: 'Berries are low in sugar and packed with antioxidants that protect long-term brain health.' },
  { title: 'Protein Breakfast',    icon: 'breakfast_dining', tip: 'A protein-rich breakfast reduces afternoon cravings and keeps blood sugar stable all day.' },
  { title: 'Raw Garlic Power',     icon: 'medical_services', tip: 'Raw garlic contains allicin, a powerful antimicrobial and immune-boosting compound.' },
  { title: 'Chia Seed Hydration',  icon: 'grain',            tip: 'Chia seeds absorb water and expand in your stomach, promoting fullness and hydration.' },
  { title: 'Green Tea Calm',       icon: 'local_cafe',       tip: 'Green tea contains L-theanine which promotes calm alertness without the coffee jitters.' },
];

function getDailyTip(): DailyTip {
  const start = new Date(new Date().getFullYear(), 0, 0);
  const dayOfYear = Math.floor((Date.now() - start.getTime()) / 86_400_000);
  return DAILY_TIPS[dayOfYear % DAILY_TIPS.length];
}

function getGreeting(): string {
  const h = new Date().getHours();
  if (h < 12) return 'Good Morning';
  if (h < 17) return 'Good Afternoon';
  return 'Good Evening';
}

// ── Component ─────────────────────────────────────────────────────────────────

@Component({
  selector: 'app-home',
  standalone: true,
  imports: [CommonModule, RouterLink, MatIconModule],
  template: `
<div class="home-page">

  <!-- ── AI Awakening intro overlay ───────────────────────── -->
  @if (!awakeningDone()) {
    <canvas class="awakening-canvas" #awakeningCanvas></canvas>
  }

  <!-- ── S1: Greeting banner ─────────────────────────────── -->
  <div class="greeting-banner px-4 py-3">
    <div class="d-flex align-items-center gap-3">
      <div class="health-logo flex-shrink-0">
        <mat-icon style="font-size:24px;color:#2e7d32">eco</mat-icon>
      </div>
      <div>
        <h1 class="fw-bold text-white mb-0" style="font-size:clamp(16px,4vw,22px);line-height:1.2">
          {{ greeting }}, {{ userName }} 👋
        </h1>
        <p class="mb-0 small" style="color:rgba(255,255,255,0.65)">Eat Organic, Live Healthy</p>
      </div>
    </div>
  </div>

  <!-- ── S1b: Dashboard summary (logged-in only) ─────────── -->
  @if (auth.isLoggedIn()) {
    <div class="px-3 px-md-4 mt-3">
      <div class="row g-2">

        <!-- Pantry Items -->
        <div class="col-4">
          <div class="ps-stat-card bg-white shadow-sm" style="cursor:pointer" (click)="goToPantry()">
            <div class="ps-stat-icon" style="background:#e8f5e9">
              <mat-icon style="font-size:16px;color:#2e7d32;width:16px;height:16px;line-height:1">inventory_2</mat-icon>
            </div>
            <div class="fw-bold" style="font-size:20px;color:#1a2a1a;line-height:1">{{ pantryCount() }}</div>
            <div class="text-muted" style="font-size:11px">Pantry Items</div>
            <span class="ps-pill" style="background:#e8f5e9;color:#2e7d32">View All →</span>
          </div>
        </div>

        <!-- Expiring Soon -->
        <div class="col-4">
          <div class="ps-stat-card bg-white shadow-sm" style="cursor:pointer" (click)="goToPantry()">
            <div class="ps-stat-icon" style="background:#fff3e0">
              <mat-icon style="font-size:16px;color:#f57c00;width:16px;height:16px;line-height:1">schedule</mat-icon>
            </div>
            <div class="fw-bold" style="font-size:20px;line-height:1"
              [style.color]="expiringCount() > 0 ? '#e65100' : '#1a2a1a'">{{ expiringCount() }}</div>
            <div class="text-muted" style="font-size:11px">Expiring Soon</div>
            @if (expiringCount() > 0) {
              <span class="ps-pill" style="background:#fff3e0;color:#e65100">⚠ Use Soon</span>
            } @else {
              <span class="ps-pill" style="background:#e8f5e9;color:#2e7d32">✓ All Good</span>
            }
          </div>
        </div>

        <!-- Cook Now CTA -->
        <div class="col-4">
          <div class="ps-stat-card shadow-sm" style="background:linear-gradient(135deg,#2e7d32,#43a047);cursor:pointer;border:none"
            (click)="goToChat()">
            <div class="ps-stat-icon" style="background:rgba(255,255,255,0.2)">
              <mat-icon style="font-size:16px;color:#fff;width:16px;height:16px;line-height:1">smart_toy</mat-icon>
            </div>
            <div class="fw-bold text-white" style="font-size:13px;line-height:1.2">Cook<br>Now</div>
            <span class="ps-pill" style="background:rgba(255,255,255,0.2);color:#fff">Ask AI →</span>
          </div>
        </div>

      </div>
    </div>
  }

  <!-- ── AI Consciousness Dashboard ──────────────────────── -->
  <div class="cs-card mx-3 mx-md-4 mt-3">
    <div class="cs-label">AI Consciousness</div>
    <canvas class="cs-canvas" #consciousnessCanvas></canvas>
  </div>

  <!-- ── S1b: Hero carousel ───────────────────────────────── -->
  <div class="hero-card mx-3 mx-md-4 mt-3">
    <div class="hero-track" [style.transform]="'translateX(-' + currentHeroSlide() * 100 + '%)'">
      @for (slide of heroSlides; track slide.imageUrl) {
        <div class="hero-slide" (click)="goMode(slide.mode)">
          <img [src]="slide.imageUrl" class="hero-img" [alt]="slide.title">
          <div class="hero-overlay">
            <span class="personalized-chip">
              <mat-icon style="font-size:12px;width:12px;height:12px;vertical-align:middle">star</mat-icon>
              {{ slide.chip }}
            </span>
            <h2 class="hero-title">{{ slide.title }}</h2>
            <p class="hero-sub">{{ slide.sub }}</p>
            <button class="hero-btn">{{ slide.btnLabel }} →</button>
          </div>
        </div>
      }
    </div>
    <div class="hero-dots">
      @for (slide of heroSlides; track $index) {
        <button class="hero-dot" [class.hero-dot-active]="currentHeroSlide() === $index"
          (click)="$event.stopPropagation(); setHeroSlide($index)"></button>
      }
    </div>
  </div>

  <!-- ── S2: Today's Organic Tip ──────────────────────────── -->
  <div class="px-3 px-md-4 mt-3">
    <div class="tip-banner">
      <div class="d-flex align-items-start gap-3">
        <div class="tip-banner-icon flex-shrink-0">
          <mat-icon>{{ todayTip.icon }}</mat-icon>
        </div>
        <div class="flex-fill">
          <div class="tip-banner-label">Today's Organic Tip</div>
          <div class="tip-banner-title">{{ todayTip.title }}</div>
          <p class="tip-banner-text mb-2">{{ todayTip.tip }}</p>
          <button class="tip-banner-cta" (click)="goToChat()">
            <mat-icon style="font-size:13px;width:13px;height:13px;vertical-align:middle">smart_toy</mat-icon>
            Ask AI for more
          </button>
        </div>
      </div>
    </div>
  </div>

  <!-- ── S3: Mode cards ───────────────────────────────────── -->
  <div class="px-3 px-md-4 mt-4">
    <h2 class="section-title mb-3">What would you like to do today?</h2>
    <div class="row g-3">
      @for (mode of modeCards; track mode.key) {
        <div class="col-4">
          <div class="card border-0 shadow-sm h-100 mode-card" style="border-radius:14px;cursor:pointer;overflow:hidden"
            (click)="goMode(mode.key)">
            <div class="mode-img-wrap">
              <img [src]="mode.imageUrl" [alt]="mode.title" class="mode-img">
              <span class="mode-icon-overlay">
                <mat-icon style="font-size:28px;width:28px;height:28px;color:#fff">{{ mode.emoji }}</mat-icon>
              </span>
            </div>
            <div class="card-body p-2 p-md-3 text-center text-md-start">
              <div class="fw-bold" style="font-size:clamp(9px,2vw,13px)" [style.color]="mode.color">{{ mode.title }}</div>
              <p class="text-muted mb-2 d-none d-md-block" style="font-size:11px">{{ mode.subtitle }}</p>
              <button class="btn btn-sm rounded-circle d-none d-md-flex align-items-center justify-content-center float-end"
                [style.background]="mode.btnBg" style="width:32px;height:32px"
                (click)="$event.stopPropagation(); goMode(mode.key)">
                <mat-icon style="font-size:16px;color:#fff;line-height:1">arrow_forward</mat-icon>
              </button>
            </div>
          </div>
        </div>
      }
    </div>
  </div>

  <!-- ── S4: Mood picker ──────────────────────────────────── -->
  <div class="px-3 px-md-4 mt-4">
    <div class="card border-0 shadow-sm" style="border-radius:16px">
      <div class="card-body p-3 p-md-4">
        <div class="d-flex align-items-start justify-content-between mb-1">
          <div>
            <h2 class="section-title mb-1">How are you feeling today?</h2>
            <p class="text-muted mb-0" style="font-size:12px">Your mood helps us personalize your recommendations.</p>
          </div>
        </div>
        <div class="d-flex gap-2 mt-3 overflow-x-auto pb-1" style="scrollbar-width:none">
          @for (mood of moods; track mood.key) {
            <button class="mood-card flex-shrink-0 btn border-0 text-center p-0"
              [class.mood-card-active]="selectedMood() === mood.key"
              [style.--mood-color]="mood.iconColor"
              [style.--mood-bg]="mood.iconBg"
              (click)="selectMood(mood.key)">
              <div class="mood-icon-circle mx-auto mb-2" [style.background]="mood.iconBg">
                <mat-icon [style.color]="mood.iconColor">{{ mood.emoji }}</mat-icon>
              </div>
              <div class="mood-label fw-semibold" style="font-size:12px;color:#1a2a1a">{{ mood.label }}</div>
            </button>
          }
        </div>
        @if (activeMood()) {
          <div class="mood-suggestion-bar mt-3 fade-in d-flex align-items-center justify-content-between gap-3 px-3 py-2"
            [style.background]="activeMood()!.iconBg" style="border-radius:12px">
            <div>
              <div class="fw-semibold" style="font-size:13px" [style.color]="activeMood()!.iconColor">
                Feeling {{ activeMood()!.label }}?
              </div>
              <div class="text-muted" style="font-size:11px;margin-top:2px">{{ activeMood()!.foods }}</div>
            </div>
            <button class="btn btn-sm fw-semibold flex-shrink-0"
              [style.background]="activeMood()!.iconColor" style="color:#fff;border-radius:10px;font-size:12px"
              (click)="goMoodSuggestions()">See Suggestions</button>
          </div>
        }
      </div>
    </div>
  </div>

  <!-- ── S5: Best Recipes From Your Pantry ───────────────── -->
  <div class="px-3 px-md-4 mt-4">
    <div class="d-flex align-items-center justify-content-between mb-1">
      <h2 class="section-title mb-0 d-flex align-items-center gap-2">
        {{ auth.isLoggedIn() ? 'Best Recipes From Your Pantry' : 'Featured Organic Recipes' }}
        <mat-icon style="font-size:16px;width:16px;height:16px;color:#4caf50">eco</mat-icon>
      </h2>
      <a class="btn btn-link btn-sm p-0 text-decoration-none fw-semibold d-flex align-items-center gap-1" style="color:#2e7d32"
        [routerLink]="auth.isLoggedIn() ? '/recommendations' : '/meals'">
        View All <mat-icon style="font-size:16px;width:16px;height:16px">chevron_right</mat-icon>
      </a>
    </div>
    <p class="text-muted mb-3" style="font-size:12px">Curated just for your health and wellness goals.</p>

    @if (loadingRecipes()) {
      <div class="d-flex gap-3 overflow-x-auto pb-2">
        @for (s of [1,2,3]; track s) {
          <div class="recipe-card card border-0 shadow-sm flex-shrink-0" style="width:160px;border-radius:14px">
            <div class="skeleton" style="height:110px;border-radius:14px 14px 0 0"></div>
            <div class="card-body p-2">
              <div class="skeleton mb-2" style="height:12px;width:80%;border-radius:6px"></div>
              <div class="skeleton" style="height:10px;width:50%;border-radius:6px"></div>
            </div>
          </div>
        }
      </div>
    } @else if (auth.isLoggedIn() && recipeCards().length === 0) {
      @if (pantryCount() === 0) {
        <div class="card border-0 shadow-sm text-center py-5 px-3" style="border-radius:14px;background:#f8fdf8">
          <mat-icon style="font-size:48px;width:48px;height:48px;color:#a5d6a7;margin:0 auto">kitchen</mat-icon>
          <div class="fw-bold mt-3" style="color:#2e7d32;font-size:16px">Your pantry is empty</div>
          <p class="text-muted small mt-2 mb-4">Add ingredients to your pantry and we'll suggest recipes you can cook right now.</p>
          <button class="btn btn-primary mx-auto px-4 fw-semibold" style="border-radius:10px;background:#2e7d32;border:none;max-width:200px"
            (click)="goToPantry()">
            Add Pantry Items
          </button>
        </div>
      } @else {
        <div class="card border-0 shadow-sm text-center py-4 px-3" style="border-radius:14px">
          <mat-icon style="font-size:36px;width:36px;height:36px;color:#bdbdbd;margin:0 auto">search_off</mat-icon>
          <p class="text-muted small mt-2 mb-3">No recipes found matching your pantry items.<br>Try adding more ingredients.</p>
          <button class="btn btn-outline-success btn-sm mx-auto px-3" style="border-radius:10px;max-width:180px"
            (click)="goToPantry()">Add More Ingredients</button>
        </div>
      }
    } @else {
      <div class="recipe-row d-flex d-md-grid gap-3 overflow-x-auto pb-2 d-md-grid">
        @for (card of recipeCards(); track card.id) {
          <div class="recipe-card card border-0 shadow-sm flex-shrink-0" style="width:160px;border-radius:14px;cursor:pointer"
            (click)="openRecipe(card.id)">
            <div class="d-flex align-items-center justify-content-between px-2 pt-2">
              <span class="badge text-white rounded-pill" style="font-size:10px" [style.background]="card.matchBg">
                {{ card.matchPct }}% Match
              </span>
              @if (auth.isLoggedIn()) {
                <button class="btn p-0 border-0 bg-transparent heart-btn"
                  [class.liked]="favouriteIds().has(card.id)"
                  (click)="toggleFavourite($event, card.id)">
                  <mat-icon style="font-size:18px">{{ favouriteIds().has(card.id) ? 'favorite' : 'favorite_border' }}</mat-icon>
                </button>
              }
            </div>
            <div class="recipe-img-wrap mx-2 my-1">
              <img [src]="card.imageUrl" [alt]="card.title" class="recipe-thumb-img"
                   (error)="$any($event.target).src = imgFallback">
            </div>
            <div class="card-body p-2">
              <div class="fw-bold mb-1" style="font-size:12px;color:#1a2a1a">{{ card.title }}</div>
              <div class="text-muted mb-2" style="font-size:10px">{{ card.time }} • {{ card.difficulty }}</div>
              <span class="badge rounded-pill fw-semibold" style="font-size:10px;color:#2e7d32"
                [style.background]="card.chipBg">{{ card.chip }}</span>
            </div>
          </div>
        }
      </div>
    }
  </div>

  <!-- ── S5b: My Favourites ────────────────────────────────── -->
  @if (auth.isLoggedIn()) {
    <div class="px-3 px-md-4 mt-4" id="my-favourites">
      <h2 class="section-title mb-3 d-flex align-items-center gap-2">
        <mat-icon style="font-size:18px;width:18px;height:18px;color:#e53935">favorite</mat-icon> My Favourites
      </h2>
      @if (favouriteCards().length === 0) {
        <div class="card border-0 shadow-sm text-center py-4" style="border-radius:14px">
          <mat-icon style="font-size:32px;width:32px;height:32px;color:#e0e0e0;margin:0 auto">favorite_border</mat-icon>
          <p class="text-muted small mt-2 mb-0">No favourites yet — save a recipe to find it here.</p>
        </div>
      } @else {
        <div class="d-flex gap-3 overflow-x-auto pb-2">
          @for (card of favouriteCards(); track card.id) {
            <div class="recipe-card card border-0 shadow-sm flex-shrink-0" style="width:160px;border-radius:14px;cursor:pointer"
              (click)="openRecipe(card.id)">
              <div class="d-flex align-items-center justify-content-between px-2 pt-2">
                <span class="badge text-white rounded-pill" style="font-size:10px" [style.background]="card.matchBg">
                  {{ card.matchPct }}% Match
                </span>
                <button class="btn p-0 border-0 bg-transparent heart-btn liked"
                  (click)="toggleFavourite($event, card.id)">
                  <mat-icon style="font-size:18px">favorite</mat-icon>
                </button>
              </div>
              <div class="recipe-img-wrap mx-2 my-1">
                <img [src]="card.imageUrl" [alt]="card.title" class="recipe-thumb-img"
                   (error)="$any($event.target).src = imgFallback">
              </div>
              <div class="card-body p-2">
                <div class="fw-bold mb-1" style="font-size:12px;color:#1a2a1a">{{ card.title }}</div>
                <div class="text-muted mb-2" style="font-size:10px">{{ card.time }} • {{ card.difficulty }}</div>
                <span class="badge rounded-pill fw-semibold" style="font-size:10px;color:#2e7d32"
                  [style.background]="card.chipBg">{{ card.chip }}</span>
              </div>
            </div>
          }
        </div>
      }
    </div>
  }

  <!-- ── S6: Bottom cards ──────────────────────────────────── -->
  <div class="px-3 px-md-4 mt-3 pb-5">
    <div class="row g-3">

      <!-- Quick Pantry Actions card -->
      <div class="col-6">
        <div class="bottom-card position-relative overflow-hidden" style="background:linear-gradient(135deg,#e8f5e9,#f1f8e9);border-radius:18px;min-height:200px">
          <div class="p-3" style="position:relative;z-index:1">
            <div class="d-flex align-items-center gap-2 mb-2">
              <div style="width:32px;height:32px;border-radius:8px;background:rgba(46,125,50,0.15);display:flex;align-items:center;justify-content:center">
                <mat-icon style="font-size:18px;width:18px;height:18px;color:#2e7d32">kitchen</mat-icon>
              </div>
              <span class="fw-bold" style="font-size:13px;color:#1a2a1a">My Pantry</span>
            </div>
            <div class="d-flex flex-column gap-1 mb-3">
              <div class="d-flex align-items-center gap-2">
                <span class="fw-bold" style="font-size:22px;color:#2e7d32">{{ pantryCount() }}</span>
                <span class="text-muted" style="font-size:11px">items tracked</span>
              </div>

              @if (recipeCount > 0) {
                <div class="d-flex align-items-center gap-1" style="font-size:11px;color:#6a1b9a">
                  <mat-icon style="font-size:13px;width:13px;height:13px">dinner_dining</mat-icon>
                  {{ recipeCount }} recipe matches
                </div>
              }
            </div>
            <button class="btn fw-semibold d-flex align-items-center gap-1"
              style="background:#2e7d32;color:#fff;border-radius:22px;font-size:12px;padding:8px 16px;border:none"
              routerLink="/pantry">
              <mat-icon style="font-size:14px;width:14px;height:14px">kitchen</mat-icon>
              View Pantry
            </button>
          </div>
          <img src="https://images.unsplash.com/photo-1584568694244-14fbdf83bd30?w=300&auto=format&fit=crop&q=80"
               class="bottom-card-img" alt="Pantry">
        </div>
      </div>

      <!-- Today's Tip card -->
      <div class="col-6">
        <div class="bottom-card position-relative overflow-hidden" style="background:#fffbeb;border-radius:18px;min-height:200px">
          <div class="p-3" style="position:relative;z-index:1">
            <div class="d-flex align-items-center gap-2 mb-1">
              <div style="width:32px;height:32px;border-radius:8px;background:rgba(245,124,0,0.12);display:flex;align-items:center;justify-content:center">
                <mat-icon style="font-size:18px;width:18px;height:18px;color:#f57c00">lightbulb</mat-icon>
              </div>
              <span class="fw-bold" style="font-size:13px;color:#1a2a1a">Today's Tip</span>
            </div>
            <p style="font-size:12px;color:#4a3a1a;line-height:1.55;margin-bottom:0.75rem">{{ todayTip.tip }}</p>
            <button class="btn btn-sm fw-semibold d-flex align-items-center gap-1"
              style="border:1.5px solid #f57c00;color:#f57c00;border-radius:22px;font-size:12px;background:transparent;padding:6px 14px"
              (click)="goToChat()">
              <mat-icon style="font-size:13px;width:13px;height:13px">smart_toy</mat-icon>
              Ask AI
            </button>
          </div>
          <img src="https://images.unsplash.com/photo-1556679343-c7306c1976bc?w=300&auto=format&fit=crop&q=80"
               class="bottom-card-img" alt="Healthy drink">
        </div>
      </div>

    </div>
  </div>

  <!-- ── Recipe Detail Modal ──────────────────────────────── -->
  @if (recipeModalOpen()) {
    <div class="modal-backdrop-custom" (click)="closeRecipe()">
      <div class="recipe-modal" (click)="$event.stopPropagation()">
        <button class="btn btn-light rounded-circle position-absolute top-0 end-0 m-3 p-1"
          style="width:34px;height:34px;z-index:1" (click)="closeRecipe()">
          <mat-icon style="font-size:18px;color:#6b7c6b;line-height:1">close</mat-icon>
        </button>

        @if (recipeDetailLoading()) {
          <div class="py-5 px-4">
            <div class="skeleton mb-3 mx-auto" style="height:28px;width:55%;border-radius:8px"></div>
            <div class="skeleton mb-2 mx-auto" style="height:13px;width:80%;border-radius:6px"></div>
            <div class="skeleton mx-auto" style="height:13px;width:65%;border-radius:6px"></div>
          </div>
        }

        @if (!recipeDetailLoading() && selectedRecipe(); as r) {
          <div class="text-center" style="margin:12px 0 10px">
            <div class="modal-meal-icon mx-auto">
              <mat-icon style="font-size:28px;width:28px;height:28px;color:#2e7d32">{{ mealIcon(r.meal_type) }}</mat-icon>
            </div>
          </div>
          <h2 class="fw-bold text-center px-4 mb-3" style="font-size:20px;color:#1a2a1a;line-height:1.3">{{ r.title }}</h2>

          <div class="d-flex flex-wrap gap-2 justify-content-center mb-3 px-3">
            @if (r.meal_type) {
              <span class="badge rounded-pill" style="background:#e8eaf6;color:#3949ab">{{ r.meal_type }}</span>
            }
            @for (label of r.dietary_labels; track label) {
              <span class="badge rounded-pill" style="background:#e8f5e9;color:#2e7d32">{{ label }}</span>
            }
            @for (tag of r.ailment_tags; track tag) {
              <span class="badge rounded-pill" style="background:#e0f2f1;color:#00695c">{{ tag }}</span>
            }
          </div>

          <div class="d-flex flex-wrap gap-3 justify-content-center mb-3 px-3">
            @if (r.prep_time_minutes) {
              <span class="d-flex align-items-center gap-1 text-muted small">
                <mat-icon style="font-size:15px">timer</mat-icon> {{ r.prep_time_minutes }}m prep
              </span>
            }
            @if (r.cook_time_minutes) {
              <span class="d-flex align-items-center gap-1 text-muted small">
                <mat-icon style="font-size:15px">local_fire_department</mat-icon> {{ r.cook_time_minutes }}m cook
              </span>
            }
            <span class="d-flex align-items-center gap-1 text-muted small">
              <mat-icon style="font-size:15px">people</mat-icon> {{ r.servings }} servings
            </span>
          </div>

          @if (r.description) {
            <p class="px-3 small" style="color:#4a5a4a;line-height:1.6">{{ r.description }}</p>
          }

          @if (r.health_benefits.length > 0) {
            <div class="px-3 mb-4">
              <div class="fw-bold mb-2 pb-2 border-bottom" style="font-size:14px">Health Benefits</div>
              <div class="d-flex flex-wrap gap-2">
                @for (benefit of r.health_benefits; track benefit) {
                  <span class="badge rounded-pill fw-semibold" style="background:#e8f5e9;color:#2e7d32;font-size:11px">{{ benefit }}</span>
                }
              </div>
            </div>
          }

          @if (r.recipe_ingredients.length > 0) {
            <div class="px-3 mb-4">
              <div class="fw-bold mb-2 pb-2 border-bottom" style="font-size:14px">Ingredients</div>
              <ul class="list-unstyled mb-0 d-flex flex-column gap-2">
                @for (ri of r.recipe_ingredients; track ri.ingredient.id) {
                  <li class="d-flex align-items-start gap-2 small" [class.text-muted]="ri.is_optional">
                    <span class="flex-shrink-0 rounded-circle bg-success mt-1" style="width:7px;height:7px;display:inline-block"></span>
                    <span>
                      @if (ri.quantity) { {{ ri.quantity }} }
                      @if (ri.unit) { {{ ri.unit }} }
                      <strong>{{ ri.ingredient.name }}</strong>
                      @if (ri.notes) { <em> — {{ ri.notes }}</em> }
                      @if (ri.is_optional) { <span class="badge bg-light text-muted" style="font-size:9px">optional</span> }
                    </span>
                  </li>
                }
              </ul>
            </div>
          }

          @if (r.instructions) {
            <div class="px-3 mb-4">
              <div class="fw-bold mb-2 pb-2 border-bottom" style="font-size:14px">Instructions</div>
              <ol class="ps-4 d-flex flex-column gap-3 mb-0">
                @for (step of parseSteps(r.instructions); track $index) {
                  <li class="small" style="color:#1a2a1a;line-height:1.6">{{ step }}</li>
                }
              </ol>
            </div>
          }
        }
      </div>
    </div>
  }

</div>
  `,
  styles: [`
    /* ── AI Consciousness Dashboard ── */
    .cs-card {
      position: relative;
      border-radius: 20px;
      overflow: hidden;
      background: #030b03;
      height: 200px;
    }
    @media (min-width: 768px) { .cs-card { height: 260px; } }
    .cs-canvas {
      width: 100%; height: 100%;
      display: block;
    }
    .cs-label {
      position: absolute;
      top: 12px; left: 16px;
      font-size: 11px; font-weight: 600;
      color: rgba(150,220,150,0.55);
      letter-spacing: 1.5px;
      text-transform: uppercase;
      pointer-events: none;
      z-index: 1;
    }

    /* ── AI Awakening canvas ── */
    .awakening-canvas {
      position: fixed;
      inset: 0;
      width: 100vw;
      height: 100vh;
      z-index: 9999;
      pointer-events: none;
      display: block;
    }

    .home-page { padding-bottom: 88px; position: relative; }

    .section-title { font-size: 16px; font-weight: 700; color: #1a2a1a; }

    /* Greeting */
    .greeting-banner {
      background: linear-gradient(135deg, #1b5e20 0%, #2e7d32 60%, #43a047 100%);
    }
    @media (min-width: 768px) {
      .greeting-banner { border-radius: 0 0 20px 20px; }
      .home-page { padding-bottom: 40px; max-width: 1100px; margin: 0 auto; }
    }

    /* Health logo (in greeting) */
    .health-logo {
      width: 42px; height: 42px; border-radius: 12px; background: rgba(255,255,255,0.18);
      display: flex; align-items: center; justify-content: center; flex-shrink: 0;
    }

    /* ── Pantry Summary ─────────────────────────────────── */
    .ps-stat-card {
      border-radius: 14px;
      border: 1.5px solid #e8f0e8;
      padding: 14px 12px;
      display: flex;
      flex-direction: column;
      gap: 3px;
      transition: transform 0.15s, box-shadow 0.15s;
    }
    .ps-stat-card:hover { transform: translateY(-2px); box-shadow: 0 6px 20px rgba(0,0,0,0.08); }
    .ps-stat-icon {
      width: 32px; height: 32px; border-radius: 8px;
      display: flex; align-items: center; justify-content: center;
      margin-bottom: 6px; flex-shrink: 0;
    }
    .ps-pill {
      display: inline-block; font-size: 9px; font-weight: 700;
      padding: 2px 8px; border-radius: 20px; white-space: nowrap; width: fit-content;
    }
    .ps-section-icon {
      width: 26px; height: 26px; border-radius: 7px;
      display: flex; align-items: center; justify-content: center; flex-shrink: 0;
    }

    /* Freshness bar */
    .freshness-track {
      height: 8px; background: #e8e8e8; border-radius: 4px; overflow: hidden;
    }
    .freshness-fill {
      height: 100%; border-radius: 4px;
      transition: width 0.8s ease, background 0.3s ease;
      min-width: 2px;
    }

    /* Insight rows */
    .insight-row {
      display: flex; align-items: flex-start; gap: 8px;
      padding: 8px 10px; border-radius: 8px;
      font-size: 12px; color: #1a2a1a; line-height: 1.4;
    }

    /* Today's Organic Tip banner */
    .tip-banner {
      background: linear-gradient(135deg, #1b5e20 0%, #2e7d32 55%, #43a047 100%);
      border-radius: 16px;
      padding: 16px 18px;
    }
    .tip-banner-icon {
      width: 44px; height: 44px; border-radius: 12px;
      background: rgba(255,255,255,0.18);
      display: flex; align-items: center; justify-content: center;
    }
    .tip-banner-icon mat-icon { color: #fff; font-size: 22px; width: 22px; height: 22px; }
    .tip-banner-label {
      font-size: 10px; font-weight: 700; color: rgba(255,255,255,0.65);
      text-transform: uppercase; letter-spacing: 1px; margin-bottom: 2px;
    }
    .tip-banner-title { font-size: 14px; font-weight: 800; color: #fff; margin-bottom: 5px; }
    .tip-banner-text  { font-size: 12px; color: rgba(255,255,255,0.85); line-height: 1.55; }
    .tip-banner-cta {
      display: inline-flex; align-items: center; gap: 5px;
      background: rgba(255,255,255,0.2); border: 1px solid rgba(255,255,255,0.35);
      color: #fff; border-radius: 20px; padding: 5px 14px;
      font-size: 11px; font-weight: 600; cursor: pointer;
      transition: background 0.15s;
    }
    .tip-banner-cta:hover { background: rgba(255,255,255,0.3); }

    /* Mode card */
    .mode-card { transition: transform 0.15s, box-shadow 0.15s; }
    .mode-card:hover { transform: translateY(-2px); box-shadow: 0 6px 20px rgba(0,0,0,0.1) !important; }

    /* Recipe cards */
    .recipe-card { transition: transform 0.15s; }
    .recipe-card:hover { transform: translateY(-2px); }

    /* Heart button */
    .heart-btn mat-icon { color: #bdbdbd; transition: color 0.15s; }
    .heart-btn.liked mat-icon { color: #e53935; }

    /* Recipe grid on desktop */
    @media (min-width: 768px) {
      .recipe-row {
        display: grid !important;
        grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
        overflow-x: visible !important;
      }
      .recipe-card { width: 100% !important; }
    }

    /* Modal */
    .modal-backdrop-custom {
      position: fixed; inset: 0; background: rgba(0,0,0,0.52);
      z-index: 1000; display: flex; align-items: flex-end; justify-content: center;
    }
    .recipe-modal {
      background: #fff; border-radius: 20px 20px 0 0;
      width: 100%; max-height: 90vh; overflow-y: auto;
      padding: 20px 0 48px; position: relative;
    }
    @media (min-width: 768px) {
      .modal-backdrop-custom { align-items: center; }
      .recipe-modal { border-radius: 20px; max-width: 560px; max-height: 82vh; }
    }

    /* Skeleton */
    .skeleton {
      background: linear-gradient(90deg, #e0e0e0 25%, #f5f5f5 50%, #e0e0e0 75%);
      background-size: 200% 100%;
      animation: shimmer 1.5s infinite;
      border-radius: 8px;
    }
    @keyframes shimmer { 0% { background-position: 200% 0; } 100% { background-position: -200% 0; } }

    .fade-in { animation: fadeIn 0.3s ease-in; }
    @keyframes fadeIn { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: translateY(0); } }

    /* Hero carousel */
    .hero-card {
      position: relative; border-radius: 16px; overflow: hidden;
      box-shadow: 0 4px 16px rgba(0,0,0,0.12);
    }
    .hero-track {
      display: flex;
      transition: transform 0.6s cubic-bezier(0.4, 0, 0.2, 1);
      will-change: transform;
    }
    .hero-slide {
      flex: 0 0 100%; position: relative; cursor: pointer;
    }
    .hero-img {
      width: 100%; height: 180px; object-fit: cover; display: block;
    }
    .hero-overlay {
      position: absolute; inset: 0;
      background: linear-gradient(105deg, rgba(15,60,20,0.88) 0%, rgba(30,100,40,0.72) 45%, transparent 75%);
      display: flex; flex-direction: column;
      align-items: flex-start; justify-content: center;
      padding: 20px 22px;
    }
    .personalized-chip {
      display: inline-flex; align-items: center; gap: 4px;
      background: rgba(255,193,7,0.92); color: #3e2000;
      font-size: 10px; font-weight: 700;
      padding: 3px 10px; border-radius: 20px; margin-bottom: 10px;
    }
    .hero-title { font-size: clamp(16px,4vw,24px); font-weight: 800; color: #fff; margin: 0 0 6px; }
    .hero-sub   { font-size: 12px; color: rgba(255,255,255,0.82); margin: 0 0 14px; line-height: 1.4; max-width: 220px; }
    .hero-btn {
      background: #fff; color: #1b5e20; border: none;
      border-radius: 10px; padding: 9px 18px;
      font-size: 12px; font-weight: 700; cursor: pointer;
      transition: background 0.15s;
      &:hover { background: #e8f5e9; }
    }
    .hero-dots {
      position: absolute; bottom: 10px; left: 50%; transform: translateX(-50%);
      display: flex; gap: 6px; z-index: 2;
    }
    .hero-dot {
      width: 8px; height: 8px; border-radius: 50%;
      background: rgba(255,255,255,0.5); border: none; padding: 0; cursor: pointer;
      transition: all 0.25s ease;
    }
    .hero-dot-active {
      background: #fff; width: 22px; border-radius: 4px;
    }
    @media (min-width: 768px) {
      .hero-img    { height: 220px; }
      .hero-overlay { padding: 28px 36px; }
      .hero-sub { max-width: 280px; }
    }

    /* Mode card image */
    .mode-img-wrap {
      position: relative; height: 100px; overflow: hidden;
      border-radius: 14px 14px 0 0;
    }
    .mode-img {
      width: 100%; height: 100%; object-fit: cover;
      transition: transform 0.3s;
    }
    .mode-card:hover .mode-img { transform: scale(1.06); }
    .mode-icon-overlay {
      position: absolute; inset: 0;
      background: rgba(0,0,0,0.28);
      display: flex; align-items: center; justify-content: center;
    }

    /* Recipe modal meal icon */
    .modal-meal-icon {
      width: 52px; height: 52px; border-radius: 50%; background: #e8f5e9;
      display: flex; align-items: center; justify-content: center;
    }

    /* Recipe thumbnail image */
    .recipe-img-wrap { border-radius: 8px; overflow: hidden; height: 90px; }
    .recipe-thumb-img { width: 100%; height: 100%; object-fit: cover; display: block; transition: transform 0.3s; }
    .recipe-card:hover .recipe-thumb-img { transform: scale(1.05); }

    /* Mood cards (S4) */
    .mood-card {
      width: 72px; border-radius: 14px;
      padding: 10px 6px !important;
      background: #fff;
      border: 2px solid transparent !important;
      transition: transform 0.15s, box-shadow 0.15s;
    }
    .mood-card:hover { transform: translateY(-2px); box-shadow: 0 4px 12px rgba(0,0,0,0.08); }
    .mood-card-active {
      border-color: var(--mood-color) !important;
      background: var(--mood-bg) !important;
      box-shadow: 0 4px 14px rgba(0,0,0,0.1);
    }
    .mood-icon-circle {
      width: 44px; height: 44px; border-radius: 50%;
      display: flex; align-items: center; justify-content: center;
      transition: transform 0.15s;
    }
    .mood-card:hover .mood-icon-circle { transform: scale(1.08); }

    /* Bottom cards (S6) */
    .bottom-card-img {
      position: absolute; bottom: 0; right: 0;
      width: 110px; height: 110px; object-fit: cover;
      opacity: 0.25; border-radius: 0 0 18px 0;
      pointer-events: none;
    }
  `],
})
export class HomeComponent implements OnInit, AfterViewInit, OnDestroy {
  router  = inject(Router);
  auth    = inject(AuthService);
  favSvc  = inject(FavoritesService);
  private http = inject(HttpClient);
  private zone = inject(NgZone);

  @ViewChild('awakeningCanvas')     private awakeningCanvasRef?: ElementRef<HTMLCanvasElement>;
  @ViewChild('consciousnessCanvas') private csCanvasRef?: ElementRef<HTMLCanvasElement>;

  awakeningDone = signal(!!localStorage.getItem('organic_care_awakened'));
  private awFrame = 0;
  private csFrame = 0;

  greeting    = getGreeting();
  imgFallback = IMG_FALLBACK;
  moods       = MOODS;
  modeCards   = MODE_CARDS;
  heroSlides  = HERO_SLIDES;

  currentHeroSlide = signal(0);
  private heroInterval?: ReturnType<typeof setInterval>;
  selectedMood        = signal<string>('');
  loadingRecipes      = signal(true);
  recipeCards         = signal<RecipeCard[]>([]);
  selectedRecipe      = signal<RecipeDetail | null>(null);
  recipeModalOpen     = signal(false);
  recipeDetailLoading = signal(false);

  recipeCount   = 0;
  pantryCount   = signal(0);
  expiringCount = signal(0);

  favouriteIds   = this.favSvc.favouriteIds;
  favouriteCards = computed(() => this.favSvc.favouriteRecipes().map(r => recipeToCard(r)));
  private rawDiscoveryRecipes = signal<ApiRecipe[]>([]);

  activeMood = computed(() => this.moods.find(m => m.key === this.selectedMood()) ?? null);
  todayTip   = getDailyTip();

  get userName(): string {
    const user = this.auth.currentUser();
    if (user?.full_name) return user.full_name.split(' ')[0];
    return 'Friend';
  }

  ngOnInit() {
    this.startHeroSlider();
    if (this.auth.isLoggedIn()) {
      this.loadPantryRecipes();
      this.loadPantry();
      this.favSvc.load();
    } else {
      this.loadRecipes();
    }
  }

  constructor() {
    // Start consciousness canvas once awakening is finished
    effect(() => {
      if (this.awakeningDone()) {
        setTimeout(() => this.zone.runOutsideAngular(() => this.csInit()), 50);
      }
    });
  }

  ngAfterViewInit() {
    if (!this.awakeningDone() && this.awakeningCanvasRef) {
      this.zone.runOutsideAngular(() => this.runAwakening());
    } else {
      // First visit already done — start consciousness immediately
      this.zone.runOutsideAngular(() => this.csInit());
    }
  }

  ngOnDestroy() {
    clearInterval(this.heroInterval);
    cancelAnimationFrame(this.awFrame);
    cancelAnimationFrame(this.csFrame);
  }

  private startHeroSlider() {
    this.heroInterval = setInterval(() => {
      this.currentHeroSlide.update(i => (i + 1) % this.heroSlides.length);
    }, 4500);
  }

  setHeroSlide(index: number) {
    this.currentHeroSlide.set(index);
    clearInterval(this.heroInterval);
    this.startHeroSlider();
  }

  private loadRecipes() {
    this.http.get<ApiRecipe[]>(`${environment.apiUrl}/recipes?limit=20`)
      .pipe(catchError(() => of([])))
      .subscribe(recipes => {
        this.recipeCount = recipes.length;
        this.rawDiscoveryRecipes.set(recipes);
        this.recipeCards.set(recipes.slice(0, 3).map(recipeToCard));
        this.loadingRecipes.set(false);
      });
  }

  private loadPantryRecipes() {
    this.http.get<ApiRecipe[]>(`${environment.apiUrl}/recipes/from-pantry?limit=6`)
      .pipe(catchError(() => of([])))
      .subscribe(recipes => {
        this.recipeCount = recipes.length;
        this.rawDiscoveryRecipes.set(recipes);
        this.recipeCards.set(recipes.map(recipeToCard));
        this.loadingRecipes.set(false);
      });
  }

  private loadPantry() {
    this.http.get<{ expiry_date: string | null }[]>(`${environment.apiUrl}/pantry`)
      .pipe(catchError(() => of([])))
      .subscribe(items => {
        this.pantryCount.set(items.length);
        const today = new Date(); today.setHours(0, 0, 0, 0);
        const expiring = items.filter(i => {
          if (!i.expiry_date) return false;
          const diff = Math.ceil((new Date(i.expiry_date + 'T00:00:00').getTime() - today.getTime()) / 86_400_000);
          return diff >= 0 && diff <= 7;
        });
        this.expiringCount.set(expiring.length);
      });
  }

  toggleFavourite(event: Event, recipeId: string) {
    event.stopPropagation();
    const raw = this.favSvc.favouriteRecipes().find(r => r.id === recipeId)
             ?? this.rawDiscoveryRecipes().find(r => r.id === recipeId);
    this.favSvc.toggle(recipeId, raw);
  }

  readonly mealIcon = (type: string | null) => MEAL_ICON[type ?? ''] ?? 'restaurant';

  openRecipe(id: string) {
    this.recipeModalOpen.set(true);
    this.recipeDetailLoading.set(true);
    this.selectedRecipe.set(null);
    this.http.get<RecipeDetail>(`${environment.apiUrl}/recipes/${id}`)
      .pipe(catchError(() => of(null)))
      .subscribe(r => { this.selectedRecipe.set(r); this.recipeDetailLoading.set(false); });
  }

  closeRecipe() { this.recipeModalOpen.set(false); this.selectedRecipe.set(null); }

  parseSteps(instructions: string | null): string[] {
    if (!instructions) return [];
    return instructions.split(/\n+|\d+\.\s+/).map(s => s.trim()).filter(Boolean);
  }

  private csInit() {
    const canvas = this.csCanvasRef?.nativeElement;
    if (!canvas) return;
    const ctx = canvas.getContext('2d')!;

    const setSize = () => {
      canvas.width  = canvas.offsetWidth  || 360;
      canvas.height = canvas.offsetHeight || 200;
    };
    setSize();
    const resize = () => { setSize(); };
    window.addEventListener('resize', resize);

    interface Satellite {
      angle: number;
      speed: number;
      orbitR: number;
      r: number;
      color: string;
      glow: string;
      label: string;
      getValue: () => string;
    }

    const isLoggedIn = this.auth.isLoggedIn.bind(this.auth);

    const satellites: Satellite[] = [
      { angle: 0,              speed: 0.007, orbitR: 0, r: 18, color: '#4caf50', glow: '#81c784', label: 'Pantry',   getValue: () => isLoggedIn() ? String(this.pantryCount())   : '∞' },
      { angle: Math.PI / 2,   speed: 0.011, orbitR: 0, r: 18, color: '#ff7043', glow: '#ffab91', label: 'Expiring',  getValue: () => isLoggedIn() ? String(this.expiringCount()) : '0' },
      { angle: Math.PI,        speed: 0.009, orbitR: 0, r: 18, color: '#42a5f5', glow: '#90caf9', label: 'Recipes',  getValue: () => '500+' },
      { angle: 3 * Math.PI / 2, speed: 0.013, orbitR: 0, r: 18, color: '#ab47bc', glow: '#ce93d8', label: 'AI IQ',  getValue: () => '99%' },
    ];

    const loop = (now: number) => {
      const W = canvas.width, H = canvas.height;
      const CX = W / 2, CY = H / 2;
      const orbR = Math.min(W, H) * 0.18;
      const satOrbitR = Math.min(W, H) * 0.36;

      // update satellite orbit radii each frame (canvas may resize)
      for (const s of satellites) s.orbitR = satOrbitR;

      ctx.clearRect(0, 0, W, H);

      // Background
      const bg = ctx.createRadialGradient(CX, CY, 0, CX, CY, Math.max(W, H) * 0.6);
      bg.addColorStop(0, '#0d1f0d');
      bg.addColorStop(1, '#030b03');
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, W, H);

      // Grid rings
      ctx.strokeStyle = 'rgba(100,200,100,0.06)';
      ctx.lineWidth = 1;
      for (let ring = 1; ring <= 3; ring++) {
        ctx.beginPath();
        ctx.arc(CX, CY, satOrbitR * ring * 0.45, 0, Math.PI * 2);
        ctx.stroke();
      }

      // ── Central orb ──────────────────────────────────────────────────────
      const pulse = 0.5 + 0.5 * Math.sin(now * 0.0025);
      const wobble = orbR * (0.92 + 0.08 * pulse);

      // Outer aura
      const aura = ctx.createRadialGradient(CX, CY, 0, CX, CY, wobble * 2.8);
      aura.addColorStop(0, `rgba(76,175,80,${0.18 + pulse * 0.12})`);
      aura.addColorStop(0.5, `rgba(76,175,80,0.04)`);
      aura.addColorStop(1, 'transparent');
      ctx.beginPath();
      ctx.arc(CX, CY, wobble * 2.8, 0, Math.PI * 2);
      ctx.fillStyle = aura;
      ctx.fill();

      // Orb body — morphing polygon via bezier
      ctx.save();
      ctx.translate(CX, CY);
      ctx.beginPath();
      const pts = 8;
      for (let i = 0; i <= pts; i++) {
        const theta = (i / pts) * Math.PI * 2;
        const r = wobble * (1 + 0.07 * Math.sin(now * 0.002 + i * 1.3));
        const x = Math.cos(theta) * r;
        const y = Math.sin(theta) * r;
        i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
      }
      ctx.closePath();
      const bodyGrad = ctx.createRadialGradient(-wobble * 0.3, -wobble * 0.3, 0, 0, 0, wobble);
      bodyGrad.addColorStop(0, '#ffffff');
      bodyGrad.addColorStop(0.3, '#81c784');
      bodyGrad.addColorStop(0.7, '#2e7d32');
      bodyGrad.addColorStop(1, '#1b5e20');
      ctx.fillStyle = bodyGrad;
      ctx.shadowColor = '#4caf50';
      ctx.shadowBlur  = 18 + pulse * 12;
      ctx.fill();
      ctx.restore();

      // Orb label
      ctx.font = `bold ${Math.round(orbR * 0.35)}px "Segoe UI", sans-serif`;
      ctx.fillStyle = 'rgba(255,255,255,0.9)';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.shadowBlur = 0;
      ctx.fillText('🌿', CX, CY);

      // ── Satellites ───────────────────────────────────────────────────────
      for (const sat of satellites) {
        sat.angle += sat.speed;
        const sx = CX + Math.cos(sat.angle) * sat.orbitR;
        const sy = CY + Math.sin(sat.angle) * sat.orbitR;

        // Orbit trail line
        ctx.beginPath();
        ctx.moveTo(CX, CY);
        ctx.lineTo(sx, sy);
        ctx.strokeStyle = sat.color + '22';
        ctx.lineWidth = 1;
        ctx.stroke();

        // Satellite glow
        const satAura = ctx.createRadialGradient(sx, sy, 0, sx, sy, sat.r * 2.5);
        satAura.addColorStop(0, sat.glow + '55');
        satAura.addColorStop(1, 'transparent');
        ctx.beginPath();
        ctx.arc(sx, sy, sat.r * 2.5, 0, Math.PI * 2);
        ctx.fillStyle = satAura;
        ctx.fill();

        // Satellite body
        const satGrad = ctx.createRadialGradient(sx - sat.r * 0.3, sy - sat.r * 0.3, 0, sx, sy, sat.r);
        satGrad.addColorStop(0, '#ffffff');
        satGrad.addColorStop(0.4, sat.color);
        satGrad.addColorStop(1, sat.color + 'aa');
        ctx.beginPath();
        ctx.arc(sx, sy, sat.r, 0, Math.PI * 2);
        ctx.fillStyle = satGrad;
        ctx.shadowColor = sat.glow;
        ctx.shadowBlur  = 10;
        ctx.fill();
        ctx.shadowBlur = 0;

        // Satellite value + label
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.font = `bold ${Math.round(sat.r * 0.7)}px "Segoe UI", sans-serif`;
        ctx.fillStyle = '#fff';
        ctx.fillText(sat.getValue(), sx, sy - 2);

        ctx.font = `${Math.round(sat.r * 0.5)}px "Segoe UI", sans-serif`;
        ctx.fillStyle = sat.glow;
        ctx.fillText(sat.label, sx, sy + sat.r + 10);
      }

      this.csFrame = requestAnimationFrame(loop);
    };

    this.csFrame = requestAnimationFrame(loop);
    // Clean up on component destroy — handled by ngOnDestroy
    canvas.addEventListener('remove', () => {
      window.removeEventListener('resize', resize);
      cancelAnimationFrame(this.csFrame);
    });
  }

  private runAwakening() {
    const canvas = this.awakeningCanvasRef!.nativeElement;
    const ctx = canvas.getContext('2d')!;

    const resize = () => {
      canvas.width  = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    resize();

    const W = canvas.width, H = canvas.height;
    const CX = W / 2, CY = H / 2;
    const TOTAL = 2500;          // ms for full animation
    const HOLD  = 600;           // ms logo holds after converge
    const FADE  = 400;           // ms fade-out

    // Build particle cloud
    interface Particle {
      x: number; y: number;
      tx: number; ty: number;   // target (near centre)
      vx: number; vy: number;
      r: number;
      color: string;
      phase: number;
    }

    const colors = ['#4caf50','#81c784','#a5d6a7','#ffffff','#c8e6c9','#66bb6a'];
    const N = Math.min(Math.floor(W * H / 400), 1800);
    const particles: Particle[] = Array.from({ length: N }, () => {
      const angle = Math.random() * Math.PI * 2;
      const dist  = Math.random() * Math.max(W, H) * 0.6 + Math.max(W, H) * 0.1;
      return {
        x: CX + Math.cos(angle) * dist,
        y: CY + Math.sin(angle) * dist,
        tx: CX + (Math.random() - 0.5) * 180,
        ty: CY + (Math.random() - 0.5) * 50,
        vx: 0, vy: 0,
        r: Math.random() * 1.8 + 0.4,
        color: colors[Math.floor(Math.random() * colors.length)],
        phase: Math.random() * Math.PI * 2,
      };
    });

    const start = performance.now();
    let exploding = false;

    const loop = (now: number) => {
      const elapsed = now - start;
      const convergeT = Math.min(elapsed / (TOTAL - HOLD - FADE), 1);
      const ease = 1 - Math.pow(1 - convergeT, 3); // cubic ease-in-out

      ctx.clearRect(0, 0, W, H);

      // Background: dark green fading as particles converge
      const bgAlpha = 0.92 - ease * 0.55;
      ctx.fillStyle = `rgba(5, 18, 5, ${bgAlpha})`;
      ctx.fillRect(0, 0, W, H);

      // Draw particles
      for (const p of particles) {
        if (exploding) {
          p.x += p.vx;
          p.y += p.vy;
          p.vx *= 0.97;
          p.vy *= 0.97;
        } else {
          p.x += (p.tx - p.x) * ease * 0.12;
          p.y += (p.ty - p.y) * ease * 0.12;
        }
        const glow = 0.5 + 0.5 * Math.sin(now * 0.003 + p.phase);
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r * (1 + glow * 0.6), 0, Math.PI * 2);
        ctx.fillStyle = p.color;
        ctx.globalAlpha = 0.5 + glow * 0.5;
        ctx.fill();
        ctx.globalAlpha = 1;
      }

      // Logo text glow when mostly converged
      if (convergeT > 0.65) {
        const textAlpha = Math.min((convergeT - 0.65) / 0.35, 1);
        const glowPulse = 0.5 + 0.5 * Math.sin(now * 0.004);

        ctx.save();
        ctx.globalAlpha = textAlpha * (exploding ? Math.max(0, 1 - (elapsed - (TOTAL - FADE)) / FADE) : 1);

        // Outer glow
        ctx.shadowColor = '#4caf50';
        ctx.shadowBlur  = 30 + glowPulse * 20;

        ctx.textAlign    = 'center';
        ctx.textBaseline = 'middle';

        ctx.font = `bold ${Math.min(W * 0.06, 42)}px "Segoe UI", sans-serif`;
        ctx.fillStyle = '#c8e6c9';
        ctx.fillText('🌿 Organic Care', CX, CY - 18);

        ctx.shadowBlur = 0;
        ctx.font = `${Math.min(W * 0.028, 18)}px "Segoe UI", sans-serif`;
        ctx.fillStyle = 'rgba(200,230,200,0.7)';
        ctx.fillText('Your AI Wellness Companion', CX, CY + 22);

        ctx.restore();
      }

      // Trigger explosion + fade
      if (!exploding && elapsed >= TOTAL - HOLD - FADE) {
        exploding = true;
        for (const p of particles) {
          const ang = Math.atan2(p.y - CY, p.x - CX);
          const spd = Math.random() * 8 + 3;
          p.vx = Math.cos(ang) * spd;
          p.vy = Math.sin(ang) * spd;
        }
      }

      if (elapsed < TOTAL) {
        this.awFrame = requestAnimationFrame(loop);
      } else {
        // Fully done — mark complete and remove overlay
        this.zone.run(() => {
          localStorage.setItem('organic_care_awakened', '1');
          this.awakeningDone.set(true);
        });
      }
    };

    this.awFrame = requestAnimationFrame(loop);
  }

  goToPantry()       { this.router.navigate(['/pantry']); }
  goToPantryRecipes(){ this.router.navigate(['/recommendations'], { queryParams: { mode: 'pantry' } }); }
  goToFavourites() {
    if (!this.auth.isLoggedIn()) return;
    setTimeout(() =>
      document.getElementById('my-favourites')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    , 50);
  }

  selectMood(key: string)  { this.selectedMood.set(key); }
  goMode(mode: string) {
    if (mode === 'plan')           { this.router.navigate(['/meal-planner']); return; }
    if (mode === 'chat')           { this.router.navigate(['/chat']); return; }
    if (mode === 'meals')          { this.router.navigate(['/meals']); return; }
    if (mode === 'favourites')     { this.goToFavourites(); return; }
    if (mode === 'pantry-manage')  { this.router.navigate(['/pantry']); return; }
    this.router.navigate(['/recommendations'], { queryParams: { mode } });
  }
  goToChat()          { this.router.navigate(['/chat']); }
  goMoodSuggestions() { this.router.navigate(['/recommendations'], { queryParams: { mood: this.selectedMood() } }); }
}
