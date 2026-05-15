import { Component, inject, signal, computed } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { CommonModule } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';

// ── Types ──────────────────────────────────────────────────────────────────────

type NotifCategory = 'pantry' | 'meal' | 'health' | 'ai' | 'shopping';
type FilterKey     = 'all'    | NotifCategory;

interface AppNotification {
  id: string;
  category: NotifCategory;
  title: string;
  body: string;
  time: Date;
  read: boolean;
  actionLabel?: string;
  actionRoute?: string;
}

interface CategoryMeta { label: string; icon: string; color: string; bg: string; }

// ── Constants ──────────────────────────────────────────────────────────────────

const CATEGORY_META: Record<NotifCategory, CategoryMeta> = {
  pantry:   { label: 'Pantry',   icon: 'kitchen',       color: '#e65100', bg: '#fff3e0' },
  meal:     { label: 'Meals',    icon: 'restaurant',    color: '#2e7d32', bg: '#e8f5e9' },
  health:   { label: 'Health',   icon: 'favorite',      color: '#c62828', bg: '#ffebee' },
  ai:       { label: 'AI Tips',  icon: 'psychology',    color: '#6a1b9a', bg: '#f3e5f5' },
  shopping: { label: 'Shopping', icon: 'shopping_cart', color: '#1565c0', bg: '#e3f2fd' },
};

function makeNow(minutesAgo: number): Date {
  return new Date(Date.now() - minutesAgo * 60 * 1000);
}

const MOCK: AppNotification[] = [
  // ── Today (< 24 h ago) ─────────────────────────────────────────────────────
  {
    id: '1', category: 'pantry', read: false,
    title: 'Spinach expires tomorrow',
    body: 'Your spinach (200 g) expires tomorrow. Use it in a salad, smoothie, or omelette to avoid waste.',
    time: makeNow(8), actionLabel: 'View Pantry', actionRoute: '/pantry',
  },
  {
    id: '2', category: 'ai', read: false,
    title: 'Better meal alternative found',
    body: 'Organic Care AI suggests a Quinoa Power Bowl instead of pasta for lunch — 22% more protein, lower carbs.',
    time: makeNow(25), actionLabel: 'See Suggestion', actionRoute: '/recommendations',
  },
  {
    id: '3', category: 'health', read: false,
    title: '7-day healthy streak!',
    body: "You've maintained healthy eating for 7 consecutive days. Your wellness score is up 12%.",
    time: makeNow(62), actionLabel: 'View Insights', actionRoute: '/insights',
  },
  {
    id: '4', category: 'meal', read: true,
    title: 'Energy-boosting breakfast ready',
    body: "Based on your morning mood check-in, we've created a personalised energy-boosting breakfast plan.",
    time: makeNow(95), actionLabel: 'Open Planner', actionRoute: '/meal-planner',
  },
  {
    id: '5', category: 'shopping', read: false,
    title: 'Missing oats for your recipe',
    body: 'Your planned Overnight Oats recipe requires rolled oats — not currently in your pantry.',
    time: makeNow(140), actionLabel: 'Add to List', actionRoute: '/pantry',
  },
  // ── Yesterday (24 h – 48 h ago) ───────────────────────────────────────────
  {
    id: '6', category: 'health', read: true,
    title: 'Weekly nutrition score improved',
    body: 'Your nutrition score rose from 68 to 81 this week. Fibre and protein intake both improved significantly.',
    time: makeNow(26 * 60), actionLabel: 'View Report', actionRoute: '/insights',
  },
  {
    id: '7', category: 'pantry', read: false,
    title: 'Low on protein-rich ingredients',
    body: "You're running low on eggs, lentils, and chickpeas. Restock to keep your meal plan on track.",
    time: makeNow(30 * 60), actionLabel: 'Shop Now', actionRoute: '/pantry',
  },
  {
    id: '8', category: 'meal', read: true,
    title: 'New recipe matches your diet',
    body: 'A gluten-free, high-protein "Chickpea Stir Fry" is now available matching your dietary preferences.',
    time: makeNow(36 * 60), actionLabel: 'Try Recipe', actionRoute: '/recommendations',
  },
  // ── Earlier (> 48 h ago) ───────────────────────────────────────────────────
  {
    id: '9', category: 'ai', read: true,
    title: 'Foods to boost your energy',
    body: 'AI suggests adding spinach, bananas, and almonds to your daily diet for sustained energy and focus.',
    time: makeNow(50 * 60), actionLabel: 'Learn More', actionRoute: '/recommendations',
  },
  {
    id: '10', category: 'shopping', read: true,
    title: 'Recommended items for this week',
    body: 'Based on your meal plan, Greek yogurt, sweet potatoes, and blueberries are recommended this week.',
    time: makeNow(72 * 60), actionLabel: 'View List', actionRoute: '/pantry',
  },
];

