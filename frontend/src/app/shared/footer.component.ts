import { Component, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { FormsModule } from '@angular/forms';

interface FooterLink { label: string; route: string; }
interface SocialLink { label: string; abbr: string; href: string; color: string; }

@Component({
  selector: 'app-footer',
  standalone: true,
  imports: [CommonModule, RouterLink, MatIconModule, FormsModule],
  template: `
<footer class="site-footer">

  <!-- ── Top accent bar ── -->
  <div class="footer-accent"></div>

  <!-- ── Main grid ── -->
  <div class="footer-body">
    <div class="footer-grid">

      <!-- Brand column -->
      <div class="footer-brand">
        <div class="brand-logo">
          <mat-icon class="brand-icon">eco</mat-icon>
          <span class="brand-name">Organic Care</span>
        </div>
        <p class="brand-tagline">
          Nourishing lives through organic living. Personalised nutrition, powered by AI.
        </p>
        <div class="social-row">
          @for (s of social; track s.label) {
            <a [href]="s.href" target="_blank" rel="noopener" class="social-btn"
               [attr.aria-label]="s.label" [title]="s.label">
              <span class="social-abbr">{{ s.abbr }}</span>
            </a>
          }
        </div>
      </div>

      <!-- Company -->
      <div class="footer-col">
        <h4 class="col-heading">Company</h4>
        <ul class="col-links">
          @for (l of company; track l.route) {
            <li><a [routerLink]="l.route" class="footer-link">{{ l.label }}</a></li>
          }
        </ul>
      </div>

      <!-- Support -->
      <div class="footer-col">
        <h4 class="col-heading">Support</h4>
        <ul class="col-links">
          @for (l of support; track l.route) {
            <li><a [routerLink]="l.route" class="footer-link">{{ l.label }}</a></li>
          }
        </ul>
      </div>

      <!-- Legal -->
      <div class="footer-col">
        <h4 class="col-heading">Legal</h4>
        <ul class="col-links">
          @for (l of legal; track l.route) {
            <li><a [routerLink]="l.route" class="footer-link">{{ l.label }}</a></li>
          }
        </ul>
      </div>

    </div>

    <!-- ── Contact info ── -->
    <div class="footer-divider"></div>
    <div class="contact-row">
      <a href="mailto:support@organiccare.ai" class="contact-item">
        <mat-icon class="contact-icon">email</mat-icon>
        <span>support&#64;organiccare.ai</span>
      </a>
      <div class="contact-item">
        <mat-icon class="contact-icon">location_on</mat-icon>
        <span>Chicago, IL, USA</span>
      </div>
    </div>

    <!-- ── Newsletter ── -->
    <div class="footer-divider"></div>
    <div class="newsletter-block">
      <div class="newsletter-text">
        <h3 class="newsletter-title">Stay Healthy with Organic Care</h3>
        <p class="newsletter-sub">
          Get healthy recipes, nutrition tips, and product updates delivered to your inbox.
        </p>
      </div>
      <form class="newsletter-form" (submit)="subscribe($event)">
        <div class="input-wrap">
          <mat-icon class="input-icon">mail_outline</mat-icon>
          <input
            class="newsletter-input"
            type="email"
            [(ngModel)]="email"
            name="email"
            placeholder="Enter your email"
            [class.input-error]="showError()"
            autocomplete="email">
        </div>
        <button type="submit" class="subscribe-btn">
          @if (subscribed()) {
            <mat-icon style="font-size:18px;margin-right:4px">check_circle</mat-icon> Subscribed!
          } @else {
            Subscribe
          }
        </button>
      </form>
      @if (showError()) {
        <p class="error-msg">Please enter a valid email address.</p>
      }
      @if (subscribed()) {
        <p class="success-msg">
          <mat-icon style="font-size:15px;vertical-align:-3px">check_circle</mat-icon>
          Thank you! You're now on the list.
        </p>
      }
    </div>

  </div>

  <!-- ── Bottom bar ── -->
  <div class="footer-bottom">
    <span class="copyright">© 2026 Organic Care. All Rights Reserved.</span>
    <div class="bottom-links">
      <a routerLink="/privacy" class="bottom-link">Privacy Policy</a>
      <span class="bottom-sep">·</span>
      <a routerLink="/terms" class="bottom-link">Terms &amp; Conditions</a>
      <span class="bottom-sep">·</span>
      <a routerLink="/cookies" class="bottom-link">Cookie Policy</a>
    </div>
  </div>

</footer>
  `,
  styles: [`
    .site-footer {
      background: linear-gradient(180deg, #1a2e1a 0%, #142214 100%);
      color: rgba(255,255,255,0.82);
      font-family: inherit;
    }

    /* Accent bar */
    .footer-accent {
      height: 3px;
      background: linear-gradient(90deg, #4caf50, #81c784, #4caf50);
      background-size: 200% auto;
      animation: shimmer 4s linear infinite;
    }

    /* Main body */
    .footer-body {
      max-width: 1200px;
      margin: 0 auto;
      padding: 48px 24px 40px;
    }

    /* Grid */
    .footer-grid {
      display: grid;
      grid-template-columns: 1.6fr 1fr 1fr 1fr;
      gap: 40px;
    }

    /* Brand column */
    .footer-brand {}
    .brand-logo {
      display: flex;
      align-items: center;
      gap: 8px;
      margin-bottom: 12px;
    }
    .brand-icon {
      color: #66bb6a;
      font-size: 26px;
    }
    .brand-name {
      font-size: 18px;
      font-weight: 800;
      color: #fff;
      letter-spacing: 0.2px;
    }
    .brand-tagline {
      font-size: 13px;
      line-height: 1.65;
      color: rgba(255,255,255,0.55);
      margin: 0 0 20px;
      max-width: 240px;
    }

    /* Social buttons */
    .social-row {
      display: flex;
      gap: 8px;
      flex-wrap: wrap;
    }
    .social-btn {
      width: 36px;
      height: 36px;
      border-radius: 50%;
      background: rgba(255,255,255,0.08);
      border: 1px solid rgba(255,255,255,0.12);
      display: flex;
      align-items: center;
      justify-content: center;
      text-decoration: none;
      transition: background 0.2s, transform 0.2s, border-color 0.2s;
    }
    .social-btn:hover {
      background: rgba(76,175,80,0.25);
      border-color: #4caf50;
      transform: translateY(-2px);
    }
    .social-abbr {
      font-size: 11px;
      font-weight: 800;
      color: rgba(255,255,255,0.75);
      letter-spacing: 0.5px;
    }
    .social-btn:hover .social-abbr { color: #fff; }

    /* Nav columns */
    .footer-col {}
    .col-heading {
      font-size: 11px;
      font-weight: 800;
      letter-spacing: 1.2px;
      text-transform: uppercase;
      color: #66bb6a;
      margin: 0 0 16px;
    }
    .col-links {
      list-style: none;
      padding: 0;
      margin: 0;
      display: flex;
      flex-direction: column;
      gap: 10px;
    }
    .footer-link {
      font-size: 13.5px;
      color: rgba(255,255,255,0.6);
      text-decoration: none;
      transition: color 0.18s, padding-left 0.18s;
      display: inline-block;
    }
    .footer-link:hover {
      color: #fff;
      padding-left: 4px;
    }

    /* Divider */
    .footer-divider {
      height: 1px;
      background: rgba(255,255,255,0.08);
      margin: 32px 0;
    }

    /* Contact */
    .contact-row {
      display: flex;
      gap: 36px;
      flex-wrap: wrap;
    }
    .contact-item {
      display: flex;
      align-items: center;
      gap: 8px;
      font-size: 13.5px;
      color: rgba(255,255,255,0.7);
      text-decoration: none;
      transition: color 0.18s;
    }
    a.contact-item:hover { color: #fff; }
    .contact-icon {
      font-size: 18px;
      color: #66bb6a;
    }

    /* Newsletter */
    .newsletter-block {
      display: flex;
      align-items: center;
      gap: 40px;
      flex-wrap: wrap;
    }
    .newsletter-text { flex: 1; min-width: 220px; }
    .newsletter-title {
      font-size: 16px;
      font-weight: 800;
      color: #fff;
      margin: 0 0 6px;
    }
    .newsletter-sub {
      font-size: 13px;
      color: rgba(255,255,255,0.55);
      margin: 0;
      line-height: 1.55;
    }
    .newsletter-form {
      display: flex;
      gap: 10px;
      flex: 1;
      min-width: 280px;
      flex-direction: column;
    }
    .input-wrap {
      position: relative;
      display: flex;
      align-items: center;
    }
    .input-icon {
      position: absolute;
      left: 12px;
      font-size: 18px;
      color: rgba(255,255,255,0.35);
      pointer-events: none;
    }
    .newsletter-input {
      flex: 1;
      background: rgba(255,255,255,0.07);
      border: 1.5px solid rgba(255,255,255,0.12);
      border-radius: 10px;
      padding: 11px 16px 11px 40px;
      font-size: 13.5px;
      color: #fff;
      font-family: inherit;
      outline: none;
      width: 100%;
      transition: border-color 0.18s, background 0.18s;
    }
    .newsletter-input::placeholder { color: rgba(255,255,255,0.3); }
    .newsletter-input:focus {
      border-color: #4caf50;
      background: rgba(255,255,255,0.1);
    }
    .newsletter-input.input-error { border-color: #ef5350; }
    .subscribe-btn {
      background: linear-gradient(135deg, #4caf50, #2e7d32);
      color: #fff;
      border: none;
      border-radius: 10px;
      padding: 11px 24px;
      font-size: 13.5px;
      font-weight: 700;
      cursor: pointer;
      font-family: inherit;
      white-space: nowrap;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: transform 0.15s, box-shadow 0.15s, opacity 0.15s;
      box-shadow: 0 2px 10px rgba(76,175,80,0.3);
    }
    .subscribe-btn:hover {
      transform: translateY(-1px);
      box-shadow: 0 4px 16px rgba(76,175,80,0.45);
    }
    .error-msg {
      font-size: 12px;
      color: #ef9a9a;
      margin: 4px 0 0;
    }
    .success-msg {
      font-size: 12px;
      color: #a5d6a7;
      margin: 4px 0 0;
      display: flex;
      align-items: center;
      gap: 4px;
    }

    /* Bottom bar */
    .footer-bottom {
      border-top: 1px solid rgba(255,255,255,0.06);
      padding: 16px 24px;
      max-width: 1200px;
      margin: 0 auto;
      display: flex;
      align-items: center;
      justify-content: space-between;
      flex-wrap: wrap;
      gap: 10px;
    }
    .copyright {
      font-size: 12px;
      color: rgba(255,255,255,0.35);
    }
    .bottom-links {
      display: flex;
      align-items: center;
      gap: 6px;
    }
    .bottom-link {
      font-size: 12px;
      color: rgba(255,255,255,0.4);
      text-decoration: none;
      transition: color 0.18s;
    }
    .bottom-link:hover { color: rgba(255,255,255,0.8); }
    .bottom-sep { color: rgba(255,255,255,0.2); font-size: 12px; }

    /* ── Responsive ── */
    @media (max-width: 900px) {
      .footer-grid {
        grid-template-columns: 1fr 1fr;
        gap: 32px;
      }
      .footer-brand {
        grid-column: 1 / -1;
      }
      .brand-tagline { max-width: 100%; }
    }

    @media (max-width: 600px) {
      .footer-body { padding: 36px 20px 32px; }
      .footer-grid {
        grid-template-columns: 1fr 1fr;
        gap: 28px;
      }
      .footer-brand { grid-column: 1 / -1; }
      .newsletter-block { gap: 20px; }
      .newsletter-form { min-width: 0; width: 100%; }
      .footer-bottom {
        flex-direction: column;
        align-items: flex-start;
        gap: 8px;
      }
    }

    @keyframes shimmer {
      0%   { background-position: -200% center; }
      100% { background-position:  200% center; }
    }
  `],
})
export class FooterComponent {
  email    = '';
  subscribed = signal(false);
  showError  = signal(false);

  readonly company: FooterLink[] = [
    { label: 'About Us',     route: '/about'    },
    { label: 'Our Mission',  route: '/mission'  },
    { label: 'Careers',      route: '/careers'  },
    { label: 'Blog',         route: '/blog'     },
  ];

  readonly support: FooterLink[] = [
    { label: 'Contact Us',  route: '/contact'  },
    { label: 'Help Center', route: '/help'     },
    { label: 'FAQs',        route: '/faqs'     },
    { label: 'Feedback',    route: '/feedback' },
  ];

  readonly legal: FooterLink[] = [
    { label: 'Terms & Conditions', route: '/terms'      },
    { label: 'Privacy Policy',     route: '/privacy'    },
    { label: 'Cookie Policy',      route: '/cookies'    },
    { label: 'Disclaimer',         route: '/disclaimer' },
  ];

  readonly social: SocialLink[] = [
    { label: 'Facebook',  abbr: 'f',  href: '#', color: '#1877f2' },
    { label: 'Instagram', abbr: 'ig', href: '#', color: '#e1306c' },
    { label: 'LinkedIn',  abbr: 'in', href: '#', color: '#0a66c2' },
    { label: 'YouTube',   abbr: 'yt', href: '#', color: '#ff0000' },
  ];

  subscribe(e: Event) {
    e.preventDefault();
    const valid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(this.email.trim());
    if (!valid) { this.showError.set(true); return; }
    this.showError.set(false);
    this.subscribed.set(true);
    this.email = '';
  }
}
