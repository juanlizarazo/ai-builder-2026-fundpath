import { IRoute, IStarterKit, IApplicantDetails } from '../firestore';

export interface IBuildRouteRequest {
  description: string;
  notifyEmail?: string;
  notifyPhone?: string;
  smsOptIn?: boolean;
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

/**
 * `applicantDetails` travels over the callable wire as plain JSON, so
 * `projectStartDate`/`projectEndDate` cannot be `IApplicantDetails`'s
 * Firestore `Timestamp` type here — a client-constructed `Timestamp`-shaped
 * object would arrive server-side as a plain object, not a real `Timestamp`
 * instance. The browser sends these two fields as ISO-8601 date strings
 * (e.g. from a native `<input type="date">`), and `generateSf424` converts
 * them to real `Timestamp`s before persisting to the profile doc or filling
 * the PDF.
 */
export interface IGenerateSf424ApplicantDetails extends Omit<IApplicantDetails, 'projectStartDate' | 'projectEndDate'> {
  projectStartDate?: string;
  projectEndDate?: string;
}

export interface IGenerateSf424Request {
  routeId: string;
  stopId: string;
  applicantDetails: IGenerateSf424ApplicantDetails;
}

export interface IGenerateSf424Response {
  url?: string;
  base64?: string;
  expiresAt?: string;
}

export interface ICheckForNewRequest {
  routeId: string;
}

export interface ICheckForNewResponse {
  foundNew: boolean;
  addedCount: number;
  message: string;
}

export interface ISimulateNotificationResponse {
  sentTo: string;
  message: string;
}
