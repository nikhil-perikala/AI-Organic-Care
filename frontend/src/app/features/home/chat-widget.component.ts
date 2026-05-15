import {
  Component, signal, ViewChild, ElementRef,
  AfterViewChecked, NgZone, inject,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { AuthService } from '../../core/services/auth.service';
import { environment } from '../../../environments/environment';

// ── Markdown helpers ─────────────────────────────────────────────────────────

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

// ── Types ────────────────────────────────────────────────────────────────────

interface ChatMsg {
  id: number;
  dbId?: string;
  role: 'user' | 'assistant';
  content: string;
  streaming?: boolean;
  error?: boolean;
  feedback?: 1 | -1;
  fromHistory?: boolean;
  retryText?: string;
}

const STATIC_SUGGESTIONS = [
  'What foods boost energy?',
  'Best foods for better sleep?',
  'Anti-inflammatory diet tips',
  'High-protein organic foods',
];

// ── Component ────────────────────────────────────────────────────────────────

@Component({
  selector: 'app-chat-widget',
  standalone: true,
  imports: [CommonModule, FormsModule, MatIconModule],
  template: `
<!-- ── Floating button ──────────────────────────────────────────── -->
@if (!isOpen()) {
  <button class="chat-fab" (click)="open()">
    <mat-icon>smart_toy</mat-icon>
    <span class="fab-label">Ask AI</span>
  </button>
}

<!-- ── Chat panel ──────────────────────────────────────────────── -->
@if (isOpen()) {
  <div class="chat-panel">

    <!-- Header -->
    <div class="chat-header">
      <div class="chat-header-left">
        <div class="chat-avatar"><mat-icon>smart_toy</mat-icon></div>
        <div>
          <div class="chat-name">Organic Care AI</div>
          <div class="chat-status">
            @if (isStreaming()) {
              <span class="dot typing-dot"></span> typing…
            } @else {
              <span class="dot online-dot"></span> Online
            }
          </div>
        </div>
      </div>
      <div class="chat-header-right">
        <button class="hdr-btn" (click)="clear()" title="Clear chat">
          <mat-icon>refresh</mat-icon>
        </button>
        <button class="hdr-btn" (click)="close()">
          <mat-icon>close</mat-icon>
        </button>
      </div>
    </div>

    <!-- Messages -->
    <div class="chat-messages" #messagesEl>
      @if (messages().length === 0) {
        <div class="welcome-state">
          <div class="welcome-emoji">🌿</div>
          <div class="welcome-title">Hi! I'm your Organic Care AI</div>
          <p class="welcome-sub">Ask me about nutrition, recipes, organic foods, or wellness.</p>
          <div class="suggestions">
            @for (s of suggestions(); track s) {
              <button class="suggestion-chip" (click)="sendSuggestion(s)">{{ s }}</button>
            }
          </div>
        </div>
      }

      @for (msg of messages(); track msg.id) {
        <div class="msg-row" [class.user-row]="msg.role === 'user'">
          @if (msg.role === 'assistant') {
            <div class="msg-avatar-sm"><mat-icon>smart_toy</mat-icon></div>
          }
          <div class="msg-col">
            <!-- Bubble -->
            <div class="bubble" [class.user-bubble]="msg.role === 'user'" [class.ai-bubble]="msg.role === 'assistant'" [class.error-bubble]="msg.error">
              @if (msg.streaming && !msg.content) {
                <span class="typing-dots"><span></span><span></span><span></span></span>
              } @else if (msg.role === 'assistant') {
                <div class="md-body" [innerHTML]="renderMd(msg.content)"></div>
                @if (msg.streaming) { <span class="cursor">▋</span> }
              } @else {
                {{ msg.content }}
              }
            </div>

            <!-- AI-only extras (shown when done streaming) -->
            @if (msg.role === 'assistant' && !msg.streaming) {
              <!-- Feedback buttons (only when dbId present) -->
              @if (!msg.error && msg.dbId) {
                <div class="msg-feedback">
                  <button class="fb-btn" [class.active-up]="msg.feedback === 1" (click)="submitFeedback(msg, 1)" title="Helpful">
                    <mat-icon>thumb_up_alt</mat-icon>
                  </button>
                  <button class="fb-btn" [class.active-down]="msg.feedback === -1" (click)="submitFeedback(msg, -1)" title="Not helpful">
                    <mat-icon>thumb_down_alt</mat-icon>
                  </button>
                </div>
              }

              <!-- Retry button on error -->
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

    <!-- Input row -->
    <div class="chat-input-row">
      @if (hasVoice) {
        <button class="mic-btn" [class.recording]="isRecording()" (click)="toggleVoice()" [title]="isRecording() ? 'Stop recording' : 'Voice input'">
          <mat-icon>{{ isRecording() ? 'mic' : 'mic_none' }}</mat-icon>
        </button>
      }
      <input
        #inputEl
        class="chat-input"
        type="text"
        [placeholder]="isRecording() ? 'Listening…' : 'Ask about nutrition, recipes…'"
        [(ngModel)]="inputText"
        (keyup.enter)="send()"
        [disabled]="isStreaming()"
        maxlength="1000">
      <button class="send-btn" (click)="send()" [disabled]="!inputText.trim() || isStreaming()">
        <mat-icon>{{ isStreaming() ? 'hourglass_top' : 'send' }}</mat-icon>
      </button>
    </div>

  </div>
}

  `,
  styles: [`
    /* ── Floating button ─────────────────────────────── */
    .chat-fab {
      position: fixed; bottom: 80px; right: 16px; z-index: 300;
      background: #2e7d32; color: #fff; border: none; border-radius: 28px;
      padding: 11px 18px 11px 13px;
      display: flex; align-items: center; gap: 7px;
      box-shadow: 0 4px 18px rgba(46,125,50,0.45);
      cursor: pointer; font-family: 'Inter', sans-serif;
      transition: transform 0.18s, box-shadow 0.18s;
      mat-icon { font-size: 22px; }
      &:hover { transform: translateY(-2px); box-shadow: 0 6px 24px rgba(46,125,50,0.55); }
    }
    .fab-label { font-size: 13px; font-weight: 700; }

    /* ── Chat panel ──────────────────────────────────── */
    .chat-panel {
      position: fixed; bottom: 64px; left: 0; right: 0; z-index: 300;
      background: #fff; border-radius: 20px 20px 0 0;
      box-shadow: 0 -6px 32px rgba(0,0,0,0.16);
      display: flex; flex-direction: column; height: 72vh; max-height: 580px;
    }

    /* ── Header ──────────────────────────────────────── */
    .chat-header {
      display: flex; align-items: center; justify-content: space-between;
      padding: 13px 16px; background: #2e7d32; border-radius: 20px 20px 0 0;
      flex-shrink: 0;
    }
    .chat-header-left  { display: flex; align-items: center; gap: 10px; }
    .chat-header-right { display: flex; gap: 4px; }
    .chat-avatar {
      width: 36px; height: 36px; border-radius: 50%;
      background: rgba(255,255,255,0.18);
      display: flex; align-items: center; justify-content: center;
      mat-icon { color: #fff; font-size: 20px; }
    }
    .chat-name   { font-size: 14px; font-weight: 700; color: #fff; }
    .chat-status { font-size: 11px; color: rgba(255,255,255,0.78); display: flex; align-items: center; gap: 5px; }
    .dot         { width: 7px; height: 7px; border-radius: 50%; flex-shrink: 0; }
    .online-dot  { background: #a5d6a7; }
    .typing-dot  { background: #fff176; animation: pulse 1s ease-in-out infinite; }
    .hdr-btn {
      width: 30px; height: 30px; border-radius: 50%;
      background: rgba(255,255,255,0.15); border: none; cursor: pointer;
      display: flex; align-items: center; justify-content: center;
      mat-icon { color: #fff; font-size: 18px; }
      &:hover { background: rgba(255,255,255,0.28); }
    }

    /* ── Messages ────────────────────────────────────── */
    .chat-messages {
      flex: 1; overflow-y: auto; padding: 14px 14px 8px;
      display: flex; flex-direction: column; gap: 10px;
      scrollbar-width: thin; scrollbar-color: #e0e0e0 transparent;
    }

    /* Welcome */
    .welcome-state  { text-align: center; padding: 12px 8px 4px; }
    .welcome-emoji  { font-size: 38px; margin-bottom: 8px; }
    .welcome-title  { font-size: 15px; font-weight: 700; color: #1a2a1a; margin-bottom: 5px; }
    .welcome-sub    { font-size: 12px; color: #6b7c6b; line-height: 1.5; margin: 0 0 14px; }
    .suggestions    { display: flex; flex-wrap: wrap; gap: 7px; justify-content: center; }
    .suggestion-chip {
      border: 1.5px solid #d4ebd4; background: #f1f8e9; color: #2e7d32;
      border-radius: 20px; padding: 6px 12px; font-size: 11px; font-weight: 600;
      cursor: pointer; font-family: 'Inter', sans-serif; transition: all 0.15s;
      &:hover { background: #e8f5e9; border-color: #4caf50; }
    }

    /* Message rows */
    .msg-row { display: flex; align-items: flex-start; gap: 7px; }
    .user-row { flex-direction: row-reverse; }
    .msg-col  { display: flex; flex-direction: column; max-width: 80%; gap: 4px; }
    .user-row .msg-col { align-items: flex-end; }

    .msg-avatar-sm {
      width: 26px; height: 26px; border-radius: 50%; background: #e8f5e9;
      flex-shrink: 0; margin-top: 2px;
      display: flex; align-items: center; justify-content: center;
      mat-icon { font-size: 15px; color: #2e7d32; }
    }

    /* Bubbles */
    .bubble {
      padding: 9px 13px; border-radius: 18px;
      font-size: 13px; line-height: 1.5; word-break: break-word;
      font-family: 'Inter', sans-serif;
    }
    .ai-bubble   { background: #f5f5f5; color: #1a2a1a; border-bottom-left-radius: 4px; }
    .user-bubble { background: #2e7d32; color: #fff;    border-bottom-right-radius: 4px; }
    .error-bubble { background: #fdecea; color: #c62828; }

    /* Typing dots */
    .typing-dots { display: inline-flex; gap: 4px; align-items: center; padding: 3px 0; }
    .typing-dots span {
      width: 7px; height: 7px; background: #9e9e9e; border-radius: 50%;
      animation: bounce 1.2s ease-in-out infinite;
      &:nth-child(2) { animation-delay: 0.2s; }
      &:nth-child(3) { animation-delay: 0.4s; }
    }
    .cursor { animation: blink 0.7s step-end infinite; opacity: 1; }

    /* Markdown */
    .md-body { font-size: 13px; line-height: 1.6; color: #1a2a1a; }
    ::ng-deep .ai-bubble .md-heading {
      font-size: 13px; font-weight: 700; color: #1b5e20;
      margin: 10px 0 4px; padding: 0;
    }
    ::ng-deep .ai-bubble .md-heading:first-child { margin-top: 2px; }
    ::ng-deep .ai-bubble .md-list { margin: 2px 0 6px 0; padding-left: 16px; }
    ::ng-deep .ai-bubble .md-list li { margin-bottom: 4px; font-size: 12.5px; line-height: 1.5; }
    ::ng-deep .ai-bubble .md-p { margin: 0 0 6px; font-size: 12.5px; line-height: 1.55; }
    ::ng-deep .ai-bubble .md-p:last-child { margin-bottom: 0; }
    ::ng-deep .ai-bubble strong { color: #1b5e20; font-weight: 700; }

    /* Feedback buttons */
    .msg-feedback { display: flex; gap: 4px; padding: 2px 0; }
    .fb-btn {
      width: 26px; height: 26px; border-radius: 50%; border: 1.5px solid #e0e0e0;
      background: #fff; cursor: pointer; display: flex; align-items: center; justify-content: center;
      transition: all 0.15s;
      mat-icon { font-size: 14px; color: #9e9e9e; }
      &:hover { border-color: #bdbdbd; }
    }
    .active-up  { border-color: #4caf50; background: #e8f5e9; mat-icon { color: #2e7d32; } }
    .active-down { border-color: #ef9a9a; background: #ffebee; mat-icon { color: #c62828; } }

    /* Retry button */
    .retry-btn {
      display: inline-flex; align-items: center; gap: 4px;
      background: none; border: 1.5px solid #c62828; color: #c62828;
      border-radius: 14px; padding: 4px 10px;
      font-size: 11px; font-weight: 600; cursor: pointer;
      font-family: 'Inter', sans-serif; transition: all 0.15s;
      mat-icon { font-size: 14px; }
      &:hover { background: #ffebee; }
    }

    /* ── Input row ───────────────────────────────────── */
    .chat-input-row {
      display: flex; align-items: center; gap: 8px;
      padding: 10px 12px; border-top: 1px solid #f0f0f0; flex-shrink: 0;
    }
    .mic-btn {
      width: 36px; height: 36px; border-radius: 50%; border: 1.5px solid #e0e8e0;
      background: #fff; cursor: pointer; flex-shrink: 0;
      display: flex; align-items: center; justify-content: center;
      transition: all 0.18s;
      mat-icon { font-size: 18px; color: #757575; }
      &:hover { border-color: #4caf50; mat-icon { color: #2e7d32; } }
    }
    .recording {
      border-color: #e53935; background: #ffebee; animation: pulse-red 1s ease-in-out infinite;
      mat-icon { color: #e53935; }
    }
    .chat-input {
      flex: 1; border: 1.5px solid #e0e8e0; border-radius: 22px;
      padding: 10px 14px; font-size: 13px; outline: none;
      color: #1a2a1a; font-family: 'Inter', sans-serif;
      transition: border-color 0.15s;
      &::placeholder { color: #b0b0b0; }
      &:focus { border-color: #4caf50; }
      &:disabled { background: #f9f9f9; }
    }
    .send-btn {
      width: 40px; height: 40px; border-radius: 50%; border: none;
      background: #2e7d32; cursor: pointer; flex-shrink: 0;
      display: flex; align-items: center; justify-content: center;
      transition: background 0.15s;
      mat-icon { color: #fff; font-size: 20px; }
      &:hover:not(:disabled) { background: #1b5e20; }
      &:disabled { background: #c8c8c8; cursor: not-allowed; }
    }

    /* ── Keyframes ───────────────────────────────────── */
    @keyframes pulse     { 0%,100% { opacity: 1; } 50% { opacity: 0.35; } }
    @keyframes pulse-red { 0%,100% { box-shadow: 0 0 0 0 rgba(229,57,53,0.4); } 50% { box-shadow: 0 0 0 5px rgba(229,57,53,0); } }
    @keyframes bounce    { 0%,80%,100% { transform: scale(0.65); opacity: 0.45; } 40% { transform: scale(1); opacity: 1; } }
    @keyframes blink     { 50% { opacity: 0; } }

    /* ── Desktop ─────────────────────────────────────── */
    @media (min-width: 768px) {
      .chat-fab   { bottom: 24px; right: 24px; }
      .chat-panel {
        bottom: 24px; right: 24px; left: auto;
        width: 380px; border-radius: 20px; max-height: 560px;
        box-shadow: 0 10px 40px rgba(0,0,0,0.18);
      }
      .chat-header { border-radius: 20px 20px 0 0; }
    }
  `],
})
export class ChatWidgetComponent implements AfterViewChecked {
  @ViewChild('messagesEl') private messagesEl?: ElementRef<HTMLDivElement>;

  private auth      = inject(AuthService);
  private zone      = inject(NgZone);
  private sanitizer = inject(DomSanitizer);


  isOpen            = signal(false);
  messages          = signal<ChatMsg[]>([]);
  isStreaming       = signal(false);
  isRecording       = signal(false);
  suggestions       = signal<string[]>(STATIC_SUGGESTIONS);

  inputText = '';
  readonly hasVoice = !!(
    (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
  );

  private shouldScroll = false;
  private historyLoaded = false;
  private recognition: any = null;

  // ── Lifecycle ──────────────────────────────────────────────────────────────

  ngAfterViewChecked() {
    if (this.shouldScroll && this.messagesEl) {
      const el = this.messagesEl.nativeElement;
      el.scrollTop = el.scrollHeight;
      this.shouldScroll = false;
    }
  }

  // ── Panel control ──────────────────────────────────────────────────────────

  open() {
    this.isOpen.set(true);
    if (!this.historyLoaded) {
      this.historyLoaded = true;
      this.loadHistory();
      this.loadSuggestions();
    }
  }

  close() { this.isOpen.set(false); }

  async clear() {
    this.messages.set([]);
    this.historyLoaded = false;
    const token = this.auth.getAccessToken();
    if (token) {
      try {
        await fetch(`${environment.apiUrl}/chat/history`, {
          method: 'DELETE',
          headers: { 'Authorization': `Bearer ${token}` },
        });
      } catch {}
    }
  }

  // ── History + suggestions ─────────────────────────────────────────────────

  private async loadHistory() {
    const token = this.auth.getAccessToken();
    if (!token) return;
    try {
      const res = await fetch(`${environment.apiUrl}/chat/history`, {
        headers: { 'Authorization': `Bearer ${token}` },
      });
      if (!res.ok) return;
      const data = await res.json();
      const msgs: ChatMsg[] = (data.messages as any[]).map((m, i) => ({
        id: i,
        dbId: m.id,
        role: m.role as 'user' | 'assistant',
        content: m.content,
        fromHistory: true,
      }));
      this.zone.run(() => {
        this.messages.set(msgs);
        this.shouldScroll = true;
      });
    } catch {}
  }

  private async loadSuggestions() {
    try {
      const token = this.auth.getAccessToken();
      const headers: Record<string, string> = {};
      if (token) headers['Authorization'] = `Bearer ${token}`;
      const res = await fetch(`${environment.apiUrl}/chat/suggestions`, { headers });
      if (!res.ok) return;
      const data = await res.json();
      this.zone.run(() => this.suggestions.set(data.suggestions));
    } catch {}
  }

  // ── Sending messages ──────────────────────────────────────────────────────

  sendSuggestion(text: string) {
    this.inputText = text;
    this.send();
  }

  retry(text: string) {
    this.messages.update(msgs => msgs.filter(m => !m.error));
    this.inputText = text;
    this.send();
  }

  async send() {
    const text = this.inputText.trim();
    if (!text || this.isStreaming()) return;

    const history = this.messages()
      .filter(m => !m.error)
      .map(m => ({ role: m.role, content: m.content }));

    this.zone.run(() => {
      this.messages.update(m => [...m, { id: Date.now(), role: 'user', content: text }]);
      this.inputText   = '';
      this.isStreaming.set(true);
      this.shouldScroll = true;
    });

    const aiId = Date.now() + 1;
    this.zone.run(() => {
      this.messages.update(m => [
        ...m, { id: aiId, role: 'assistant', content: '', streaming: true },
      ]);
      this.shouldScroll = true;
    });

    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      const token = this.auth.getAccessToken();
      if (token) headers['Authorization'] = `Bearer ${token}`;

      const response = await fetch(`${environment.apiUrl}/chat/stream`, {
        method: 'POST',
        headers,
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
                  msgs.map(m => m.id === aiId
                    ? { ...m, content: m.content + data.token }
                    : m)
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
                  msgs.map(m => m.id === aiId
                    ? { ...m, streaming: false, dbId: aiMsgId }
                    : m)
                );
              });
            }
          } catch { /* skip malformed SSE lines */ }
        }
      }
    } catch (e: any) {
      let msg = 'Connection error. Please try again.';
      if (e.isHttp) {
        msg = e.message;
      } else if (!navigator.onLine) {
        msg = 'No internet connection. Check your network.';
      }
      this.zone.run(() => {
        this.messages.update(msgs =>
          msgs.map(m => m.id === aiId
            ? { ...m, streaming: false, content: msg, error: true, retryText: text }
            : m)
        );
      });
    } finally {
      this.zone.run(() => {
        this.isStreaming.set(false);
        this.shouldScroll = true;
      });
    }
  }

  // ── Voice input ───────────────────────────────────────────────────────────

  toggleVoice() {
    this.isRecording() ? this.stopVoice() : this.startVoice();
  }

  private startVoice() {
    const SpeechRec =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRec) return;

    this.recognition = new SpeechRec();
    this.recognition.continuous = false;
    this.recognition.interimResults = true;
    this.recognition.lang = 'en-US';

    this.recognition.onresult = (event: any) => {
      const transcript = Array.from(event.results as any[])
        .map((r: any) => r[0].transcript)
        .join('');
      this.zone.run(() => { this.inputText = transcript; });
    };

    this.recognition.onend = () => {
      this.zone.run(() => {
        this.isRecording.set(false);
        if (this.inputText.trim() && !this.isStreaming()) this.send();
      });
    };

    this.recognition.onerror = () => {
      this.zone.run(() => { this.isRecording.set(false); });
    };

    this.recognition.start();
    this.isRecording.set(true);
  }

  private stopVoice() {
    this.recognition?.stop();
    this.isRecording.set(false);
  }

  // ── Feedback ──────────────────────────────────────────────────────────────

  async submitFeedback(msg: ChatMsg, rating: 1 | -1) {
    if (!msg.dbId || msg.feedback === rating) return;

    this.messages.update(msgs =>
      msgs.map(m => m.id === msg.id ? { ...m, feedback: rating } : m)
    );

    const token = this.auth.getAccessToken();
    if (!token) return;

    try {
      await fetch(`${environment.apiUrl}/chat/feedback`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({ message_id: msg.dbId, rating }),
      });
    } catch {}
  }


  // ── Rendering ─────────────────────────────────────────────────────────────

  renderMd(text: string): SafeHtml {
    return this.sanitizer.bypassSecurityTrustHtml(mdToHtml(text));
  }
}
