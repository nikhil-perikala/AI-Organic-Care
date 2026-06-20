import { Component, inject, signal, OnInit, OnDestroy, NgZone } from '@angular/core';
import { RouterOutlet, RouterLink, Router, NavigationEnd } from '@angular/router';
import { CommonModule } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { AuthService } from './core/services/auth.service';
import { ChatWidgetComponent } from './features/home/chat-widget.component';
import { filter } from 'rxjs/operators';

interface NavTab {
  label: string;
  icon: string;
  route: string;
}

const NAV_LEFT: NavTab[] = [
  { label: 'Home', icon: 'home', route: '/' },
  { label: 'Recipes', icon: 'restaurant_menu', route: '/meals' },
];

const NAV_RIGHT: NavTab[] = [
  { label: 'Profile', icon: 'person', route: '/profile' },
];

const NAV_CENTER: NavTab = {
  label: 'AI Chat',
  icon: 'eco',
  route: '/chat',
};

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet, RouterLink, CommonModule, MatIconModule, ChatWidgetComponent],
  template: `
    <div class="app-shell">

      <aside class="sidebar d-none d-md-flex flex-column">
        <div class="sidebar-brand px-3 py-4 d-flex align-items-center gap-2 border-bottom">
          <mat-icon class="text-success">eco</mat-icon>
          <span class="fw-bold" style="font-size:16px;color:#2e7d32">Organic Care</span>
        </div>

        @if (auth.isLoggedIn()) {
          <div class="px-3 py-3 d-flex align-items-center gap-2 border-bottom">
            <div class="user-avatar flex-shrink-0">{{ initials() }}</div>
            <div class="overflow-hidden flex-fill">
              <div class="fw-semibold text-truncate" style="font-size:13px">
                {{ auth.currentUser()?.full_name || 'Welcome' }}
              </div>
              <div class="text-muted text-truncate" style="font-size:11px">
                {{ auth.currentUser()?.email }}
              </div>
            </div>
          </div>
        }

        <nav class="flex-fill py-2">
          @for (tab of allNavItems; track tab.route) {
            <a class="sidebar-link d-flex align-items-center gap-3 px-4 py-3 text-decoration-none"
               [routerLink]="tab.route"
               [class.active]="isActive(tab.route)">
              <mat-icon>{{ tab.icon }}</mat-icon>
              <span>{{ tab.label }}</span>
            </a>
          }

          <a class="sidebar-link d-flex align-items-center gap-3 px-4 py-3 text-decoration-none"
             routerLink="/meal-planner"
             [class.active]="isActive('/meal-planner')">
            <mat-icon>calendar_month</mat-icon>
            <span>Planner</span>
          </a>

          <a class="sidebar-link d-flex align-items-center gap-3 px-4 py-3 text-decoration-none"
             routerLink="/pantry"
             [class.active]="isActive('/pantry')">
            <mat-icon>kitchen</mat-icon>
            <span>Pantry</span>
          </a>
        </nav>

        <div class="border-top py-2">
          @if (auth.isLoggedIn()) {
            <button class="sidebar-link d-flex align-items-center gap-3 px-4 py-3 w-100 border-0 bg-transparent text-danger"
                    (click)="logout()">
              <mat-icon>logout</mat-icon>
              <span>Sign Out</span>
            </button>
          } @else {
            <a class="sidebar-link d-flex align-items-center gap-3 px-4 py-3 text-decoration-none"
               routerLink="/auth/login">
              <mat-icon>login</mat-icon>
              <span>Sign In</span>
            </a>
          }
        </div>
      </aside>

      <nav class="navbar d-flex d-md-none px-3 bg-white border-bottom shadow-sm top-0 position-sticky"
           style="z-index:100;height:56px;justify-content:center">
        <div class="d-flex align-items-center gap-2 fw-bold" style="color:#2e7d32;font-size:16px">
          <mat-icon>eco</mat-icon>
          Organic Care
        </div>

        <button class="btn btn-sm btn-light rounded-circle p-2 position-absolute start-0 ms-2"
                (click)="menuOpen.set(!menuOpen())"
                aria-label="Menu">
          <mat-icon style="font-size:20px;line-height:1;display:block">menu</mat-icon>
        </button>
      </nav>

      @if (menuOpen()) {
        <div class="drawer-backdrop" (click)="menuOpen.set(false)"></div>

        <nav class="side-drawer d-flex flex-column fade-in">
          <div class="d-flex align-items-center gap-2 px-4 py-4 border-bottom fw-bold"
               style="color:#2e7d32;font-size:17px">
            <mat-icon>eco</mat-icon>
            Organic Care AI
          </div>

          @if (auth.isLoggedIn()) {
            <div class="px-4 py-2 text-muted small border-bottom">
              {{ auth.currentUser()?.full_name || auth.currentUser()?.email }}
            </div>
          }

          @for (tab of allNavItems; track tab.route) {
            <a class="drawer-link d-flex align-items-center gap-3 px-4 py-3 text-decoration-none"
               [routerLink]="tab.route"
               (click)="menuOpen.set(false)">
              <mat-icon style="color:#6b7c6b">{{ tab.icon }}</mat-icon>
              <span>{{ tab.label }}</span>
            </a>
          }

          <a class="drawer-link d-flex align-items-center gap-3 px-4 py-3 text-decoration-none"
             routerLink="/meal-planner"
             (click)="menuOpen.set(false)">
            <mat-icon style="color:#6b7c6b">calendar_month</mat-icon>
            <span>Planner</span>
          </a>

          <a class="drawer-link d-flex align-items-center gap-3 px-4 py-3 text-decoration-none"
             routerLink="/pantry"
             (click)="menuOpen.set(false)">
            <mat-icon style="color:#6b7c6b">kitchen</mat-icon>
            <span>Pantry</span>
          </a>

          <div class="border-top mt-auto">
            @if (auth.isLoggedIn()) {
              <button class="drawer-link d-flex align-items-center gap-3 px-4 py-3 w-100 border-0 bg-transparent text-danger"
                      (click)="logout()">
                <mat-icon>logout</mat-icon>
                Sign Out
              </button>
            } @else {
              <a class="drawer-link d-flex align-items-center gap-3 px-4 py-3 text-decoration-none"
                 routerLink="/auth/login"
                 (click)="menuOpen.set(false)">
                <mat-icon style="color:#6b7c6b">login</mat-icon>
                Sign In
              </a>
            }
          </div>
        </nav>
      }

      <main class="page-content flex-fill overflow-auto">
        <router-outlet />
      </main>

      <nav class="bottom-nav d-flex d-md-none bg-white">
        @for (tab of navLeft; track tab.route) {
          <a class="nav-tab flex-fill d-flex flex-column align-items-center justify-content-center gap-1 text-decoration-none py-2"
             [routerLink]="tab.route"
             [class.active]="isActive(tab.route)">
            <mat-icon style="font-size:22px;width:22px;height:22px">{{ tab.icon }}</mat-icon>
            <span class="nav-label">{{ tab.label }}</span>
          </a>
        }

        <a class="nav-center-btn d-flex align-items-center justify-content-center text-decoration-none"
           [routerLink]="navCenter.route">
          <mat-icon style="font-size:26px;width:26px;height:26px;color:#fff">
            {{ navCenter.icon }}
          </mat-icon>
        </a>

        @for (tab of navRight; track tab.route) {
          <a class="nav-tab flex-fill d-flex flex-column align-items-center justify-content-center gap-1 text-decoration-none py-2"
             [routerLink]="tab.route"
             [class.active]="isActive(tab.route)">
            <mat-icon style="font-size:22px;width:22px;height:22px">{{ tab.icon }}</mat-icon>
            <span class="nav-label">{{ tab.label }}</span>
          </a>
        }

        <!-- Pantry tab fills the right slot since only Profile is in navRight -->
        <a class="nav-tab flex-fill d-flex flex-column align-items-center justify-content-center gap-1 text-decoration-none py-2"
           routerLink="/pantry"
           [class.active]="isActive('/pantry')">
          <mat-icon style="font-size:22px;width:22px;height:22px">kitchen</mat-icon>
          <span class="nav-label">Pantry</span>
        </a>
      </nav>

      @if (!isActive('/chat') && !isActive('/notifications') && !activeRoute().startsWith('/auth')) {
        <app-chat-widget />
      }

      <!-- Auto-logout idle warning -->
      @if (showIdleWarning()) {
        <div class="idle-backdrop">
          <div class="idle-card">
            <div class="idle-icon">⏱</div>
            <div class="idle-text">
              <div class="idle-title">Session expiring soon</div>
              <div class="idle-sub">You'll be signed out in <strong>{{ idleSecondsLeft() }}s</strong> due to inactivity.</div>
            </div>
            <button class="idle-btn" (click)="stayLoggedIn()">Stay logged in</button>
          </div>
        </div>
      }

    </div>
  `,
  styles: [`
    .app-shell {
      display: flex;
      flex-direction: column;
      min-height: 100vh;
    }

    .sidebar {
      width: 240px;
      flex-shrink: 0;
      background: #fff;
      border-right: 1px solid #e8f0e8;
      position: sticky;
      top: 0;
      height: 100vh;
      overflow-y: auto;
    }

    .sidebar-link {
      font-size: 14px;
      font-weight: 500;
      color: #555;
      border-left: 3px solid transparent;
      transition: all 0.15s;
      cursor: pointer;
    }

    .sidebar-link mat-icon {
      font-size: 20px;
      color: #9e9e9e;
    }

    .sidebar-link:hover {
      background: #f2f5f0;
      color: #2e7d32;
    }

    .sidebar-link:hover mat-icon {
      color: #2e7d32;
    }

    .sidebar-link.active {
      background: #e8f5e9;
      color: #2e7d32;
      font-weight: 600;
      border-left-color: #4caf50;
    }

    .sidebar-link.active mat-icon {
      color: #2e7d32;
    }

    .user-avatar {
      width: 36px;
      height: 36px;
      border-radius: 50%;
      background: #4caf50;
      color: #fff;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 13px;
      font-weight: 700;
    }

    .drawer-backdrop {
      position: fixed;
      inset: 0;
      background: rgba(0, 0, 0, 0.35);
      z-index: 200;
    }

    .side-drawer {
      position: fixed;
      top: 0;
      left: 0;
      width: 260px;
      height: 100%;
      background: #fff;
      z-index: 300;
      box-shadow: 4px 0 16px rgba(0, 0, 0, 0.12);
      overflow-y: auto;
    }

    .drawer-link {
      font-size: 15px;
      font-weight: 500;
      color: #1a2a1a;
      transition: background 0.15s;
      cursor: pointer;
    }

    .drawer-link:hover {
      background: #f2f5f0;
    }

    .page-content {
      padding-bottom: 64px;
    }

    .bottom-nav {
      position: fixed;
      bottom: 0;
      left: 0;
      right: 0;
      height: 64px;
      z-index: 100;
      border-top: 1px solid #EBEBEB;
      box-shadow: 0 -2px 12px rgba(0, 0, 0, 0.06);
      align-items: flex-end;
      padding-bottom: 8px;
    }

    .nav-tab {
      color: #BDBDBD;
      font-size: 10px;
      font-weight: 600;
      position: relative;
      transition: color 0.2s;
      padding-bottom: 2px;
    }

    .nav-tab.active {
      color: #2E7D32;
    }

    .nav-label {
      line-height: 1;
      letter-spacing: 0.2px;
    }

    .nav-center-btn {
      width: 52px;
      height: 52px;
      border-radius: 50%;
      background: linear-gradient(135deg, #2E7D32, #4CAF50);
      margin-bottom: 8px;
      flex-shrink: 0;
      box-shadow: 0 4px 14px rgba(46, 125, 50, 0.45);
      transition: transform 0.15s, box-shadow 0.15s;
    }

    .nav-center-btn:hover {
      transform: translateY(-2px);
      box-shadow: 0 6px 18px rgba(46, 125, 50, 0.5);
    }

    .nav-center-btn:active {
      transform: scale(0.94);
    }

    .fade-in {
      animation: fadeIn 0.25s ease-out;
    }

    @keyframes fadeIn {
      from {
        opacity: 0;
        transform: translateX(-16px);
      }
      to {
        opacity: 1;
        transform: translateX(0);
      }
    }

    @media (min-width: 768px) {
      .app-shell {
        flex-direction: row;
      }

      .page-content {
        padding-bottom: 0;
      }
    }

    /* ── Idle warning ──────────────────────────────── */
    .idle-backdrop {
      position: fixed;
      inset: 0;
      background: rgba(0, 0, 0, 0.35);
      z-index: 9999;
      display: flex;
      align-items: flex-end;
      justify-content: center;
      padding: 0 16px 24px;
      animation: fadeInBackdrop 0.25s ease-out;
    }

    .idle-card {
      background: #fff;
      border-radius: 20px;
      padding: 20px 20px 20px 18px;
      max-width: 420px;
      width: 100%;
      display: flex;
      align-items: center;
      gap: 14px;
      box-shadow: 0 8px 32px rgba(0, 0, 0, 0.18);
      border-left: 4px solid #f9a825;
      animation: slideUp 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
    }

    .idle-icon {
      font-size: 28px;
      line-height: 1;
      flex-shrink: 0;
    }

    .idle-text {
      flex: 1;
      min-width: 0;
    }

    .idle-title {
      font-size: 14px;
      font-weight: 700;
      color: #1a2a1a;
      margin-bottom: 3px;
    }

    .idle-sub {
      font-size: 12px;
      color: #757575;
      line-height: 1.4;
    }

    .idle-sub strong {
      color: #e65100;
      font-size: 13px;
    }

    .idle-btn {
      flex-shrink: 0;
      background: linear-gradient(135deg, #2e7d32, #1b5e20);
      color: #fff;
      border: none;
      border-radius: 20px;
      padding: 9px 18px;
      font-size: 13px;
      font-weight: 700;
      cursor: pointer;
      font-family: inherit;
      transition: transform 0.15s, box-shadow 0.15s;
      box-shadow: 0 2px 8px rgba(46, 125, 50, 0.3);
    }

    .idle-btn:hover {
      transform: translateY(-1px);
      box-shadow: 0 4px 14px rgba(46, 125, 50, 0.4);
    }

    @keyframes slideUp {
      from { transform: translateY(60px); opacity: 0; }
      to   { transform: translateY(0);    opacity: 1; }
    }

    @keyframes fadeInBackdrop {
      from { opacity: 0; }
      to   { opacity: 1; }
    }
  `],
})
export class AppComponent implements OnInit, OnDestroy {
  auth   = inject(AuthService);
  router = inject(Router);
  private zone = inject(NgZone);

