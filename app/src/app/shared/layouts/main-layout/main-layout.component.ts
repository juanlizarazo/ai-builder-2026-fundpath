import { Component, inject } from '@angular/core';
import { Router, RouterModule } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { Auth } from '@angular/fire/auth';

import { LoadingService } from '@app/core/services/loading.service';
import { AuthService } from '@app/core/services/auth.service';

@Component({
  selector: 'ss-main-layout',
  imports: [RouterModule, MatIconModule, MatButtonModule, MatProgressBarModule],
  templateUrl: './main-layout.component.html',
  styleUrl: './main-layout.component.scss'
})
export class MainLayoutComponent {
  public readonly loadingService = inject(LoadingService);
  private readonly _auth = inject(Auth);
  private readonly _authService = inject(AuthService);
  private readonly _router = inject(Router);

  public get userEmail(): string {
    return this._auth.currentUser?.displayName || this._auth.currentUser?.email || '';
  }

  public async signOut(): Promise<void> {
    await this._authService.signOut();
    await this._router.navigate(['/']);
  }
}
