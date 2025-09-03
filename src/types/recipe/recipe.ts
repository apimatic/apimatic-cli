export enum StepType {
  Content = "content",
  Endpoint = "endpoint"
}

export interface EndpointConfig {
  description: string;
  endpointPermalink: string;
}

export interface SerializableRecipe {
  name: string;
  steps: SerializableStep[];
}

export interface SerializableStep {
  key: string;
  name: string;
  type: StepType;
  config: ContentStepConfig | EndpointStepConfig;
}

export interface ContentStepConfig {
  content: string;
}

export type EndpointStepConfig = EndpointConfig


export interface DirectoryNode {
  [key: string]: DirectoryNode | string | null | undefined;
}