  navLeft   = NAV_LEFT;
  navRight  = NAV_RIGHT;
  navCenter = NAV_CENTER;

  allNavItems: NavTab[] = [...this.navLeft, this.navCenter, ...this.navRight];

  menuOpen    = signal(false);
  activeRoute = signal('/');

  // ── Idle session ────────────────────────────────────────────────────────────
  showIdleWarning = signal(false);
  idleSecondsLeft = signal(60);

  private readonly IDLE_MS = 5 * 60 * 1000;   // 5 minutes total idle
  private readonly WARN_MS = 4 * 60 * 1000;   // warn after 4 min (1 min to logout)

  private warnTimer:        ReturnType<typeof setTimeout>  | null = null;
  private logoutTimer:      ReturnType<typeof setTimeout>  | null = null;
  private countdownInterval: ReturnType<typeof setInterval> | null = null;

  private readonly activityEvents = ['mousemove', 'mousedown', 'keydown', 'touchstart', 'scroll', 'click'];
  private readonly onActivity = () => this.resetIdleTimer();

  constructor() {
    this.router.events
      .pipe(filter((event): event is NavigationEnd => event instanceof NavigationEnd))
      .subscribe(event => {
        this.activeRoute.set(event.urlAfterRedirects || event.url);
      });
  }

