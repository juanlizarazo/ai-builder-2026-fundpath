import { Component, ElementRef, EventEmitter, HostListener, Input, OnChanges, OnDestroy, Output, SimpleChanges, inject } from '@angular/core';

import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { animate, state, style, transition, trigger } from '@angular/animations';

@Component({
  selector: 'ss-side-panel',
  standalone: true,
  imports: [MatIconModule, MatButtonModule],
  template: `
    @if (isOpen) {
      <div class="side-panel-backdrop" [class.dark]="theme === 'dark'" (click)="closable && close()" [@fadeInOut]></div>
    }
    <div
      class="side-panel"
      [class.open]="isOpen"
      [class.bottom-sheet]="isMobile"
      [class.theme-dark]="theme === 'dark'"
      [style.width.px]="!isMobile ? width : null"
      [@slideInOut]="getAnimationState()"
    >
      <div class="side-panel-header">
        <span class="side-panel-title">{{ title }}</span>
        <button mat-icon-button (click)="close()" aria-label="Close panel" [disabled]="!closable">
          <mat-icon>close</mat-icon>
        </button>
      </div>
      <div class="side-panel-content">
        <ng-content></ng-content>
      </div>
    </div>
    `,
  styles: [`
    .side-panel-backdrop {
      position: fixed;
      top: 0; left: 0; right: 0; bottom: 0;
      background: rgba(0, 0, 0, 0.3);
      z-index: 999;
    }

    .side-panel {
      position: fixed;
      top: 0; right: 0; bottom: 0;
      width: 420px;
      max-width: 100vw;
      background: #fff;
      box-shadow: -4px 0 24px rgba(0, 0, 0, 0.15);
      z-index: 1000;
      display: flex;
      flex-direction: column;
      overflow: hidden;

      &.bottom-sheet {
        top: auto;
        left: 0; right: 0; bottom: 0;
        width: 100%;
        max-height: 85vh;
        border-radius: 16px 16px 0 0;
        box-shadow: 0 -4px 24px rgba(0, 0, 0, 0.15);
      }
    }

    .side-panel-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 16px 20px;
      border-bottom: 1px solid #e0e0e0;
      flex-shrink: 0;

      .side-panel-title {
        font-size: 18px;
        font-weight: 600;
        color: var(--app-theme--primary, #15445b);
      }
    }

    .side-panel-content {
      flex: 1;
      overflow-y: auto;
      padding: 20px;
    }

    .side-panel-backdrop.dark { background: rgba(0, 0, 0, 0.55); }

    .side-panel.theme-dark {
      background: #0B1220;

      .side-panel-header {
        position: absolute;
        top: 8px; right: 8px; left: auto;
        width: auto; padding: 0; border: none;
        background: transparent; z-index: 2;

        .side-panel-title { display: none; }

        button {
          width: 32px; height: 32px; min-width: 32px;
          background: rgba(0,0,0,0.5);
          backdrop-filter: blur(8px);
          -webkit-backdrop-filter: blur(8px);
          border-radius: 50%;
          color: rgba(255,255,255,0.8) !important;
        }
      }
    }
  `],
  animations: [
    trigger('slideInOut', [
      state('closed-right', style({ transform: 'translateX(100%)', visibility: 'hidden' })),
      state('open-right', style({ transform: 'translateX(0)', visibility: 'visible' })),
      state('closed-bottom', style({ transform: 'translateY(100%)', visibility: 'hidden' })),
      state('open-bottom', style({ transform: 'translateY(0)', visibility: 'visible' })),
      transition('closed-right <=> open-right', animate('250ms ease-in-out')),
      transition('closed-bottom <=> open-bottom', animate('250ms ease-in-out'))
    ]),
    trigger('fadeInOut', [
      transition(':enter', [style({ opacity: 0 }), animate('200ms ease-out', style({ opacity: 1 }))]),
      transition(':leave', [animate('200ms ease-in', style({ opacity: 0 }))])
    ])
  ]
})
export class SidePanelComponent implements OnChanges, OnDestroy {
  private static _openCount = 0;

  private readonly _elementRef = inject<ElementRef<HTMLElement>>(ElementRef);
  private _previouslyFocused: HTMLElement | null = null;

  @Input() public title = '';
  @Input() public isOpen = false;
  @Input() public closable = true;
  @Input() public theme: 'light' | 'dark' = 'light';
  /** Desktop panel width in px (ignored on mobile, where it's always full-width). */
  @Input() public width = 420;
  @Output() public closed = new EventEmitter<void>();

  public isMobile = typeof window !== 'undefined' && window.innerWidth <= 768;

  @HostListener('window:resize')
  public onResize(): void {
    this.isMobile = typeof window !== 'undefined' && window.innerWidth <= 768;
  }

  @HostListener('window:keydown.escape')
  public onEscape(): void {
    if (this.isOpen && this.closable) {
      this.close();
    }
  }

  public ngOnChanges(changes: SimpleChanges): void {
    if (changes['isOpen']) {
      const wasOpen = changes['isOpen'].previousValue === true;
      const nowOpen = changes['isOpen'].currentValue === true;

      if (!wasOpen && nowOpen) {
        SidePanelComponent._openCount++;
        this._previouslyFocused = document.activeElement as HTMLElement | null;
        setTimeout(() => this._focusFirst(), 0);
      } else if (wasOpen && !nowOpen) {
        SidePanelComponent._openCount = Math.max(0, SidePanelComponent._openCount - 1);
        this._previouslyFocused?.focus();
        this._previouslyFocused = null;
      }

      this._syncBodyClass();
    }
  }

  public ngOnDestroy(): void {
    if (this.isOpen) {
      SidePanelComponent._openCount = Math.max(0, SidePanelComponent._openCount - 1);
      this._syncBodyClass();
    }
  }

  private _focusFirst(): void {
    const panel = this._elementRef.nativeElement.querySelector<HTMLElement>('.side-panel');
    const firstFocusable = panel?.querySelector<HTMLElement>(
      'button, a[href], input, textarea, select, [tabindex]:not([tabindex="-1"])'
    );

    firstFocusable?.focus();
  }

  public getAnimationState(): string {
    const direction = this.isMobile ? 'bottom' : 'right';

    return this.isOpen ? `open-${direction}` : `closed-${direction}`;
  }

  public close(): void {
    this.closed.emit();
  }

  private _syncBodyClass(): void {
    if (typeof document === 'undefined') {
      return;
    }

    if (SidePanelComponent._openCount > 0) {
      document.body.classList.add('ss-panel-open');
    } else {
      document.body.classList.remove('ss-panel-open');
    }
  }
}
