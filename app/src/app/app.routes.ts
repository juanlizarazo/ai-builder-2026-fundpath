import { Routes } from '@angular/router';
import { Layout } from '@app/core';

export const routes: Routes = [
  {
    path: '',
    data: { layout: Layout.Public },
    loadComponent: () => import('./features/home/home.component').then((m) => m.HomeComponent)
  },
  {
    path: '**',
    redirectTo: ''
  }
];
