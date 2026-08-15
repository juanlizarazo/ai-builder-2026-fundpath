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
    path: '**',
    redirectTo: ''
  }
];
