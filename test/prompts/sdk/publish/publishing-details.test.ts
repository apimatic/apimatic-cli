import { expect } from 'chai';
import { formatPublishingDetails } from '../../../../src/prompts/sdk/publish.js';
import { PublishType } from '../../../../src/types/publish-api/publishing-profile-item.js';
import { PublishingProfile } from '../../../../src/types/publish/publishing-profile.js';
import { SemVersion } from '../../../../src/types/publish/version.js';
import { Language } from '../../../../src/types/sdk/generate.js';

const profile = { toString: () => 'My Profile' } as unknown as PublishingProfile;
const version = SemVersion.tryCreate('1.2.3')._unsafeUnwrap();

const details = (publishType: PublishType[]) =>
  formatPublishingDetails({
    profile,
    language: Language.CSHARP,
    version,
    publishType
  });

describe('formatPublishingDetails', () => {
  it('renders the profile, language, version and targets', () => {
    const output = details([PublishType.PackagePublishing]);

    expect(output).to.contain('Profile:   My Profile');
    expect(output).to.contain('Language:  csharp');
    expect(output).to.contain('Version:   1.2.3');
    expect(output).to.contain('Targets:   Package');
  });

  it('names both targets when a run publishes both', () => {
    const output = details([PublishType.SourceCodePublishing, PublishType.PackagePublishing]);

    expect(output).to.contain('Targets:   Source Code + Package');
  });

  // There is one code generator now, so naming it would be a row that never changes.
  it('says nothing about the code generator', () => {
    const output = details([PublishType.PackagePublishing]);

    expect(output).to.not.contain('Generator');
  });
});
