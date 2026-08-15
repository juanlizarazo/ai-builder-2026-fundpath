import { Component, EventEmitter, HostBinding, Input, Output } from '@angular/core';

import { BackButtonComponent } from '../back-button/back-button.component';

@Component({
  selector: 'ss-screen-toolbar',
  standalone: true,
  imports: [BackButtonComponent],
  template: `
    <div class="ss-screen-toolbar">
      <div class="ss-screen-toolbar--left">
        @if (backRoute || backClick.observed) {
          <ss-back-button
            [backRoute]="backClick.observed ? undefined : backRoute"
            (backClick)="backClick.emit()"
          ></ss-back-button>
        }
        <div class="toolbar-text">
          @if (pageTitle) {
            <div class="toolbar-title">{{ pageTitle }}</div>
          }
          @if (subtitle) {
            <div class="toolbar-subtitle">{{ subtitle }}</div>
          }
        </div>
      </div>
      <div class="ss-screen-toolbar--right">
        <ng-content></ng-content>
      </div>
    </div>
    `,
  styles: [`
    .ss-screen-toolbar {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 16px;
      gap: 16px;
      flex-wrap: wrap;
    }

    .ss-screen-toolbar--left {
      display: flex;
      align-items: center;
      gap: 12px;
      flex: 1;
      min-width: 0;
    }

    .ss-screen-toolbar--right {
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .toolbar-text {
      display: flex;
      flex-direction: column;
      gap: 2px;
      min-width: 0;
    }

    .toolbar-title {
      font-size: 24px;
      font-weight: 600;
      color: var(--app-theme--primary, #15445b);
    }

    .toolbar-subtitle {
      font-size: 14px;
      color: #666;
    }

    @media (max-width: 768px) {
      .ss-screen-toolbar {
        flex-direction: column;
        align-items: stretch;
      }

      .ss-screen-toolbar--left {
        flex: none;
      }

      .ss-screen-toolbar--right {
        justify-content: flex-start;
      }

      .toolbar-title {
        font-size: 20px;
      }
    }
  `]
})
export class ScreenToolbarComponent {
  @HostBinding('attr.title') hostTitle: null = null;

  @Input() backRoute = '';
  @Input() subtitle = '';
  @Output() backClick = new EventEmitter<void>();
  @Input() set title(value: string) {
    this.pageTitle = value;
  }

  public pageTitle = '';
}
