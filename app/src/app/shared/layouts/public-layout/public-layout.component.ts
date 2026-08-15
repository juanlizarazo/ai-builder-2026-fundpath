import { Component, OnDestroy, OnInit, inject, signal } from '@angular/core';
import { Router, RouterModule } from '@angular/router';
import { Subscription } from 'rxjs';
import { MatButtonModule } from '@angular/material/button';
import { MatDividerModule } from '@angular/material/divider';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';

import { AuthService } from '@app/core/services/auth.service';
import { NotificationsService } from '@app/core/services/notifications.service';
import { SidePanelComponent } from '@app/shared/components/side-panel/side-panel.component';
import { formatRelativeTime } from '@app/shared/utils/format.utils';
import { FundPath } from '../../../../types/firestore';

type INotification = FundPath.Firestore.Notifications.INotification;

@Component({
  selector: 'ss-public-layout',
  standalone: true,
  imports: [RouterModule, MatButtonModule, MatDividerModule, MatIconModule, MatMenuModule, SidePanelComponent],
  templateUrl: './public-layout.component.html',
  styleUrl: './public-layout.component.scss'
})
export class PublicLayoutComponent implements OnInit, OnDestroy {
  public isAuthenticated = false;
  public userInitials = '';
  public userEmail = '';

  protected readonly isInboxOpen = signal(false);
  protected readonly formatRelativeTime = formatRelativeTime;

  private readonly _authService = inject(AuthService);
  private readonly _notificationsService = inject(NotificationsService);
  private readonly _router = inject(Router);
  private _authSub?: Subscription;

  protected readonly notifications = this._notificationsService.notifications;
  protected readonly unreadCount = this._notificationsService.unreadCount;

  public ngOnInit(): void {
    this._authSub = this._authService.user$.subscribe((user) => {
      this.isAuthenticated = !!user && !user.isAnonymous;
      this.userEmail = user?.email ?? '';

      const name = user?.displayName;

      if (name) {
        this.userInitials = name.charAt(0).toUpperCase();
      } else if (user?.email) {
        this.userInitials = user.email.charAt(0).toUpperCase();
      } else {
        this.userInitials = '';
      }
    });
  }

  public ngOnDestroy(): void {
    this._authSub?.unsubscribe();
  }

  public async signIn(): Promise<void> {
    await this._authService.signInWithGoogle();
  }

  public async signOut(): Promise<void> {
    await this._authService.signOut();
  }

  protected openInbox(): void {
    this.isInboxOpen.set(true);
  }

  protected closeInbox(): void {
    this.isInboxOpen.set(false);
  }

  protected async onNotificationClick(notification: INotification): Promise<void> {
    if (!notification.readAt && notification.id) {
      await this._notificationsService.markRead(notification.id);
    }

    this.closeInbox();

    const stopId = notification.stopIds[0];

    await this._router.navigate(['/route', notification.routeId]);

    if (stopId) {
      requestAnimationFrame(() => {
        setTimeout(() => {
          document.getElementById(`stop-${stopId}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }, 300);
      });
    }
  }

  protected deliveryLabel(notification: INotification): string {
    switch (notification.deliveryStatus) {
      case 'sent':
        return notification.channel === 'email' ? 'Emailed to you' : `Sent via ${notification.channel}`;
      case 'failed':
        return 'Delivery failed — in-app only';
      default:
        return 'In-app only';
    }
  }
}
