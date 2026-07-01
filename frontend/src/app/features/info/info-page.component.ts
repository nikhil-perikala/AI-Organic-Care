import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';

interface PageDef {
  icon: string;
  title: string;
  subtitle: string;
  badge?: string;
  sections: { heading: string; body: string }[];
}

const PAGE_MAP: Record<string, PageDef> = {
  about: {
    icon: 'eco',
    title: 'About Us',
    subtitle: 'We believe in the healing power of organic, whole-food nutrition — and we built Organic Care to make that wisdom accessible to everyone.',
    sections: [
      {
        heading: 'Who We Are',
        body: 'Organic Care is an AI-powered wellness platform that helps you eat smarter, live healthier, and make the most of what's already in your pantry. Founded in 2024, we combine cutting-edge retrieval-augmented AI with trusted nutritional science to deliver personalised meal plans, recipe recommendations, and wellness guidance.',
      },
      {
        heading: 'Our Story',
        body: 'We started with a simple frustration: healthy eating advice is everywhere, but personalised, actionable guidance is rare. Most apps give generic tips. We wanted something that knows your pantry, understands your health goals, and speaks to you — not to the average user.',
      },
      {
        heading: 'Our Team',
        body: 'We are a passionate team of nutritionists, engineers, and wellness enthusiasts based in Chicago, IL. We bring together expertise in AI, dietary science, and product design to build tools that genuinely improve daily life.',
      },
    ],
  },
  mission: {
    icon: 'track_changes',
    title: 'Our Mission',
    subtitle: 'To make organic, intelligent nutrition guidance accessible, affordable, and deeply personal for every household.',
    sections: [
      {
        heading: 'What We Stand For',
        body: 'We believe food is medicine. Our mission is to help people understand how the organic foods they already buy can support their specific health goals — whether that's managing a condition, losing weight, building strength, or simply feeling more energised.',
      },
      {
        heading: 'Sustainability',
        body: 'We champion organic produce and sustainable food systems. Every recommendation we make prioritises ingredients that are good for you and better for the planet. We actively partner with ethical suppliers and promote seasonal, locally-sourced eating where possible.',
      },
      {
        heading: 'Accessibility',
        body: 'Great nutrition advice should not be a luxury. We work to keep Organic Care affordable and intuitive so that everyone — from busy parents to student athletes — can benefit from AI-driven wellness guidance.',
      },
    ],
  },
  careers: {
    icon: 'work_outline',
    title: 'Careers',
    subtitle: 'Join us in building the future of personalised nutrition. We are a small, high-impact team and every role matters.',
    badge: 'We're hiring',
    sections: [
      {
        heading: 'Open Positions',
        body: 'We are currently looking for talented individuals in Full-Stack Engineering, Machine Learning, Nutritional Science, and Growth Marketing. If you are passionate about health technology and want to work on meaningful problems, we would love to hear from you.',
      },
      {
        heading: 'Life at Organic Care',
        body: 'We are a remote-first company with a headquarters in Chicago. We offer competitive salaries, equity, full health benefits, a generous learning budget, and flexible working hours. We care deeply about work-life balance and the wellbeing of our team.',
      },
      {
        heading: 'How to Apply',
        body: 'Send your CV and a brief note about why you want to join Organic Care to support@organiccare.ai with the subject line "Careers — [Role]". We review all applications and respond within two weeks.',
      },
    ],
  },
  blog: {
    icon: 'article',
    title: 'Blog',
    subtitle: 'Insights, recipes, and wellness science — written by our team of nutritionists and health researchers.',
    badge: 'Coming soon',
    sections: [
      {
        heading: 'What to Expect',
        body: 'Our blog will cover evidence-based nutrition advice, deep-dives into organic superfoods, seasonal recipe guides, meal prep strategies, and the latest research in gut health, sleep science, and sports nutrition.',
      },
      {
        heading: 'Contribute',
        body: 'Are you a registered dietitian, nutritionist, or wellness professional? We welcome guest contributions. Reach out to us at support@organiccare.ai with your topic idea and credentials.',
      },
    ],
  },
  contact: {
    icon: 'contact_support',
    title: 'Contact Us',
    subtitle: 'We're here to help. Reach out and our team will respond within 24 hours.',
    sections: [
      {
        heading: 'Email Support',
        body: 'For general enquiries, account issues, or feature requests, email us at support@organiccare.ai. We aim to respond to all messages within one business day.',
      },
      {
        heading: 'Office',
        body: 'Organic Care Inc.\n233 S Wacker Dr, Suite 8400\nChicago, IL 60606\nUnited States',
      },
      {
        heading: 'Social Media',
        body: 'You can also reach us on Instagram, LinkedIn, and Facebook (@OrganicCareAI). We monitor our social channels during business hours and love hearing from our community.',
      },
    ],
  },
  help: {
    icon: 'help_outline',
    title: 'Help Center',
    subtitle: 'Everything you need to get the most out of Organic Care.',
    badge: 'Coming soon',
    sections: [
      {
        heading: 'Getting Started',
        body: 'Create your account, fill in your dietary preferences and health goals in the Profile section, then add your pantry items. Organic Care will immediately start surfacing personalised recipe recommendations and nutrition guidance.',
      },
      {
        heading: 'AI Chat',
        body: 'Our AI assistant knows your pantry, your dietary restrictions, and your health goals. Ask it anything from "what can I cook tonight?" to "what foods help with inflammation?" You can speak to it using the microphone button.',
      },
      {
        heading: 'Pantry Management',
        body: 'Keep your pantry up to date by scanning receipts (AI auto-fill), searching for items, or adding them manually. Set expiry dates and Organic Care will alert you before food goes to waste.',
      },
    ],
  },
  faqs: {
    icon: 'quiz',
    title: 'FAQs',
    subtitle: 'Answers to the questions we get most often.',
    sections: [
      {
        heading: 'Is Organic Care free?',
        body: 'Yes, the core features of Organic Care — AI chat, recipe recommendations, pantry management, and meal planning — are free. We plan to offer a premium tier with advanced analytics and dietitian consultations in the future.',
      },
      {
        heading: 'How does the AI know what's in my pantry?',
        body: 'You add items to your pantry manually or by scanning a receipt. The AI reads your pantry list every time you ask a question and tailors its answers specifically to what you have available.',
      },
      {
        heading: 'Are the nutrition facts accurate?',
        body: 'Our recommendations are powered by the USDA nutritional database and curated organic food data. They are intended as informational guidance and should not replace the advice of a registered dietitian or physician.',
      },
      {
        heading: 'How do I delete my account?',
        body: 'You can delete your account from the Profile → Account Settings page. All your data will be permanently removed within 30 days. Email us at support@organiccare.ai if you need assistance.',
      },
    ],
  },
  feedback: {
    icon: 'feedback',
    title: 'Feedback',
    subtitle: 'Your feedback makes Organic Care better. Tell us what you love, what's broken, and what you wish existed.',
    sections: [
      {
        heading: 'Share Your Thoughts',
        body: 'We read every piece of feedback we receive. Whether it's a bug report, a feature request, or a compliment — we want to hear it. Email us at support@organiccare.ai or use the thumbs up / thumbs down buttons in the AI chat to rate individual responses.',
      },
      {
        heading: 'Report a Bug',
        body: 'If something isn't working correctly, please email support@organiccare.ai with a description of what happened, the steps to reproduce it, and your device/browser. Screenshots are always helpful.',
      },
    ],
  },
  terms: {
    icon: 'gavel',
    title: 'Terms & Conditions',
    subtitle: 'Please read these terms carefully before using Organic Care.',
    sections: [
      {
        heading: '1. Acceptance of Terms',
        body: 'By accessing or using Organic Care, you agree to be bound by these Terms and Conditions and our Privacy Policy. If you do not agree, please do not use our service.',
      },
      {
        heading: '2. Use of Service',
        body: 'Organic Care is provided for personal, non-commercial use only. You may not reproduce, duplicate, copy, sell, or exploit any portion of the service without our express written permission.',
      },
      {
        heading: '3. Health Disclaimer',
        body: 'The nutritional information and recommendations provided by Organic Care are for informational purposes only and do not constitute medical advice. Always consult a qualified healthcare professional before making significant changes to your diet.',
      },
      {
        heading: '4. Account Responsibility',
        body: 'You are responsible for maintaining the confidentiality of your account credentials and for all activities that occur under your account. Notify us immediately if you suspect unauthorised access.',
      },
      {
        heading: '5. Changes to Terms',
        body: 'We reserve the right to modify these terms at any time. Continued use of the service after changes constitutes acceptance of the new terms. We will notify registered users of material changes via email.',
      },
    ],
  },
  privacy: {
    icon: 'privacy_tip',
    title: 'Privacy Policy',
    subtitle: 'We are committed to protecting your privacy and handling your data responsibly.',
    sections: [
      {
        heading: 'Data We Collect',
        body: 'We collect your email address, name, dietary preferences, health goals, and pantry data that you voluntarily provide. We also collect usage analytics to improve the service.',
      },
      {
        heading: 'How We Use Your Data',
        body: 'Your data is used exclusively to personalise your Organic Care experience — generating recommendations, remembering your preferences, and improving AI responses. We never sell your personal data to third parties.',
      },
      {
        heading: 'Data Storage & Security',
        body: 'Your data is stored on encrypted servers hosted in the United States. We use industry-standard security practices including TLS encryption, hashed passwords, and regular security audits.',
      },
      {
        heading: 'Your Rights',
        body: 'You have the right to access, correct, or delete your personal data at any time. Contact us at support@organiccare.ai to exercise these rights. We comply with GDPR and CCPA requirements.',
      },
      {
        heading: 'Cookies',
        body: 'We use essential cookies for authentication and session management. We do not use advertising cookies. See our Cookie Policy for full details.',
      },
    ],
  },
  cookies: {
    icon: 'cookie',
    title: 'Cookie Policy',
    subtitle: 'We use cookies sparingly and only for essential functionality.',
    sections: [
      {
        heading: 'What Are Cookies?',
        body: 'Cookies are small text files stored on your device that help websites remember information about your visit, such as your login status and preferences.',
      },
      {
        heading: 'Cookies We Use',
        body: 'We use only essential, first-party cookies: an authentication token to keep you logged in, and a session identifier for security. We do not use advertising cookies, tracking pixels, or third-party analytics cookies.',
      },
      {
        heading: 'Managing Cookies',
        body: 'You can control cookies through your browser settings. Disabling essential cookies will prevent you from remaining logged in. We do not currently use any optional cookies that can be selectively disabled.',
      },
    ],
  },
  disclaimer: {
    icon: 'warning_amber',
    title: 'Disclaimer',
    subtitle: 'Important limitations on the information provided by Organic Care.',
    sections: [
      {
        heading: 'Not Medical Advice',
        body: 'All content on Organic Care — including AI-generated responses, recipe recommendations, and nutritional information — is for informational and educational purposes only. It is not intended to be a substitute for professional medical advice, diagnosis, or treatment.',
      },
      {
        heading: 'Accuracy',
        body: 'While we strive to provide accurate nutritional information sourced from the USDA database and peer-reviewed research, we cannot guarantee that all information is current, complete, or error-free. Nutritional science evolves and individual dietary needs vary.',
      },
      {
        heading: 'External Links',
        body: 'Our service may contain links to third-party websites. We are not responsible for the content, privacy practices, or accuracy of external sites.',
      },
    ],
  },
};

