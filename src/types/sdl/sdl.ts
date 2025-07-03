export interface Sdl {
  readonly Endpoints: SdlEndpoint[],
  readonly CustomTypes: SdlModel[]
}

export interface SdlEndpoint {
  readonly Name: string,
  readonly Description: string,
  readonly Group: string
}

export interface SdlModel {
  readonly Name: string
}