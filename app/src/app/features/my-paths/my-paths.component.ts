import { Component, inject } from '@angular/core';
import { RouterModule } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';

import { FundpathService } from '@app/core/services/fundpath.service';
import { formatRelativeTime } from '@app/shared/utils/format.utils';
import { FundPath } from '../../../types/firestore';

type IRoute = FundPath.Firestore.Routes.IRoute;

@Component({
  selector: 'app-my-paths',
  standalone: true,
  imports: [RouterModule, MatIconModule],
  templateUrl: './my-paths.component.html',
  styleUrl: './my-paths.component.scss'
})
export class MyPathsComponent {
  private readonly _fundpathService = inject(FundpathService);

  protected readonly formatRelativeTime = formatRelativeTime;
  protected readonly paths = this._fundpathService.myRoutes;

  protected stopCount(path: IRoute): number {
    return path.stops?.length ?? 0;
  }
}
