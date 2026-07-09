import { err, ok, Result } from "neverthrow";
import { ActionResult } from "./action-result.js";
import { ApiService } from "../infrastructure/services/api-service.js";
import { ServiceError } from "../infrastructure/service-error.js";
import { DirectoryPath } from "../types/file/directoryPath.js";
import { CommandMetadata } from "../types/common/command-metadata.js";
import { SubscriptionInfo } from "../types/api/account.js";
import { Language, mapLanguages } from "../types/sdk/generate.js";

/** Prompts the plan resolution needs to report failures — satisfied by both quickstart prompt classes. */
export interface QuickstartPlanPrompts {
  accountInfoFetchFailed(error: ServiceError): void;
  noLanguagesAvailableOnPlan(): void;
}

export interface QuickstartPlan {
  accountInfo: SubscriptionInfo;
  allowedLanguages: Language[];
}

/**
 * Fetches account info and resolves the SDK languages the plan allows, shared by
 * the portal and SDK quickstart flows. On the error branch it has already shown
 * the relevant prompt and carries the {@link ActionResult} the caller should
 * return: a failure if the lookup fails, or a cancellation when the plan includes
 * no SDK languages (e.g. the free plan) so quickstart stops before touching a spec.
 */
export async function resolveQuickstartPlan(
  apiService: ApiService,
  configDir: DirectoryPath,
  commandMetadata: CommandMetadata,
  prompts: QuickstartPlanPrompts
): Promise<Result<QuickstartPlan, ActionResult>> {
  const accountInfo = await apiService.getAccountInfo(configDir, commandMetadata.shell, null);
  if (accountInfo.isErr()) {
    prompts.accountInfoFetchFailed(accountInfo.error);
    return err(ActionResult.failed());
  }

  const allowedLanguages = mapLanguages(accountInfo.value.allowedLanguages);
  if (allowedLanguages.length === 0) {
    prompts.noLanguagesAvailableOnPlan();
    return err(ActionResult.cancelled());
  }

  return ok({ accountInfo: accountInfo.value, allowedLanguages });
}
