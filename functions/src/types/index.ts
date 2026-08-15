import { IRoute, IStarterKit, IApplicantDetails } from '../firestore';

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

export interface IGenerateStarterKitRequest {
  routeId: string;
  stopId: string;
}

export interface IGenerateStarterKitResponse {
  routeId: string;
  stopId: string;
  kit: IStarterKit;
}

export interface IGenerateSf424Request {
  routeId: string;
  stopId: string;
  applicantDetails: IApplicantDetails;
}

export interface IGenerateSf424Response {
  url?: string;
  base64?: string;
  expiresAt?: string;
}
