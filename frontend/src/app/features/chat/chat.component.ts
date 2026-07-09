import {
  Component, signal, ViewChild, ElementRef,
  AfterViewChecked, AfterViewInit, OnDestroy, NgZone, inject, OnInit, effect,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { ActivatedRoute } from '@angular/router';
import { AuthService } from '../../core/services/auth.service';
import { environment } from '../../../environments/environment';

// ── Markdown helpers ──────────────────────────────────────────────────────────

function mdToHtml(text: string): string {
  const lines = text.split('\n');
  const out: string[] = [];
  let inList = false;

  for (const raw of lines) {
    const line = raw.trimEnd();
    if (/^#{1,3}\s/.test(line)) {
      if (inList) { out.push('</ul>'); inList = false; }
      out.push(`<p class="md-heading">${inline(line.replace(/^#{1,3}\s/, ''))}</p>`);
      continue;
    }
    if (/^[-*]\s/.test(line)) {
      if (!inList) { out.push('<ul class="md-list">'); inList = true; }
      out.push(`<li>${inline(line.slice(2))}</li>`);
      continue;
    }
    if (!line.trim()) {
      if (inList) { out.push('</ul>'); inList = false; }
      continue;
    }
    if (inList) { out.push('</ul>'); inList = false; }
    out.push(`<p class="md-p">${inline(line)}</p>`);
  }

  if (inList) out.push('</ul>');
  return out.join('');
}

function inline(text: string): string {
  return text
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>');
}

// ── Types ─────────────────────────────────────────────────────────────────────

interface ChatMsg {
  id: number;
  dbId?: string;
  role: 'user' | 'assistant';
  content: string;
  streaming?: boolean;
  error?: boolean;
  feedback?: 1 | -1;
  retryText?: string;
}

interface ExpiringItem { name: string; days: number; }

const MOODS = [
  { emoji: '😴', label: 'Tired',    color: '#e3f2fd', border: '#90caf9', text: '#1565c0',
    query: 'I feel tired and low on energy. What foods from my pantry can naturally boost my energy?' },
  { emoji: '😤', label: 'Stressed', color: '#f3e5f5', border: '#ce93d8', text: '#6a1b9a',
    query: 'I am feeling stressed and overwhelmed. What foods help calm the nervous system and reduce stress?' },
  { emoji: '🤒', label: 'Unwell',   color: '#fce4ec', border: '#f48fb1', text: '#880e4f',
    query: 'I am not feeling well today. What gentle, nourishing foods should I eat to recover?' },
  { emoji: '💪', label: 'Active',   color: '#fff3e0', border: '#ffb74d', text: '#e65100',
    query: 'I just finished a workout. What should I eat to recover and rebuild muscle with what I have in my pantry?' },
  { emoji: '😊', label: 'Happy',    color: '#e8f5e9', border: '#81c784', text: '#1b5e20',
    query: 'I am feeling great today! What foods can help me maintain this positive energy and good mood?' },
];

const STATIC_SUGGESTIONS = [
  'What foods boost energy?',
  'Best foods for better sleep?',
  'Anti-inflammatory diet tips',
  'High-protein organic foods',
];

// ── Component ─────────────────────────────────────────────────────────────────

@Component({
  selector: 'app-chat',
  standalone: true,
  imports: [CommonModule, FormsModule, MatIconModule],
  template: `
<div class="chat-page">

  <canvas class="neural-canvas" #neuralCanvas></canvas>

  <!-- ── Header ── -->
  <div class="chat-header">
    <div class="chat-header-left">
      <div class="chat-avatar">
        <canvas class="orb-canvas" #orbCanvas width="40" height="40"></canvas>
      </div>
      <div>
        <div class="chat-name">Organic Care AI</div>
        <div class="chat-status">
          @if (isStreaming()) {
            <span class="dot typing-dot"></span> typing…
          } @else {
            <span class="dot online-dot"></span> Online · Personalised to you
          }
        </div>
      </div>
    </div>
    <div class="chat-header-right">
      <button class="hdr-btn" (click)="clearHistory()" title="New conversation">
        <mat-icon>edit_note</mat-icon>
      </button>
    </div>
  </div>

  <!-- ── Messages ── -->
  <div class="chat-messages" #messagesEl>

    @if (isLoadingHistory() && messages().length === 0) {
      <div class="sk-chat-wrap">
        @for (s of [1,2,3]; track s) {
          <div class="sk-chat-row" [class.sk-user-row]="s % 2 === 0">
            @if (s % 2 !== 0) { <div class="sk-avatar"></div> }
            <div class="sk-bubble-col" [class.sk-user-col]="s % 2 === 0">
              <div class="sk-bubble" [style.width]="s === 1 ? '72%' : s === 2 ? '52%' : '64%'"></div>
              @if (s === 1) { <div class="sk-bubble" style="width:48%;margin-top:6px"></div> }
            </div>
          </div>
        }
      </div>
    }

    @if (!isLoadingHistory() && messages().length === 0) {
      <div class="welcome-state">

        <!-- Expiry alert (shown first if items expiring) -->
        @if (expiringItems().length > 0) {
          <div class="expiry-banner" (click)="sendExpiry()">
            <div class="expiry-icon-wrap">⏰</div>
            <div class="expiry-body">
              <div class="expiry-title">
                <strong>{{ expiringItems()[0].name }}</strong>
                expires in {{ expiringItems()[0].days }} day{{ expiringItems()[0].days === 1 ? '' : 's' }}
                @if (expiringItems().length > 1) {
                  <span class="expiry-more">+{{ expiringItems().length - 1 }} more</span>
                }
              </div>
              <div class="expiry-sub">Tap to get a quick recipe before it spoils</div>
            </div>
            <mat-icon style="color:#e65100;font-size:18px;flex-shrink:0">chevron_right</mat-icon>
          </div>
        }

        <!-- Greeting -->
        <div class="greeting-block">
          <div class="greeting-top">
            <span class="greeting-icon">{{ timeIcon }}</span>
            <div>
              <div class="greeting-title">{{ greeting }}{{ firstName ? ', ' + firstName : '' }}!</div>
              @if (pantryCount() > 0) {
                <div class="greeting-sub">{{ pantryCount() }} pantry items · ready to cook</div>
              } @else {
                <div class="greeting-sub">Your personal nutrition assistant</div>
              }
            </div>
          </div>
        </div>

        <!-- Cook Now -->
        <button class="cook-now-btn" (click)="cookNow()">
          <div class="cook-now-icon">🍳</div>
          <div class="cook-now-body">
            <div class="cook-now-title">Cook Now</div>
            <div class="cook-now-sub">What can I make with my pantry right now?</div>
          </div>
          <mat-icon style="color:rgba(255,255,255,0.7);font-size:20px">arrow_forward</mat-icon>
        </button>

        <!-- Mood section -->
        <div class="mood-section">
          <div class="mood-label">How are you feeling today?</div>
          <div class="mood-row">
            @for (mood of moods; track mood.label) {
              <button class="mood-pill"
                [style.background]="mood.color"
                [style.border-color]="mood.border"
                [style.color]="mood.text"
                (click)="sendMood(mood.query)">
                <span class="mood-emoji">{{ mood.emoji }}</span>
                <span class="mood-label-text">{{ mood.label }}</span>
              </button>
            }
          </div>
        </div>

        <!-- Smart suggestions -->
        <div class="suggestions-section">
          <div class="suggestions-label">Or ask anything</div>
          <div class="suggestions">
            @for (s of suggestions(); track s) {
              <button class="suggestion-chip" (click)="sendSuggestion(s)">{{ s }}</button>
            }
          </div>
        </div>

      </div>
    }

    <!-- Messages -->
    @for (msg of messages(); track msg.id) {
      <div class="msg-row" [class.user-row]="msg.role === 'user'">
        @if (msg.role === 'assistant') {
          <div class="msg-avatar-sm"><div class="orb-mini"></div></div>
        }
        <div class="msg-col">
          <div class="bubble"
            [class.user-bubble]="msg.role === 'user'"
            [class.ai-bubble]="msg.role === 'assistant'"
            [class.error-bubble]="msg.error">
            @if (msg.streaming && !msg.content) {
              <span class="typing-dots"><span></span><span></span><span></span></span>
            } @else if (msg.role === 'assistant') {
              <div class="md-body" [innerHTML]="renderMd(msg.content)"></div>
              @if (msg.streaming) { <span class="cursor">▋</span> }
            } @else {
              {{ msg.content }}
            }
          </div>

          @if (msg.role === 'assistant' && !msg.streaming) {
            @if (!msg.error && msg.dbId) {
              <div class="msg-feedback">
                <button class="fb-btn" [class.active-up]="msg.feedback === 1"
                  (click)="submitFeedback(msg, 1)" title="Helpful">
                  <mat-icon>thumb_up_alt</mat-icon>
                </button>
                <button class="fb-btn" [class.active-down]="msg.feedback === -1"
                  (click)="submitFeedback(msg, -1)" title="Not helpful">
                  <mat-icon>thumb_down_alt</mat-icon>
                </button>
              </div>
            }
            @if (msg.error && msg.retryText) {
              <button class="retry-btn" (click)="retry(msg.retryText!)">
                <mat-icon>refresh</mat-icon> Retry
              </button>
            }
          }
        </div>
      </div>
    }
  </div>

  <!-- ── Input bar ── -->
  <div class="chat-input-row">
    @if (hasVoice) {
      <button class="mic-btn" [class.recording]="isRecording()"
        (click)="toggleVoice()"
        [title]="isRecording() ? 'Stop recording' : 'Voice input'">
        <mat-icon>{{ isRecording() ? 'mic' : 'mic_none' }}</mat-icon>
      </button>
    }
    <input
      #inputEl
      class="chat-input"
      type="text"
      [placeholder]="isRecording() ? 'Listening…' : 'Ask about nutrition, recipes, wellness…'"
      [(ngModel)]="inputText"
      (keyup.enter)="send()"
      [disabled]="isStreaming()"
      maxlength="1000">
    <button class="send-btn" (click)="send()" [disabled]="!inputText.trim() || isStreaming()">
      <mat-icon>{{ isStreaming() ? 'hourglass_top' : 'send' }}</mat-icon>
    </button>
  </div>

</div>
  `,
  styles: [`
    /* ── Page ───────────────────────────────────────── */
    .chat-page {
      display: flex; flex-direction: column;
      height: calc(100vh - 64px);
      background: #f4f7f4;
      position: relative; overflow: hidden;
    }
    .neural-canvas {
      position: absolute; inset: 0;
      width: 100%; height: 100%;
      pointer-events: none; z-index: 0; opacity: 0.55;
    }
    .chat-header, .chat-messages, .chat-input-row {
      position: relative; z-index: 1;
    }

    /* ── Header ─────────────────────────────────────── */
    .chat-header {
      display: flex; align-items: center; justify-content: space-between;
      padding: 14px 18px;
      background: linear-gradient(135deg, #1b5e20, #2e7d32);
      flex-shrink: 0;
      box-shadow: 0 2px 8px rgba(0,0,0,0.15);
    }
    .chat-header-left { display: flex; align-items: center; gap: 11px; }
    .chat-header-right { display: flex; gap: 4px; }
    .chat-avatar {
      width: 40px; height: 40px; border-radius: 50%;
      background: rgba(255,255,255,0.18); border: 1.5px solid rgba(255,255,255,0.25);
      display: flex; align-items: center; justify-content: center;
      overflow: hidden;
    }
    .chat-name   { font-size: 15px; font-weight: 700; color: #fff; letter-spacing: 0.1px; }
    .chat-status {
      font-size: 11px; color: rgba(255,255,255,0.72);
      display: flex; align-items: center; gap: 5px; margin-top: 1px;
    }
    .dot        { width: 6px; height: 6px; border-radius: 50%; flex-shrink: 0; }
    .online-dot { background: #a5d6a7; }
    .typing-dot { background: #fff176; animation: pulse 1s ease-in-out infinite; }
    .hdr-btn {
      width: 34px; height: 34px; border-radius: 50%;
      background: rgba(255,255,255,0.13); border: none; cursor: pointer;
      display: flex; align-items: center; justify-content: center;
      mat-icon { color: #fff; font-size: 20px; }
      &:hover { background: rgba(255,255,255,0.25); }
    }

    /* ── Messages area ───────────────────────────────── */
    .chat-messages {
      flex: 1; overflow-y: auto;
      padding: 16px 14px 12px;
      display: flex; flex-direction: column; gap: 12px;
      scrollbar-width: thin; scrollbar-color: #ddd transparent;
    }

    /* ── Welcome state ───────────────────────────────── */
    .welcome-state {
      display: flex; flex-direction: column; gap: 14px;
      padding: 4px 0 8px;
    }

    /* Expiry banner */
    .expiry-banner {
      display: flex; align-items: center; gap: 10px;
      background: linear-gradient(135deg, #fff8e1, #fff3e0);
      border: 1.5px solid #ffcc02;
      border-radius: 14px; padding: 12px 14px;
      cursor: pointer; transition: transform 0.15s, box-shadow 0.15s;
      box-shadow: 0 2px 8px rgba(255,152,0,0.12);
      &:hover { transform: translateY(-1px); box-shadow: 0 4px 14px rgba(255,152,0,0.18); }
    }
    .expiry-icon-wrap {
      font-size: 22px; flex-shrink: 0; line-height: 1;
    }
    .expiry-body { flex: 1; min-width: 0; }
    .expiry-title { font-size: 13px; font-weight: 600; color: #bf360c; line-height: 1.4; }
    .expiry-more {
      display: inline-block; margin-left: 6px;
      background: #ff8f00; color: #fff;
      font-size: 10px; font-weight: 700; padding: 1px 6px; border-radius: 8px;
    }
    .expiry-sub { font-size: 11px; color: #e65100; margin-top: 2px; }

    /* Greeting block */
    .greeting-block {
      background: #fff; border-radius: 16px; padding: 16px;
      box-shadow: 0 1px 4px rgba(0,0,0,0.06);
    }
    .greeting-top { display: flex; align-items: center; gap: 12px; }
    .greeting-icon { font-size: 32px; line-height: 1; flex-shrink: 0; }
    .greeting-title { font-size: 19px; font-weight: 800; color: #1a2a1a; }
    .greeting-sub   { font-size: 12px; color: #6b7c6b; margin-top: 3px; }

    /* Cook Now button */
    .cook-now-btn {
      display: flex; align-items: center; gap: 14px;
      background: linear-gradient(135deg, #2e7d32 0%, #1b5e20 100%);
      border: none; border-radius: 18px; padding: 16px 18px;
      cursor: pointer; width: 100%; text-align: left;
      box-shadow: 0 4px 16px rgba(46,125,50,0.3);
      transition: transform 0.15s, box-shadow 0.15s;
      &:hover { transform: translateY(-2px); box-shadow: 0 6px 22px rgba(46,125,50,0.38); }
      &:active { transform: translateY(0); }
    }
    .cook-now-icon {
      font-size: 28px; line-height: 1; flex-shrink: 0;
      background: rgba(255,255,255,0.15); border-radius: 12px;
      width: 48px; height: 48px; display: flex; align-items: center; justify-content: center;
    }
    .cook-now-body  { flex: 1; min-width: 0; }
    .cook-now-title { font-size: 16px; font-weight: 800; color: #fff; }
    .cook-now-sub   { font-size: 12px; color: rgba(255,255,255,0.72); margin-top: 2px; }

    /* Mood section */
    .mood-section { }
    .mood-label {
      font-size: 12px; font-weight: 700; color: #6b7c6b;
      text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 10px;
    }
    .mood-row {
      display: flex; gap: 8px; overflow-x: auto; padding-bottom: 4px;
      scrollbar-width: none;
    }
    .mood-pill {
      display: flex; flex-direction: column; align-items: center; gap: 5px;
      border-radius: 14px; border: 1.5px solid;
      padding: 10px 14px; cursor: pointer; flex-shrink: 0;
      transition: transform 0.15s, box-shadow 0.15s;
      font-family: inherit; min-width: 64px;
      &:hover { transform: translateY(-2px); box-shadow: 0 4px 12px rgba(0,0,0,0.1); }
      &:active { transform: translateY(0); }
    }
    .mood-emoji      { font-size: 20px; line-height: 1; }
    .mood-label-text { font-size: 11px; font-weight: 700; white-space: nowrap; }

    /* Suggestions */
    .suggestions-section { }
    .suggestions-label {
      font-size: 12px; font-weight: 700; color: #6b7c6b;
      text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 10px;
    }
    .suggestions { display: flex; flex-wrap: wrap; gap: 8px; }
    .suggestion-chip {
      border: 1.5px solid #d4ebd4; background: #fff; color: #2e7d32;
      border-radius: 20px; padding: 8px 14px; font-size: 13px; font-weight: 600;
      cursor: pointer; font-family: inherit; transition: all 0.15s;
      &:hover { background: #e8f5e9; border-color: #4caf50; transform: translateY(-1px); }
    }

    /* ── Message rows ────────────────────────────────── */
    .msg-row { display: flex; align-items: flex-start; gap: 8px; }
    .user-row { flex-direction: row-reverse; }
    .msg-col  { display: flex; flex-direction: column; max-width: 78%; gap: 5px; }
    .user-row .msg-col { align-items: flex-end; }

    .msg-avatar-sm {
      width: 30px; height: 30px; border-radius: 50%;
      border: 1.5px solid #c8e6c9;
      flex-shrink: 0; margin-top: 2px;
      display: flex; align-items: center; justify-content: center;
      overflow: hidden; background: #1b5e20;
    }
    .orb-mini {
      width: 28px; height: 28px; border-radius: 50%; flex-shrink: 0;
      background: radial-gradient(circle at 38% 32%, #b2dfb2 0%, #388e3c 45%, #1b5e20 100%);
      animation: orbBreath 3s ease-in-out infinite;
    }
    @keyframes orbBreath {
      0%,100% { box-shadow: 0 0 6px rgba(76,175,80,0.3) inset; }
      50%      { box-shadow: 0 0 14px rgba(120,230,130,0.55) inset; }
    }
    .orb-canvas { display: block; border-radius: 50%; }

    /* Bubbles */
    .bubble {
      padding: 11px 15px; border-radius: 20px;
      font-size: 14px; line-height: 1.55; word-break: break-word;
      font-family: inherit;
    }
    .ai-bubble {
      background: #fff; color: #1a2a1a; border-bottom-left-radius: 4px;
      box-shadow: 0 1px 4px rgba(0,0,0,0.08);
    }
    .user-bubble {
      background: linear-gradient(135deg, #2e7d32, #388e3c);
      color: #fff; border-bottom-right-radius: 4px;
    }
    .error-bubble { background: #fdecea; color: #c62828; }

    /* Typing dots */
    .typing-dots { display: inline-flex; gap: 4px; align-items: center; padding: 4px 0; }
    .typing-dots span {
      width: 8px; height: 8px; background: #9e9e9e; border-radius: 50%;
      animation: bounce 1.2s ease-in-out infinite;
      &:nth-child(2) { animation-delay: 0.2s; }
      &:nth-child(3) { animation-delay: 0.4s; }
    }
    .cursor { animation: blink 0.7s step-end infinite; opacity: 1; }

    /* Markdown */
    .md-body { font-size: 14px; line-height: 1.65; color: #1a2a1a; }
    ::ng-deep .ai-bubble .md-heading {
      font-size: 14px; font-weight: 700; color: #1b5e20; margin: 10px 0 4px; padding: 0;
    }
    ::ng-deep .ai-bubble .md-heading:first-child { margin-top: 2px; }
    ::ng-deep .ai-bubble .md-list { margin: 4px 0 8px 0; padding-left: 18px; }
    ::ng-deep .ai-bubble .md-list li { margin-bottom: 5px; font-size: 13.5px; line-height: 1.55; }
    ::ng-deep .ai-bubble .md-p { margin: 0 0 7px; font-size: 13.5px; line-height: 1.6; }
    ::ng-deep .ai-bubble .md-p:last-child { margin-bottom: 0; }
    ::ng-deep .ai-bubble strong { color: #1b5e20; font-weight: 700; }

    /* Feedback */
    .msg-feedback { display: flex; gap: 4px; padding: 2px 0; }
    .fb-btn {
      width: 28px; height: 28px; border-radius: 50%; border: 1.5px solid #e0e0e0;
      background: #fff; cursor: pointer; display: flex; align-items: center; justify-content: center;
      transition: all 0.15s;
      mat-icon { font-size: 15px; color: #9e9e9e; }
      &:hover { border-color: #bdbdbd; }
    }
    .active-up   { border-color: #4caf50 !important; background: #e8f5e9 !important; mat-icon { color: #2e7d32; } }
    .active-down { border-color: #ef9a9a !important; background: #ffebee !important; mat-icon { color: #c62828; } }

    /* Retry */
    .retry-btn {
      display: inline-flex; align-items: center; gap: 4px;
      background: none; border: 1.5px solid #c62828; color: #c62828;
      border-radius: 14px; padding: 5px 12px;
      font-size: 12px; font-weight: 600; cursor: pointer; font-family: inherit;
      mat-icon { font-size: 15px; }
      &:hover { background: #ffebee; }
    }

    /* ── Input bar ───────────────────────────────────── */
    .chat-input-row {
      display: flex; align-items: center; gap: 10px;
      padding: 12px 14px; border-top: 1px solid #e8f0e8;
      background: #fff; flex-shrink: 0;
    }
    .mic-btn {
      width: 40px; height: 40px; border-radius: 50%; border: 1.5px solid #e0e8e0;
      background: #fff; cursor: pointer; flex-shrink: 0;
      display: flex; align-items: center; justify-content: center; transition: all 0.18s;
      mat-icon { font-size: 20px; color: #757575; }
      &:hover { border-color: #4caf50; mat-icon { color: #2e7d32; } }
    }
    .recording {
      border-color: #e53935 !important; background: #ffebee !important;
      animation: pulse-red 1s ease-in-out infinite;
      mat-icon { color: #e53935 !important; }
    }
    .chat-input {
      flex: 1; border: 1.5px solid #e0e8e0; border-radius: 24px;
      padding: 11px 18px; font-size: 14px; outline: none;
      color: #1a2a1a; font-family: inherit; background: #f9fbf9;
      transition: border-color 0.15s;
      &::placeholder { color: #b0b0b0; }
      &:focus { border-color: #4caf50; background: #fff; }
      &:disabled { background: #f5f5f5; }
    }
    .send-btn {
      width: 44px; height: 44px; border-radius: 50%; border: none;
      background: linear-gradient(135deg, #2e7d32, #1b5e20);
      cursor: pointer; flex-shrink: 0;
      display: flex; align-items: center; justify-content: center; transition: all 0.15s;
      box-shadow: 0 2px 8px rgba(46,125,50,0.3);
      mat-icon { color: #fff; font-size: 22px; }
      &:hover:not(:disabled) { transform: scale(1.05); box-shadow: 0 4px 12px rgba(46,125,50,0.4); }
      &:disabled { background: #c8c8c8; cursor: not-allowed; box-shadow: none; }
    }

    /* ── Skeleton history ────────────────────────────── */
    .sk-chat-wrap { display: flex; flex-direction: column; gap: 16px; padding: 8px 0; }
    .sk-chat-row  { display: flex; align-items: flex-start; gap: 8px; }
    .sk-user-row  { flex-direction: row-reverse; }
    .sk-avatar {
      width: 30px; height: 30px; border-radius: 50%;
      background: linear-gradient(90deg,#e8f0e8 25%,#d4e4d4 50%,#e8f0e8 75%);
      background-size: 200% 100%; animation: shimmer 1.4s infinite; flex-shrink: 0;
    }
    .sk-bubble-col { display: flex; flex-direction: column; max-width: 78%; }
    .sk-user-col   { align-items: flex-end; }
    .sk-bubble {
      height: 44px; border-radius: 20px;
      background: linear-gradient(90deg,#f0f0f0 25%,#e4e4e4 50%,#f0f0f0 75%);
      background-size: 200% 100%; animation: shimmer 1.4s infinite;
    }
    .sk-user-row .sk-bubble {
      background: linear-gradient(90deg,#c8dfc8 25%,#b8d0b8 50%,#c8dfc8 75%);
      background-size: 200% 100%;
    }

    /* ── Keyframes ───────────────────────────────────── */
    @keyframes shimmer   { 0% { background-position: 200% 0; } 100% { background-position: -200% 0; } }
    @keyframes pulse     { 0%,100% { opacity: 1; } 50% { opacity: 0.35; } }
    @keyframes pulse-red { 0%,100% { box-shadow: 0 0 0 0 rgba(229,57,53,0.4); } 50% { box-shadow: 0 0 0 6px rgba(229,57,53,0); } }
    @keyframes bounce    { 0%,80%,100% { transform: scale(0.65); opacity: 0.45; } 40% { transform: scale(1); opacity: 1; } }
    @keyframes blink     { 50% { opacity: 0; } }

    /* ── Desktop ─────────────────────────────────────── */
    @media (min-width: 768px) {
      .chat-page { height: 100vh; }
      .chat-messages { padding: 20px 20px 14px; }
      .msg-col { max-width: 68%; }
      .chat-input-row { padding: 14px 20px; }
    }
  `],
})
export class ChatComponent implements AfterViewChecked, AfterViewInit, OnInit, OnDestroy {
  @ViewChild('messagesEl')   private messagesEl?:    ElementRef<HTMLDivElement>;
  @ViewChild('neuralCanvas') private neuralCanvas!:  ElementRef<HTMLCanvasElement>;
  @ViewChild('orbCanvas')    private orbCanvas!:     ElementRef<HTMLCanvasElement>;

  auth              = inject(AuthService);
  private zone      = inject(NgZone);
  private sanitizer = inject(DomSanitizer);
  private route     = inject(ActivatedRoute);
  private readonly apiUrl = environment.apiUrl;

  // ── Neural network state ─────────────────────────────────────────────────
  private nnCtx!:    CanvasRenderingContext2D;
  private nnFrame =  0;
  private nnNodes:   Array<{x:number;y:number;vx:number;vy:number;glow:number}> = [];
  private nnPulses:  Array<{from:number;to:number;t:number;speed:number}> = [];
  private nnResize!: () => void;

  // ── Orb state ─────────────────────────────────────────────────────────────
  private orbCtx!:     CanvasRenderingContext2D;
  private orbFrame =   0;
  private orbPhase =   0;
  private orbRipples:  Array<{r:number;alpha:number;speed:number}> = [];

  constructor() {
    effect(() => {
      if (this.isStreaming()) {
        this.zone.runOutsideAngular(() => this.nnWave());
      }
    });
    effect(() => {
      if (this.isRecording()) {
        this.zone.runOutsideAngular(() => this.orbRipple());
      }
    });
  }

  readonly moods = MOODS;

  messages       = signal<ChatMsg[]>([]);
  isStreaming    = signal(false);
  isRecording    = signal(false);
  isLoadingHistory = signal(false);
  suggestions    = signal<string[]>(STATIC_SUGGESTIONS);
  expiringItems  = signal<ExpiringItem[]>([]);
  pantryCount    = signal(0);

  inputText = '';
  readonly hasVoice = !!(
    (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
  );

  private shouldScroll = false;
  private recognition: any = null;

  // ── Greeting helpers ─────────────────────────────────────────────────────────

  get firstName(): string {
    const name = this.auth.currentUser()?.full_name ?? '';
    return name.split(' ')[0] ?? '';
  }

  get greeting(): string {
    const h = new Date().getHours();
    if (h < 12) return 'Good morning';
    if (h < 17) return 'Good afternoon';
    return 'Good evening';
  }

  get timeIcon(): string {
    const h = new Date().getHours();
    if (h >= 5 && h < 12) return '🌅';
    if (h >= 12 && h < 18) return '☀️';
    return '🌙';
  }

  // ── Lifecycle ────────────────────────────────────────────────────────────────

  private readonly CHAT_KEY = 'organic_care_chat_v1';

  ngOnInit() {
    const q = this.route.snapshot.queryParams['q'];
    if (q) {
      this.inputText = q;
      this.loadSuggestions();
      if (this.auth.isLoggedIn()) { this.loadPantryData(); }
      setTimeout(() => this.send(), 150);
    } else {
      this.restoreFromCache();
      this.loadSuggestions();
      if (this.auth.isLoggedIn()) {
        this.loadHistory();
        this.loadPantryData();
      }
    }
  }

  ngAfterViewInit() {
    this.zone.runOutsideAngular(() => {
      // neural network
      const nnCanvas = this.neuralCanvas?.nativeElement;
      if (nnCanvas) {
        const ctx = nnCanvas.getContext('2d');
        if (ctx) {
          this.nnCtx = ctx;
          this.nnResize = () => {
            nnCanvas.width  = nnCanvas.clientWidth;
            nnCanvas.height = nnCanvas.clientHeight;
            this.nnBuildNodes();
          };
          this.nnResize();
          window.addEventListener('resize', this.nnResize);
          this.nnLoop();
        }
      }
      // AI orb
      const orbEl = this.orbCanvas?.nativeElement;
      if (orbEl) { this.orbInit(orbEl); }
    });
  }

  ngOnDestroy() {
    cancelAnimationFrame(this.nnFrame);
    cancelAnimationFrame(this.orbFrame);
    window.removeEventListener('resize', this.nnResize);
  }

  private restoreFromCache() {
    try {
      const raw = localStorage.getItem(this.CHAT_KEY);
      if (!raw) return;
      const msgs: ChatMsg[] = JSON.parse(raw);
      if (Array.isArray(msgs) && msgs.length > 0) {
        this.zone.run(() => { this.messages.set(msgs); this.shouldScroll = true; });
      }
    } catch {}
  }

  private saveToCache() {
    try {
      const toSave = this.messages()
        .filter(m => !m.streaming && !m.error)
        .slice(-60)
        .map(({ id, dbId, role, content, feedback }) => ({ id, dbId, role, content, feedback }));
      localStorage.setItem(this.CHAT_KEY, JSON.stringify(toSave));
    } catch {}
  }

  ngAfterViewChecked() {
    if (this.shouldScroll && this.messagesEl) {
      const el = this.messagesEl.nativeElement;
      el.scrollTop = el.scrollHeight;
      this.shouldScroll = false;
    }
  }

  // ── Data loading ─────────────────────────────────────────────────────────────

  private async loadHistory() {
    const token = this.auth.getAccessToken();
    if (!token) return;
    this.isLoadingHistory.set(true);
    try {
      const res = await fetch(`${this.apiUrl}/chat/history`, {
        headers: { 'Authorization': `Bearer ${token}` },
      });
      if (!res.ok) return;
      const data = await res.json();
      const msgs: ChatMsg[] = (data.messages as any[]).map((m, i) => ({
        id: i, dbId: m.id, role: m.role as 'user' | 'assistant', content: m.content,
      }));
      this.zone.run(() => { this.messages.set(msgs); this.shouldScroll = true; });
      this.saveToCache();
    } catch {} finally {
      this.zone.run(() => this.isLoadingHistory.set(false));
    }
  }

  private async loadSuggestions() {
    try {
      const token = this.auth.getAccessToken();
      const headers: Record<string, string> = {};
      if (token) headers['Authorization'] = `Bearer ${token}`;
      const res = await fetch(`${this.apiUrl}/chat/suggestions`, { headers });
      if (!res.ok) return;
      const data = await res.json();
      this.zone.run(() => this.suggestions.set(data.suggestions));
    } catch {}
  }

  private async loadPantryData() {
    const token = this.auth.getAccessToken();
    if (!token) return;
    try {
      const res = await fetch(`${this.apiUrl}/pantry`, {
        headers: { 'Authorization': `Bearer ${token}` },
      });
      if (!res.ok) return;
      const items: any[] = await res.json();
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const expiring: ExpiringItem[] = items
        .filter(item => {
          if (!item.expiry_date) return false;
          const exp = new Date(item.expiry_date);
          const days = Math.round((exp.getTime() - today.getTime()) / 86_400_000);
          return days >= 0 && days <= 7;
        })
        .map(item => ({
          name: item.ingredient_name,
          days: Math.round((new Date(item.expiry_date).getTime() - today.getTime()) / 86_400_000),
        }))
        .sort((a, b) => a.days - b.days);

      this.zone.run(() => {
        this.pantryCount.set(items.length);
        this.expiringItems.set(expiring);
      });
    } catch {}
  }

  // ── Quick actions ─────────────────────────────────────────────────────────────

  cookNow() {
    this.inputText = 'What can I cook right now with exactly what I have in my pantry? Give me your top 2 recipe ideas with step-by-step instructions.';
    this.send();
  }

  sendMood(query: string) {
    this.inputText = query;
    this.send();
  }

  sendExpiry() {
    const item = this.expiringItems()[0];
    if (!item) return;
    this.inputText = `I have ${item.name} expiring in ${item.days} day${item.days === 1 ? '' : 's'}. Give me a quick recipe to use it up before it spoils.`;
    this.send();
  }

  // ── History ───────────────────────────────────────────────────────────────────

  async clearHistory() {
    this.messages.set([]);
    localStorage.removeItem(this.CHAT_KEY);
    const token = this.auth.getAccessToken();
    if (!token) return;
    try {
      await fetch(`${this.apiUrl}/chat/history`, {
        method: 'DELETE', headers: { 'Authorization': `Bearer ${token}` },
      });
    } catch {}
  }

  // ── Sending ───────────────────────────────────────────────────────────────────

  sendSuggestion(text: string) { this.inputText = text; this.send(); }
  retry(text: string) { this.messages.update(msgs => msgs.filter(m => !m.error)); this.inputText = text; this.send(); }

  async send() {
    const text = this.inputText.trim();
    if (!text || this.isStreaming()) return;

    const history = this.messages()
      .filter(m => !m.error).slice(-20)
      .map(m => ({ role: m.role, content: m.content.slice(0, 3900) }));

    this.zone.run(() => {
      this.messages.update(m => [...m, { id: Date.now(), role: 'user', content: text }]);
      this.inputText = '';
      this.isStreaming.set(true);
      this.shouldScroll = true;
    });

    const aiId = Date.now() + 1;
    this.zone.run(() => {
      this.messages.update(m => [...m, { id: aiId, role: 'assistant', content: '', streaming: true }]);
      this.shouldScroll = true;
    });

    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      const token = this.auth.getAccessToken();
      if (token) headers['Authorization'] = `Bearer ${token}`;

      const response = await fetch(`${this.apiUrl}/chat/stream`, {
        method: 'POST', headers,
        body: JSON.stringify({ message: text, history }),
      });

      if (!response.ok || !response.body) {
        let msg = 'Server error. Please try again.';
        if (response.status === 401) msg = 'Session expired. Please log in again.';
        else if (response.status >= 500) msg = 'Server error. Please try again in a moment.';
        throw Object.assign(new Error(msg), { isHttp: true });
      }

      const reader  = response.body.getReader();
      const decoder = new TextDecoder();
      let hadError  = false;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const raw = decoder.decode(value, { stream: true });
        for (const line of raw.split('\n')) {
          if (!line.startsWith('data: ')) continue;
          try {
            const data = JSON.parse(line.slice(6));
            if (data.token) {
              this.zone.run(() => {
                this.messages.update(msgs =>
                  msgs.map(m => m.id === aiId ? { ...m, content: m.content + data.token } : m)
                );
                this.shouldScroll = true;
              });
            }
            if (data.error) {
              hadError = true;
              this.zone.run(() => {
                this.messages.update(msgs =>
                  msgs.map(m => m.id === aiId
                    ? { ...m, streaming: false, content: 'AI error. Please try again.', error: true, retryText: text }
                    : m)
                );
              });
            }
            if (data.done && !hadError) {
              const aiMsgId = (data.ai_msg_id as string) || undefined;
              this.zone.run(() => {
                this.messages.update(msgs =>
                  msgs.map(m => m.id === aiId ? { ...m, streaming: false, dbId: aiMsgId } : m)
                );
                this.saveToCache();
              });
            }
          } catch {}
        }
      }
    } catch (e: any) {
      let msg = 'Connection error. Please try again.';
      if (e.isHttp) msg = e.message;
      else if (!navigator.onLine) msg = 'No internet connection. Check your network.';
      this.zone.run(() => {
        this.messages.update(msgs =>
          msgs.map(m => m.id === aiId
            ? { ...m, streaming: false, content: msg, error: true, retryText: text }
            : m)
        );
      });
    } finally {
      this.zone.run(() => { this.isStreaming.set(false); this.shouldScroll = true; });
    }
  }

  // ── Voice ─────────────────────────────────────────────────────────────────────

  toggleVoice() { this.isRecording() ? this.stopVoice() : this.startVoice(); }

  private startVoice() {
    const SpeechRec = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRec) return;
    this.recognition = new SpeechRec();
    this.recognition.continuous = false;
    this.recognition.interimResults = true;
    this.recognition.lang = 'en-US';
    this.recognition.onresult = (event: any) => {
      const transcript = Array.from(event.results as any[]).map((r: any) => r[0].transcript).join('');
      this.zone.run(() => { this.inputText = transcript; });
    };
    this.recognition.onend = () => {
      this.zone.run(() => {
        this.isRecording.set(false);
        if (this.inputText.trim() && !this.isStreaming()) this.send();
      });
    };
    this.recognition.onerror = () => { this.zone.run(() => { this.isRecording.set(false); }); };
    this.recognition.start();
    this.isRecording.set(true);
  }

  private stopVoice() { this.recognition?.stop(); this.isRecording.set(false); }

  // ── Feedback ──────────────────────────────────────────────────────────────────

  async submitFeedback(msg: ChatMsg, rating: 1 | -1) {
    if (!msg.dbId || msg.feedback === rating) return;
    this.messages.update(msgs => msgs.map(m => m.id === msg.id ? { ...m, feedback: rating } : m));
    const token = this.auth.getAccessToken();
    if (!token) return;
    try {
      await fetch(`${this.apiUrl}/chat/feedback`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ message_id: msg.dbId, rating }),
      });
    } catch {}
  }

  // ── Orb engine ───────────────────────────────────────────────────────────────

  private orbInit(canvas: HTMLCanvasElement) {
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    this.orbCtx = ctx;
    this.orbLoop();
  }

  private orbLoop = () => {
    const ctx = this.orbCtx;
    if (!ctx) return;
    const size = ctx.canvas.width;
    const cx = size / 2, cy = size / 2;
    ctx.clearRect(0, 0, size, size);

    const streaming = this.isStreaming();
    this.orbPhase += streaming ? 0.09 : 0.022;

    // outer pulse glow
    const glowR = cx * (1 + Math.sin(this.orbPhase * 0.6) * 0.1);
    const glow  = ctx.createRadialGradient(cx, cy, 0, cx, cy, glowR * 1.5);
    glow.addColorStop(0,   'rgba(120,230,130,0.0)');
    glow.addColorStop(0.5, 'rgba(76,175,80,0.07)');
    glow.addColorStop(1,   'rgba(46,125,50,0.0)');
    ctx.beginPath();
    ctx.arc(cx, cy, glowR * 1.5, 0, Math.PI * 2);
    ctx.fillStyle = glow;
    ctx.fill();

    // morphing body
    ctx.beginPath();
    const pts = 64;
    for (let i = 0; i <= pts; i++) {
      const a = (i / pts) * Math.PI * 2;
      const wobble = streaming
        ? Math.sin(a * 3 + this.orbPhase * 2.2) * 0.13 + Math.sin(a * 5 + this.orbPhase) * 0.07
        : Math.sin(a * 2 + this.orbPhase)        * 0.04 + Math.sin(a * 4 + this.orbPhase * 0.5) * 0.015;
      const r = cx * 0.78 * (1 + wobble);
      const x = cx + Math.cos(a) * r;
      const y = cy + Math.sin(a) * r;
      i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    }
    ctx.closePath();

    // body gradient — brighter/cooler when streaming
    const grad = ctx.createRadialGradient(cx * 0.62, cy * 0.58, 0, cx, cy, cx);
    if (streaming) {
      grad.addColorStop(0,   '#d0fff8');
      grad.addColorStop(0.4, '#4caf50');
      grad.addColorStop(1,   '#1a5c20');
    } else {
      grad.addColorStop(0,   '#b2dfb2');
      grad.addColorStop(0.5, '#388e3c');
      grad.addColorStop(1,   '#1b5e20');
    }
    ctx.fillStyle = grad;
    ctx.fill();

    // specular highlight
    const shine = ctx.createRadialGradient(cx * 0.52, cy * 0.42, 0, cx * 0.58, cy * 0.48, cx * 0.38);
    shine.addColorStop(0, 'rgba(255,255,255,0.5)');
    shine.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = shine;
    ctx.fill();

    // ripples
    this.orbRipples = this.orbRipples.filter(rp => rp.alpha > 0.02);
    for (const rp of this.orbRipples) {
      ctx.beginPath();
      ctx.arc(cx, cy, rp.r, 0, Math.PI * 2);
      ctx.strokeStyle = `rgba(160,255,170,${rp.alpha})`;
      ctx.lineWidth = 1.5;
      ctx.stroke();
      rp.r     += rp.speed;
      rp.alpha *= 0.91;
    }

    this.orbFrame = requestAnimationFrame(this.orbLoop);
  };

  private orbRipple() {
    this.orbRipples.push({ r: 17, alpha: 0.85, speed: 0.9 });
    setTimeout(() => this.orbRipples.push({ r: 14, alpha: 0.55, speed: 0.7 }), 120);
  }

  // ── Neural network engine ─────────────────────────────────────────────────────

  private nnBuildNodes() {
    const { width: w, height: h } = this.nnCtx.canvas;
    const count = Math.min(60, Math.floor(w * h / 10000));
    this.nnNodes = Array.from({ length: count }, () => ({
      x: Math.random() * w, y: Math.random() * h,
      vx: (Math.random() - 0.5) * 0.35,
      vy: (Math.random() - 0.5) * 0.35,
      glow: 0,
    }));
    this.nnPulses = [];
  }

  private nnLoop = () => {
    const ctx = this.nnCtx;
    if (!ctx) return;
    const { width: w, height: h } = ctx.canvas;
    ctx.clearRect(0, 0, w, h);

    const nodes = this.nnNodes;
    const MAX_D = 140;

    // drift nodes
    for (const n of nodes) {
      n.x += n.vx; n.y += n.vy;
      if (n.x < 0 || n.x > w) n.vx *= -1;
      if (n.y < 0 || n.y > h) n.vy *= -1;
      n.glow = Math.max(0, n.glow - 0.016);
    }

    // connections
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const dx = nodes[i].x - nodes[j].x;
        const dy = nodes[i].y - nodes[j].y;
        const d  = Math.sqrt(dx * dx + dy * dy);
        if (d < MAX_D) {
          const g = Math.max(nodes[i].glow, nodes[j].glow);
          ctx.strokeStyle = `rgba(100,200,110,${(1 - d / MAX_D) * (0.1 + g * 0.3)})`;
          ctx.lineWidth   = 0.5 + g * 1.2;
          ctx.beginPath();
          ctx.moveTo(nodes[i].x, nodes[i].y);
          ctx.lineTo(nodes[j].x, nodes[j].y);
          ctx.stroke();
        }
      }
    }

    // pulses
    this.nnPulses = this.nnPulses.filter(p => p.t < 1);
    for (const p of this.nnPulses) {
      p.t = Math.min(1, p.t + p.speed);
      const a = nodes[p.from], b = nodes[p.to];
      if (!a || !b) continue;
      const px = a.x + (b.x - a.x) * p.t;
      const py = a.y + (b.y - a.y) * p.t;
      const alpha = Math.sin(p.t * Math.PI);
      // glow halo
      ctx.beginPath();
      ctx.arc(px, py, 7, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(120,230,130,${alpha * 0.12})`;
      ctx.fill();
      // bright core
      ctx.beginPath();
      ctx.arc(px, py, 2.5, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(180,255,190,${alpha * 0.95})`;
      ctx.fill();
      if (p.t > 0.85) b.glow = Math.min(1, b.glow + 0.45);
    }

    // idle random pulse
    if (Math.random() < 0.04) this.nnFire();

    // nodes
    for (const n of nodes) {
      const r = 1.8 + n.glow * 2.5;
      if (n.glow > 0.15) {
        ctx.beginPath();
        ctx.arc(n.x, n.y, r * 4, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(100,200,110,${n.glow * 0.07})`;
        ctx.fill();
      }
      ctx.beginPath();
      ctx.arc(n.x, n.y, r, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(100,200,110,${0.3 + n.glow * 0.6})`;
      ctx.fill();
    }

    this.nnFrame = requestAnimationFrame(this.nnLoop);
  };

  private nnFire(fromIdx?: number) {
    const nodes = this.nnNodes;
    if (nodes.length < 2) return;
    const from = fromIdx ?? Math.floor(Math.random() * nodes.length);
    const near = nodes
      .map((n, i) => ({ i, d: Math.hypot(n.x - nodes[from].x, n.y - nodes[from].y) }))
      .filter(c => c.i !== from && c.d < 140)
      .sort((a, b) => a.d - b.d)
      .slice(0, 4);
    if (!near.length) return;
    const to = near[Math.floor(Math.random() * near.length)].i;
    this.nnPulses.push({ from, to, t: 0, speed: 0.011 + Math.random() * 0.009 });
  }

  private nnWave() {
    for (let i = 0; i < 12; i++) {
      setTimeout(() => {
        const from = Math.floor(Math.random() * this.nnNodes.length);
        this.nnNodes[from].glow = 1;
        this.nnFire(from);
        this.nnFire(from);
        this.nnFire(from);
      }, i * 60);
    }
  }

  // ── Rendering ─────────────────────────────────────────────────────────────────

  renderMd(text: string): SafeHtml {
    return this.sanitizer.bypassSecurityTrustHtml(mdToHtml(text));
  }
}
