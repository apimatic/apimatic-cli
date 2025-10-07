export interface Toc {
  toc: Array<TocGroup | TocGenerated>
}

export interface TocGroup {
  readonly group: string,
  readonly items: Array<TocGroup | TocGenerated | TocEndpoint | TocEndpointGroupOverview | TocModel | TocWebhookPage | TocCallbackPage | TocCustomPage>
}

export interface TocGenerated {
  readonly generate: string;
  readonly from: string;
}

export interface TocEndpointGroupOverview {
  readonly generate: null;
  readonly from: "endpoint-group-overview";
  readonly endpointGroup: string;
}

export interface TocEndpoint {
  readonly generate: null;
  readonly from: "endpoint";
  readonly endpointName: string;
  readonly endpointGroup: string;
}

export interface TocModel {
  readonly generate: null;
  readonly from: "model";
  readonly modelName: string;
}

export type TocWebhookPage = TocWebhook | TocWebhookOverview;
export type TocCallbackPage = TocCallback | TocCallbackOverview;

export interface TocWebhookOverview {
  readonly generate: null;
  readonly from: "webhook-group-overview";
  webhookGroup: string | null;
}

export interface TocWebhook {
  readonly generate: null;
  readonly from: "webhook";
  readonly webhookName: string;
  webhookGroup: string | null;
}

export interface TocCallbackOverview {
  readonly generate: null;
  readonly from: "callback-group-overview";
  callbackGroup: string | null;
}

export interface TocCallback {
  readonly generate: null;
  readonly from: "callback";
  readonly callbackName: string;
  callbackGroup: string | null;
}

export interface TocCustomPage {
  readonly page: string;
  readonly file: string;
}
