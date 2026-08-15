import { Component } from '@angular/core';
import { ActivatedRoute, NavigationEnd, Router } from '@angular/router';
import { filter, map } from 'rxjs';

import { Layout } from '@app/core';
import { PublicLayoutComponent } from './shared/layouts/public-layout/public-layout.component';
import { MainLayoutComponent } from './shared/layouts/main-layout/main-layout.component';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [PublicLayoutComponent, MainLayoutComponent],
  templateUrl: './app.html',
  styleUrl: './app.css'
})
export class App {
  public layout: Layout | null = null;

  constructor(
    private readonly _router: Router,
    private readonly _activatedRoute: ActivatedRoute
  ) {
    this._router.events
      .pipe(
        filter((event) => event instanceof NavigationEnd),
        map(() => {
          let route = this._activatedRoute.firstChild;
          let layoutData: Layout | undefined;

          while (route) {
            if (route.snapshot.data['layout']) {
              layoutData = route.snapshot.data['layout'];
            }

            route = route.firstChild;
          }

          return layoutData || Layout.Public;
        })
      )
      .subscribe((layout) => {
        this.layout = layout;
      });
  }
}
