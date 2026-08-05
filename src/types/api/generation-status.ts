import { Status } from "@apimatic/sdk";

export interface GenerationStatusResponse {
  status: Status;
  errors?: Record<string, unknown>;
}