// ── Component ──────────────────────────────────────────────────────────────────

@Component({
  selector: 'app-notifications',
  standalone: true,
  imports: [CommonModule, MatIconModule, RouterLink],
  template: `
<div class="notif-page">

  <!-- ══ Sticky header ══════════════════════════════════════════════════════ -->
  <div class="notif-header">
    <div class="d-flex align-items-center gap-3 flex-fill min-w-0">
      <button class="back-btn" (click)="router.navigate(['/'])">
        <mat-icon style="font-size:20px">arrow_back</mat-icon>
      </button>
      <div class="flex-fill min-w-0">
        <div class="d-flex align-items-center gap-2">
          <h1 class="nh-title">Notifications</h1>
          @if (unreadCount() > 0) {
            <span class="nh-badge">{{ unreadCount() }}</span>
          }
        </div>
        <p class="nh-sub">Smart health updates from your AI assistant</p>
      </div>
    </div>
    @if (unreadCount() > 0) {
      <button class="mark-all-btn" (click)="markAllRead()">
        <mat-icon style="font-size:15px;width:15px;height:15px;line-height:1">done_all</mat-icon>
        Mark all read
      </button>
    }
  </div>

  <!-- ══ Summary banner (shown only when unread > 0) ════════════════════════ -->
  @if (unreadCount() > 0) {
    <div class="summary-banner">
      <div class="banner-icon-wrap">
        <mat-icon style="font-size:22px;color:#fff;line-height:1">notifications_active</mat-icon>
      </div>
      <div class="flex-fill">
        <div class="banner-title">
          {{ unreadCount() }} unread notification{{ unreadCount() === 1 ? '' : 's' }}
        </div>
        <div class="banner-sub">Stay on top of your health &amp; pantry</div>
      </div>
      <div class="banner-ring">
        <svg width="44" height="44" viewBox="0 0 44 44">
          <circle cx="22" cy="22" r="18" fill="none" stroke="rgba(255,255,255,0.2)" stroke-width="3"/>
          <circle cx="22" cy="22" r="18" fill="none" stroke="rgba(255,255,255,0.7)" stroke-width="3"
            [attr.stroke-dasharray]="ringDash() + ' 113'"
            stroke-dashoffset="28" stroke-linecap="round"
            style="transform:rotate(-90deg);transform-origin:center"/>
        </svg>
        <span class="banner-ring-label">{{ unreadCount() }}</span>
      </div>
    </div>
  }

  <!-- ══ Filter chips ════════════════════════════════════════════════════════ -->
  <div class="filter-row">
    @for (f of filterDefs; track f.key) {
      <button class="f-chip" [class.active]="activeFilter() === f.key"
              (click)="activeFilter.set(f.key)">
        <mat-icon style="font-size:14px;width:14px;height:14px;line-height:1">{{ f.icon }}</mat-icon>
        {{ f.label }}
        @if (unreadForFilter(f.key) > 0) {
          <span class="f-badge">{{ unreadForFilter(f.key) }}</span>
        }
      </button>
    }
  </div>

  <!-- ══ Notification list ═══════════════════════════════════════════════════ -->
  <div class="notif-list">

    @if (sections().length === 0) {
      <div class="empty-state">
        <div class="empty-ring">
          <mat-icon style="font-size:36px;color:#81c784">eco</mat-icon>
        </div>
        <p class="empty-title">You're all caught up!</p>
        <span class="empty-sub">
          No {{ activeFilterLabel() ? activeFilterLabel() + ' ' : '' }}notifications right now.
        </span>
        <button class="empty-back-btn" (click)="router.navigate(['/'])">
          Back to Home
        </button>
      </div>
    }

    @for (section of sections(); track section.label) {

      <!-- Section heading -->
      <div class="section-head">
        <span class="section-label">{{ section.label }}</span>
        <span class="section-count">{{ section.items.length }}</span>
      </div>

      @for (n of section.items; track n.id) {
        <div class="n-card" [class.unread]="!n.read"
             [style.border-left-color]="!n.read ? meta(n.category).color : 'transparent'"
             (click)="markRead(n.id)">

          <!-- Category icon bubble -->
          <div class="n-icon" [style.background]="meta(n.category).bg">
            <mat-icon [style.color]="meta(n.category).color"
                      style="font-size:20px;width:20px;height:20px;line-height:1">
              {{ meta(n.category).icon }}
            </mat-icon>
          </div>

          <!-- Main content -->
          <div class="n-body">
            <div class="n-top">
              <span class="n-title" [class.fw-bold]="!n.read">{{ n.title }}</span>
              <div class="n-meta">
                <span class="n-time">{{ timeAgo(n.time) }}</span>
                @if (!n.read) { <span class="unread-dot"></span> }
              </div>
            </div>
            <p class="n-text">{{ n.body }}</p>
            <div class="n-footer">
              @if (n.actionLabel) {
                <a class="n-action" [routerLink]="n.actionRoute || '/'"
                   (click)="$event.stopPropagation(); markRead(n.id)">
                  {{ n.actionLabel }}
                  <mat-icon style="font-size:12px;width:12px;height:12px;line-height:1">arrow_forward</mat-icon>
                </a>
              }
              <span class="n-pill"
                    [style.background]="meta(n.category).bg"
                    [style.color]="meta(n.category).color">
                {{ meta(n.category).label }}
              </span>
            </div>
          </div>

          <!-- Dismiss -->
          <button class="dismiss-btn" title="Dismiss"
                  (click)="$event.stopPropagation(); dismiss(n.id)">
            <mat-icon style="font-size:15px;width:15px;height:15px;line-height:1">close</mat-icon>
          </button>

        </div>
      }
    }

  </div>

  <div style="height:88px"></div>
</div>
  `,
  styles: [`
    /* ── Page shell ── */
    .notif-page {
      min-height: 100vh;
      background: linear-gradient(160deg, #f1f8f1 0%, #fafff8 45%, #f5f2ff 100%);
    }

    /* ── Header ── */
    .notif-header {
      position: sticky; top: 0; z-index: 50;
      display: flex; align-items: center; gap: 12px;
      padding: 12px 16px;
      background: rgba(255,255,255,0.88);
      backdrop-filter: blur(14px);
      border-bottom: 1px solid rgba(232,240,232,0.9);
    }
    .back-btn {
      width: 38px; height: 38px; border-radius: 50%; flex-shrink: 0;
      border: none; background: #f2f5f0; color: #2e7d32;
      display: flex; align-items: center; justify-content: center;
      cursor: pointer; transition: background 0.15s;
      &:hover { background: #e8f5e9; }
    }
    .nh-title {
      font-size: 19px; font-weight: 700; color: #1a2e1a; margin: 0; line-height: 1.2;
    }
    .nh-badge {
      background: #2e7d32; color: #fff;
      font-size: 11px; font-weight: 700; border-radius: 10px;
      padding: 1px 7px; display: inline-flex; align-items: center;
    }
    .nh-sub { font-size: 11px; color: #7a8a7a; margin: 2px 0 0; }
    .mark-all-btn {
      flex-shrink: 0; display: inline-flex; align-items: center; gap: 5px;
      font-size: 12px; font-weight: 600; color: #2e7d32;
      background: #e8f5e9; border: none; border-radius: 20px;
      padding: 6px 12px; cursor: pointer; transition: background 0.15s; white-space: nowrap;
      &:hover { background: #c8e6c9; }
    }

    /* ── Summary banner ── */
    .summary-banner {
      margin: 14px 16px;
      background: linear-gradient(135deg, #2e7d32 0%, #43a047 60%, #66bb6a 100%);
      border-radius: 18px; padding: 16px 18px;
      display: flex; align-items: center; gap: 14px;
      box-shadow: 0 6px 24px rgba(46,125,50,0.28);
      position: relative; overflow: hidden;
      &::after {
        content: '';
        position: absolute; bottom: -20px; right: -20px;
        width: 100px; height: 100px; border-radius: 50%;
        background: rgba(255,255,255,0.08);
      }
    }
    .banner-icon-wrap {
      width: 46px; height: 46px; border-radius: 14px; flex-shrink: 0;
      background: rgba(255,255,255,0.18);
      display: flex; align-items: center; justify-content: center;
    }
    .banner-title { font-size: 15px; font-weight: 700; color: #fff; }
    .banner-sub   { font-size: 12px; color: rgba(255,255,255,0.8); margin-top: 3px; }
    .banner-ring  {
      flex-shrink: 0; position: relative;
      display: flex; align-items: center; justify-content: center;
    }
    .banner-ring-label {
      position: absolute; font-size: 13px; font-weight: 700; color: #fff;
    }

    /* ── Filter chips ── */
    .filter-row {
      display: flex; gap: 8px; padding: 12px 16px 10px;
      overflow-x: auto; scrollbar-width: none;
      &::-webkit-scrollbar { display: none; }
    }
    .f-chip {
      display: inline-flex; align-items: center; gap: 5px;
      padding: 7px 14px; border-radius: 20px; white-space: nowrap;
      border: 1.5px solid #d4e8d4; background: #fff;
      font-size: 13px; font-weight: 500; color: #555;
      cursor: pointer; flex-shrink: 0; transition: all 0.15s;
      &:hover { border-color: #a5d6a7; color: #2e7d32; background: #f8fdf8; }
      &.active {
        background: #2e7d32; border-color: #2e7d32; color: #fff;
        box-shadow: 0 2px 8px rgba(46,125,50,0.3);
      }
    }
    .f-badge {
      background: #ef5350; color: #fff;
      font-size: 10px; font-weight: 700; height: 16px;
      border-radius: 8px; padding: 0 5px; min-width: 16px;
      display: inline-flex; align-items: center; justify-content: center;
    }
    .f-chip.active .f-badge { background: rgba(255,255,255,0.28); }

    /* ── Notification list ── */
    .notif-list { padding: 4px 16px 0; }

    /* ── Section heading ── */
    .section-head {
      display: flex; align-items: center; justify-content: space-between;
      margin: 18px 0 10px;
    }
    .section-label {
      font-size: 11px; font-weight: 700; color: #8a9a8a;
      text-transform: uppercase; letter-spacing: 0.8px;
    }
    .section-count {
      background: #edf4ed; border-radius: 10px;
      padding: 2px 9px; font-size: 11px; color: #6b8c6b; font-weight: 600;
    }

    /* ── Notification card ── */
    .n-card {
      display: flex; align-items: flex-start; gap: 12px;
      background: #fff; border-radius: 18px;
      padding: 14px 12px 12px 14px; margin-bottom: 10px;
      border-left: 4px solid transparent;
      box-shadow: 0 1px 6px rgba(0,0,0,0.05), 0 0 0 1px rgba(0,0,0,0.03);
      cursor: pointer; transition: box-shadow 0.2s, transform 0.15s;
      position: relative;
      &:hover { box-shadow: 0 6px 20px rgba(0,0,0,0.1); transform: translateY(-1px); }
      &.unread { background: #fdfffe; }
    }

    /* ── Icon bubble ── */
    .n-icon {
      width: 46px; height: 46px; border-radius: 13px; flex-shrink: 0;
      display: flex; align-items: center; justify-content: center;
    }

    /* ── Card content ── */
    .n-body { flex: 1; min-width: 0; }
    .n-top  {
      display: flex; align-items: flex-start;
      justify-content: space-between; gap: 8px; margin-bottom: 5px;
    }
    .n-title {
      font-size: 14px; font-weight: 500; color: #2a2a2a; line-height: 1.3;
    }
    .n-meta { display: flex; align-items: center; gap: 5px; flex-shrink: 0; }
    .n-time { font-size: 11px; color: #9aaa9a; white-space: nowrap; }
    .unread-dot {
      width: 8px; height: 8px; border-radius: 50%; background: #4caf50; flex-shrink: 0;
    }
    .n-text {
      font-size: 13px; color: #666; line-height: 1.55; margin: 0 0 9px;
      display: -webkit-box; -webkit-line-clamp: 2;
      -webkit-box-orient: vertical; overflow: hidden;
    }
    .n-footer { display: flex; align-items: center; gap: 7px; flex-wrap: wrap; }
    .n-action {
      display: inline-flex; align-items: center; gap: 3px;
      font-size: 12px; font-weight: 600; color: #2e7d32;
      background: #e8f5e9; border-radius: 20px; padding: 4px 11px;
      text-decoration: none; transition: background 0.15s;
      &:hover { background: #c8e6c9; color: #1b5e20; }
    }
    .n-pill {
      display: inline-flex; align-items: center;
      font-size: 11px; font-weight: 600; border-radius: 20px; padding: 3px 9px;
    }

    /* ── Dismiss button ── */
    .dismiss-btn {
      width: 28px; height: 28px; border-radius: 50%; flex-shrink: 0;
      border: none; background: transparent; color: #ccc;
      display: flex; align-items: center; justify-content: center;
      cursor: pointer; margin-top: -2px; transition: background 0.15s, color 0.15s;
      &:hover { background: #ffebee; color: #ef5350; }
    }

    /* ── Empty state ── */
    .empty-state {
      display: flex; flex-direction: column; align-items: center;
      padding: 72px 24px 48px; text-align: center;
    }
    .empty-ring {
      width: 80px; height: 80px; border-radius: 50%;
      background: linear-gradient(135deg, #e8f5e9, #f1f8e9);
      display: flex; align-items: center; justify-content: center;
      margin-bottom: 18px;
      box-shadow: 0 4px 20px rgba(76,175,80,0.2);
    }
    .empty-title { font-size: 18px; font-weight: 700; color: #2e7d32; margin: 0 0 6px; }
    .empty-sub   { font-size: 14px; color: #8a9a8a; margin: 0 0 20px; }
    .empty-back-btn {
      font-size: 13px; font-weight: 600; color: #2e7d32;
      background: #e8f5e9; border: none; border-radius: 20px;
      padding: 8px 20px; cursor: pointer; transition: background 0.15s;
      &:hover { background: #c8e6c9; }
    }

    /* ── Desktop: wider cards ── */
    @media (min-width: 768px) {
      .notif-page { max-width: 680px; margin: 0 auto; padding-top: 8px; }
      .notif-list { padding: 4px 0 0; }
      .filter-row { padding: 12px 0 10px; }
      .notif-header { border-radius: 0; top: 0; }
      .summary-banner { margin: 14px 0; }
    }
  `],
})
export class NotificationsComponent {
  readonly router = inject(Router);

