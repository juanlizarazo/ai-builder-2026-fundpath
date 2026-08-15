import { Component, OnDestroy, OnInit, inject } from '@angular/core';
import { RouterModule } from '@angular/router';
import { Subscription } from 'rxjs';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';

import { AuthService } from '@app/core/services/auth.service';

@Component({
  selector: 'ss-public-layout',
  standalone: true,
  imports: [RouterModule, MatButtonModule, MatIconModule, MatMenuModule],
  templateUrl: './public-layout.component.html',
  styleUrl: './public-layout.component.scss'
})
export class PublicLayoutComponent implements OnInit, OnDestroy {
  public isAuthenticated = false;
  public userInitials = '';
  public userEmail = '';

  private readonly _authService = inject(AuthService);
  private _authSub?: Subscription;

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
}
