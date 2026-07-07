import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';

@Component({
  selector: 'app-footer',
  standalone: true,
  imports: [RouterLink, MatIconModule],
  template: `
<footer class="site-footer">

  <div class="footer-inner">

    <!-- Brand -->
    <div class="footer-brand">
      <mat-icon class="brand-icon">eco</mat-icon>
      <span class="brand-name">Organic Care</span>
    </div>

    <!-- Links -->
    <nav class="footer-links">
      <a routerLink="/about"    class="flink">About</a>
      <a routerLink="/contact"  class="flink">Contact</a>
      <a routerLink="/faqs"     class="flink">FAQs</a>
      <a routerLink="/privacy"  class="flink">Privacy</a>
      <a routerLink="/terms"    class="flink">Terms</a>
    </nav>

    <!-- Social -->
    <div class="footer-social">
      <a href="#" class="slink" aria-label="Facebook">f</a>
      <a href="#" class="slink" aria-label="Instagram">ig</a>
      <a href="#" class="slink" aria-label="LinkedIn">in</a>
      <a href="#" class="slink" aria-label="YouTube">yt</a>
    </div>

  </div>

  <div class="footer-bottom">
    <span>© 2026 Organic Care. All Rights Reserved.</span>
    <a href="mailto:support@organiccare.ai" class="footer-email">
      support&#64;organiccare.ai
    </a>
  </div>

</footer>
  `,
  styles: [`
    .site-footer {
      background: #1a2e1a;
      color: rgba(255,255,255,0.6);
      font-family: inherit;
      border-top: 3px solid #4caf50;
    }

    .footer-inner {
      max-width: 1100px;
      margin: 0 auto;
      padding: 24px 24px 20px;
      display: flex;
      align-items: center;
      gap: 24px;
      flex-wrap: wrap;
    }

    /* Brand */
    .footer-brand {
      display: flex;
      align-items: center;
      gap: 7px;
      text-decoration: none;
      flex-shrink: 0;
    }
    .brand-icon { color: #66bb6a; font-size: 22px; }
    .brand-name { font-size: 15px; font-weight: 800; color: #fff; letter-spacing: 0.2px; }

    /* Links */
    .footer-links {
      display: flex;
      align-items: center;
      gap: 4px;
      flex-wrap: wrap;
      flex: 1;
    }
    .flink {
      font-size: 13px;
      color: rgba(255,255,255,0.55);
      text-decoration: none;
      padding: 4px 10px;
      border-radius: 6px;
      transition: color 0.15s, background 0.15s;
    }
    .flink:hover { color: #fff; background: rgba(255,255,255,0.07); }

    /* Social */
    .footer-social { display: flex; gap: 6px; flex-shrink: 0; }
    .slink {
      width: 30px; height: 30px;
      border-radius: 50%;
      background: rgba(255,255,255,0.07);
      border: 1px solid rgba(255,255,255,0.12);
      display: flex; align-items: center; justify-content: center;
      font-size: 10px; font-weight: 800;
      color: rgba(255,255,255,0.6);
      text-decoration: none;
      transition: background 0.15s, color 0.15s;
    }
    .slink:hover { background: rgba(76,175,80,0.2); color: #fff; border-color: #4caf50; }

    /* Bottom bar */
    .footer-bottom {
      max-width: 1100px;
      margin: 0 auto;
      padding: 12px 24px;
      border-top: 1px solid rgba(255,255,255,0.06);
      display: flex;
      align-items: center;
      justify-content: space-between;
      flex-wrap: wrap;
      gap: 8px;
      font-size: 12px;
    }
    .footer-email {
      color: rgba(255,255,255,0.4);
      text-decoration: none;
      transition: color 0.15s;
    }
    .footer-email:hover { color: rgba(255,255,255,0.8); }

    @media (max-width: 600px) {
      .footer-inner { padding: 20px 16px 16px; gap: 16px; }
      .footer-links { gap: 2px; }
      .footer-bottom { flex-direction: column; align-items: flex-start; padding: 12px 16px; }
    }
  `],
})
export class FooterComponent {}