  ngOnInit() {
    this.zone.runOutsideAngular(() => {
      this.activityEvents.forEach(ev =>
        document.addEventListener(ev, this.onActivity, { passive: true })
      );
    });
    if (this.auth.isLoggedIn()) this.resetIdleTimer();
  }

  ngOnDestroy() {
    this.activityEvents.forEach(ev =>
      document.removeEventListener(ev, this.onActivity)
    );
    this.clearIdleTimers();
  }

  private resetIdleTimer() {
    if (!this.auth.isLoggedIn()) return;
    this.clearIdleTimers();

    this.zone.run(() => {
      if (this.showIdleWarning()) {
        this.showIdleWarning.set(false);
      }
    });

    this.zone.runOutsideAngular(() => {
      this.warnTimer = setTimeout(() => {
        this.zone.run(() => {
          this.showIdleWarning.set(true);
          this.idleSecondsLeft.set(60);
          this.countdownInterval = setInterval(() => {
            this.zone.run(() => {
              const left = this.idleSecondsLeft() - 1;
              this.idleSecondsLeft.set(left);
            });
          }, 1000);
        });
      }, this.WARN_MS);

      this.logoutTimer = setTimeout(() => {
        this.zone.run(() => {
          this.clearIdleTimers();
          this.logout();
        });
      }, this.IDLE_MS);
    });
  }

  private clearIdleTimers() {
    if (this.warnTimer)        { clearTimeout(this.warnTimer);         this.warnTimer = null; }
    if (this.logoutTimer)      { clearTimeout(this.logoutTimer);       this.logoutTimer = null; }
    if (this.countdownInterval){ clearInterval(this.countdownInterval); this.countdownInterval = null; }
  }

  stayLoggedIn() {
    this.resetIdleTimer();
  }

  // ── Helpers ──────────────────────────────────────────────────────────────────

  isActive(route: string): boolean {
    const current = this.activeRoute();
    if (route === '/') return current === '/' || current === '';
    return current.startsWith(route);
  }

  initials(): string {
    const user = this.auth.currentUser();
    const name = user?.full_name || user?.email || '?';
    return name
      .split(/[\s@]/)
      .map(word => word[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);
  }

  logout(): void {
    this.clearIdleTimers();
    this.showIdleWarning.set(false);
    this.menuOpen.set(false);
    this.auth.logout();
    this.router.navigate(['/auth/login']);
  }
}