  readonly filterDefs: { key: FilterKey; label: string; icon: string }[] = [
    { key: 'all',      label: 'All',      icon: 'notifications' },
    { key: 'pantry',   label: 'Pantry',   icon: 'kitchen'       },
    { key: 'meal',     label: 'Meals',    icon: 'restaurant'    },
    { key: 'health',   label: 'Health',   icon: 'favorite'      },
    { key: 'ai',       label: 'AI Tips',  icon: 'psychology'    },
    { key: 'shopping', label: 'Shopping', icon: 'shopping_cart' },
  ];

  activeFilter  = signal<FilterKey>('all');
  notifications = signal<AppNotification[]>(MOCK);

  unreadCount = computed(() => this.notifications().filter(n => !n.read).length);

  ringDash = computed(() => {
    const total = this.notifications().length;
    const unread = this.unreadCount();
    return total === 0 ? 0 : Math.round((unread / total) * 113);
  });

  filtered = computed(() => {
    const f  = this.activeFilter();
    const ns = this.notifications();
    return f === 'all' ? ns : ns.filter(n => n.category === f);
  });

  sections = computed(() => {
    const ns   = this.filtered();
    const now  = Date.now();
    const h24  = 24 * 60 * 60 * 1000;
    const h48  = 48 * 60 * 60 * 1000;
    return [
      { label: 'Today',     items: ns.filter(n => now - n.time.getTime() < h24) },
      { label: 'Yesterday', items: ns.filter(n => { const d = now - n.time.getTime(); return d >= h24 && d < h48; }) },
      { label: 'Earlier',   items: ns.filter(n => now - n.time.getTime() >= h48) },
    ].filter(s => s.items.length > 0);
  });

  activeFilterLabel = computed(() => {
    const f = this.activeFilter();
    return f === 'all' ? '' : (this.filterDefs.find(fd => fd.key === f)?.label ?? '');
  });

  meta(cat: NotifCategory): CategoryMeta { return CATEGORY_META[cat]; }

  unreadForFilter(key: FilterKey): number {
    if (key === 'all') return 0;
    return this.notifications().filter(n => n.category === key && !n.read).length;
  }

  timeAgo(date: Date): string {
    const diff = Date.now() - date.getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1)  return 'Just now';
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24)  return `${hrs}h ago`;
    if (hrs < 48)  return 'Yesterday';
    return `${Math.floor(hrs / 24)}d ago`;
  }

  markRead(id: string) {
    this.notifications.update(ns =>
      ns.map(n => n.id === id ? { ...n, read: true } : n)
    );
  }

  markAllRead() {
    this.notifications.update(ns => ns.map(n => ({ ...n, read: true })));
  }

  dismiss(id: string) {
    this.notifications.update(ns => ns.filter(n => n.id !== id));
  }
}
