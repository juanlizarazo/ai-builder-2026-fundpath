import { Component, computed, inject } from '@angular/core';
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
  protected readonly starterKits = this._fundpathService.myStarterKits;

  private readonly _kitCountByRoute = computed<Record<string, number>>(() => {
    const counts: Record<string, number> = {};
    for (const kit of this.starterKits()) {
      counts[kit.routeId] = (counts[kit.routeId] ?? 0) + 1;
    }
    return counts;
  });

  private readonly _sf424CountByRoute = computed<Record<string, number>>(() => {
    const counts: Record<string, number> = {};
    for (const kit of this.starterKits()) {
      if (kit.hasSf424) {
        counts[kit.routeId] = (counts[kit.routeId] ?? 0) + 1;
      }
    }
    return counts;
  });

  protected stopCount(path: IRoute): number {
    return path.stops?.length ?? 0;
  }

  protected applicationCount(path: IRoute): number {
    return this._kitCountByRoute()[path.id!] ?? 0;
  }

  protected sf424Count(path: IRoute): number {
    return this._sf424CountByRoute()[path.id!] ?? 0;
  }
}
