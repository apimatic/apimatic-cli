export enum StepType {
  Content = "content",
  Endpoint = "endpoint"
}

export interface RecipeContext {
  showContent(content: string): Promise<any>;
  showEndpoint(config: EndpointConfig): Promise<any>;
}

export interface EndpointConfig {
  description: string;
  endpointPermalink: string;
}

export interface StepConfig {
  name: string;
  stepCallback: () => Promise<any>;
}

export interface RecipeDefinition {
  [stepKey: string]: StepConfig;
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

export interface EndpointStepConfig extends EndpointConfig {}

export interface DirectoryNode {
  [key: string]: DirectoryNode | string | null | undefined;
}
