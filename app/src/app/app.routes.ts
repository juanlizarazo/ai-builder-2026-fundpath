import { Routes } from '@angular/router';
import { Layout } from '@app/core';

export const routes: Routes = [
  {
    path: '',
    data: { layout: Layout.Public },
    loadComponent: () => import('./features/intake/intake.component').then(m => m.IntakeComponent)
  },
  {
    path: 'route/:routeId',
    data: { layout: Layout.Public },
    loadComponent: () => import('./features/route/route.component').then(m => m.RouteComponent)
  },
  {
    path: 'route/:routeId/apply/:stopId',
    data: { layout: Layout.Public },
    loadComponent: () => import('./features/application/application.component').then(m => m.ApplicationComponent)
  },
  {
    path: 'privacy',
    data: { layout: Layout.Public },
    loadComponent: () => import('./features/legal/privacy/privacy.component').then(m => m.PrivacyComponent)
  },
  {
    path: 'terms',
    data: { layout: Layout.Public },
    loadComponent: () => import('./features/legal/terms/terms.component').then(m => m.TermsComponent)
  },
  {
    path: '**',
    redirectTo: ''
  }
];
