import { Component, Input, Output, EventEmitter } from '@angular/core';

import { RouterModule } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';

@Component({
  selector: 'ss-back-button',
  standalone: true,
  imports: [RouterModule, MatButtonModule, MatIconModule, MatTooltipModule],
  templateUrl: './back-button.component.html',
  styleUrls: ['./back-button.component.scss']
})
export class BackButtonComponent {
  @Input() backRoute?: string | any[];
  @Input() tooltip = 'Go back';
  @Input() ariaLabel = 'Go back';
  @Output() backClick = new EventEmitter<void>();

  public onBackClick(): void {
    if (!this.backRoute) {
      this.backClick.emit();
    }
  }
}