@Component({
  selector: 'app-info-page',
  standalone: true,
  imports: [CommonModule, RouterLink, MatIconModule],
  template: `
<div class="info-page" *ngIf="page">

  <!-- Hero -->
  <div class="info-hero">
    <div class="info-hero-inner">
      @if (page.badge) {
        <span class="info-badge">{{ page.badge }}</span>
      }
      <div class="info-hero-icon">
        <mat-icon>{{ page.icon }}</mat-icon>
      </div>
      <h1 class="info-title">{{ page.title }}</h1>
      <p class="info-subtitle">{{ page.subtitle }}</p>
    </div>
  </div>

  <!-- Content -->
  <div class="info-body">
    @for (section of page.sections; track section.heading) {
      <div class="info-section">
        <h2 class="section-heading">{{ section.heading }}</h2>
        <p class="section-body">{{ section.body }}</p>
      </div>
    }

    <div class="info-back">
      <a routerLink="/" class="back-btn">
        <mat-icon>arrow_back</mat-icon>
        Back to Home
      </a>
    </div>
  </div>

</div>
  `,
  styles: [`
    .info-page {
      min-height: calc(100vh - 64px);
      background: #f8faf8;
    }

    /* Hero */
    .info-hero {
      background: linear-gradient(135deg, #1b5e20 0%, #2e7d32 60%, #388e3c 100%);
      padding: 56px 24px 52px;
    }
    .info-hero-inner {
      max-width: 720px;
      margin: 0 auto;
      text-align: center;
    }
    .info-badge {
      display: inline-block;
      background: rgba(255,255,255,0.15);
      border: 1px solid rgba(255,255,255,0.25);
      color: #fff;
      font-size: 11px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 1px;
      padding: 4px 12px;
      border-radius: 20px;
      margin-bottom: 14px;
    }
    .info-hero-icon {
      width: 60px; height: 60px;
      border-radius: 50%;
      background: rgba(255,255,255,0.12);
      border: 1.5px solid rgba(255,255,255,0.2);
      display: flex; align-items: center; justify-content: center;
      margin: 0 auto 16px;
      mat-icon { font-size: 28px; color: #a5d6a7; }
    }
    .info-title {
      font-size: 32px;
      font-weight: 800;
      color: #fff;
      margin: 0 0 14px;
      letter-spacing: -0.3px;
    }
    .info-subtitle {
      font-size: 15px;
      color: rgba(255,255,255,0.72);
      line-height: 1.6;
      margin: 0;
      max-width: 560px;
      margin: 0 auto;
    }

    /* Body */
    .info-body {
      max-width: 720px;
      margin: 0 auto;
      padding: 48px 24px 56px;
    }
    .info-section {
      background: #fff;
      border-radius: 16px;
      padding: 28px 30px;
      margin-bottom: 16px;
      box-shadow: 0 1px 4px rgba(0,0,0,0.06);
      border-left: 3px solid #4caf50;
    }
    .section-heading {
      font-size: 16px;
      font-weight: 700;
      color: #1b3a1b;
      margin: 0 0 10px;
    }
    .section-body {
      font-size: 14px;
      line-height: 1.7;
      color: #555;
      margin: 0;
      white-space: pre-line;
    }

    /* Back link */
    .info-back { margin-top: 32px; }
    .back-btn {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      color: #2e7d32;
      font-size: 14px;
      font-weight: 600;
      text-decoration: none;
      transition: gap 0.18s;
      mat-icon { font-size: 18px; }
      &:hover { gap: 10px; }
    }

    @media (max-width: 600px) {
      .info-title { font-size: 26px; }
      .info-hero { padding: 40px 20px 36px; }
      .info-body { padding: 28px 16px 40px; }
      .info-section { padding: 22px 20px; }
    }
  `],
})
export class InfoPageComponent implements OnInit {
  private route = inject(ActivatedRoute);
  page: PageDef | null = null;

  ngOnInit() {
    const slug = this.route.snapshot.data['slug'] as string;
    this.page = PAGE_MAP[slug] ?? null;
  }
}
