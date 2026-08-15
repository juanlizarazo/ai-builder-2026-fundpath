import { Component } from '@angular/core';

@Component({
  selector: 'app-home',
  standalone: true,
  template: `
    <div class="home">
      <h1>GovFit</h1>
      <p>Government Funding for Utah Startups</p>
    </div>
  `,
  styles: [`
    .home {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      min-height: calc(100vh - 52px);
      gap: 8px;

      h1 {
        font-size: 2.5rem;
        font-weight: 700;
        color: var(--app-theme--primary, #15445b);
        margin: 0;
      }

      p {
        font-size: 1rem;
        color: #666;
        margin: 0;
      }
    }
  `]
})
export class HomeComponent {}
