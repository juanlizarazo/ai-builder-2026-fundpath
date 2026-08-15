import { IRoute } from '../firestore';

export interface IBuildRouteRequest {
  description: string;
}

export interface IBuildRouteResponse {
  profileId: string;
  routeId: string;
  route: IRoute;
}

export interface IGetRouteRequest {
  routeId: string;
}
