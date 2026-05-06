export interface Toc {
  toc: Array<TocGroup | TocGenerated>;
}

export interface TocGroup {
  readonly group: string;
  readonly items: Array<
    TocGroup | TocGenerated | TocEndpointPage | TocWebhookPage | TocCallbackPage | TocModelPage | TocCustomPage
  >;
}

export interface TocGenerated {
  readonly generate: string | null;
  readonly from: string;
}

export type TocEndpointPage = TocEndpoint | TocEndpointGroupOverview;
export type TocWebhookPage = TocWebhook | TocWebhookOverview;
export type TocCallbackPage = TocCallback | TocCallbackOverview;

export interface TocEndpointGroupOverview {
  readonly generate: null;
  readonly from: 'endpoint-group-overview';
  readonly endpointGroup: string;
}

export interface TocEndpoint {
  readonly generate: null;
  readonly from: 'endpoint';
  readonly endpointName: string;
  readonly endpointGroup: string;
}

export interface TocModelPage {
  readonly generate: null;
  readonly from: 'model';
  readonly modelName: string;
}

export interface TocContainerModelPage {
  readonly generate: null;
  readonly from: 'container-model';
  readonly containerName: string;
}

export interface TocInputModelPage {
  readonly generate: null;
  readonly from: 'input-model';
  readonly endpointName: string;
  readonly endpointGroup: string;
}

export interface TocWebhookOverview {
  readonly generate: null;
  readonly from: 'webhook-group-overview';
  readonly webhookGroup: string | null;
}

export interface TocWebhook {
  readonly generate: null;
  readonly from: 'webhook';
  readonly webhookName: string;
  readonly webhookGroup: string | null;
}

export interface TocCallbackOverview {
  readonly generate: null;
  readonly from: 'callback-group-overview';
  readonly callbackGroup: string | null;
}

export interface TocCallback {
  readonly generate: null;
  readonly from: 'callback';
  readonly callbackName: string;
  readonly callbackGroup: string | null;
}

export interface TocCustomPage {
  readonly page: string;
  readonly file: string;
}
