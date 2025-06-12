export interface Toc {
    toc: Array<TocGroup | TocGenerated>
};

export interface TocGroup {
    readonly group: string,
    readonly items: Array<TocGroup | TocGenerated | TocEndpoint | TocEndpointGroupOverview | TocModel | TocCustomPage>
};

export interface TocGenerated {
  readonly generate: string;
  readonly from: string;
};

export interface TocEndpointGroupOverview {
  readonly generate: null;
  readonly from: "endpoint-group-overview";
  readonly endpointGroup: string;
};

export interface TocEndpoint {
  readonly generate: null;
  readonly from: "endpoint";
  readonly endpointName: string;
  readonly endpointGroup: string;
};

export interface TocModel {
  readonly generate: null;
  readonly from: "model";
  readonly modelName: string;
};

export interface TocCustomPage {
  readonly page: string;
  readonly file: string;
};