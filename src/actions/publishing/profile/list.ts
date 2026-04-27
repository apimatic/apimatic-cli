import { PublishingApiService } from '../../../infrastructure/services/publishing-api-service.js';
import { DirectoryPath } from '../../../types/file/directoryPath.js';
import { CommandMetadata } from '../../../types/common/command-metadata.js';
import { PublishingProfileListPrompts } from '../../../prompts/publishing/profile/list.js';
import { ActionResult } from '../../action-result.js';
import { PublishingProfiles } from '../../../types/publish/publishing-profiles.js';

export class PublishingProfileListAction {
  private readonly prompts = new PublishingProfileListPrompts();
  private readonly publishingApiService = new PublishingApiService();

  constructor(private readonly configDir: DirectoryPath, private readonly commandMetadata: CommandMetadata) {}

  public async execute(): Promise<ActionResult> {
    const profilesResult = await this.prompts.fetchProfiles(
      this.publishingApiService.getPublishingProfiles(this.configDir, this.commandMetadata.shell)
    );

    if (profilesResult.isErr()) {
      this.prompts.fetchError(profilesResult.error);
      return ActionResult.failed();
    }

    const publishingProfilesResult = PublishingProfiles.create(profilesResult.value);
    if (publishingProfilesResult.isErr()) {
      this.prompts.noProfilesFound();
      return ActionResult.success();
    }

    const publishingProfiles = publishingProfilesResult.value;
    const publishingProfileSummariesByApiGroups = publishingProfiles.toPublishingProfileSummariesByApiGroups();
    this.prompts.displayProfiles(publishingProfileSummariesByApiGroups);
    return ActionResult.success();
  }
}
