# Plan: a release is a merge

Status: 7.2 implemented on this branch and code-reviewed, then extended with
the automatic back-merge (D8), narrowed to `main` and `beta` (D9), and `dev`
restricted to squash (D10); 7.1 and 7.3 onward are admin and release-day
steps, not yet taken. The plan was reviewed once before implementation
(section 10). Grounded in `dev` at `74ad5d2e`, `beta` at `8581f9e8` and `main`
at `c199698a`, and in the repository settings and rulesets as read on
2026-09-29. Every version number in section 5 comes from running
semantic-release 25.0.3, with this plan's configuration, against a local copy
of the repository (section 10).

## 1. Goal and scope

Merging a pull request is the whole release:

- into `main`, it publishes a stable version to the npm `latest` dist-tag;
- into `beta`, a prerelease to `beta`.

No ruleset is switched off around a release, no branch is deleted and
recreated, no file is edited by hand, and the generated notes can be published
as they are. The main → dev back-merge that follows a stable release or a
hotfix is made by the release run itself (7.2, item 3). Two things still need a
person, both made plain where they occur:

- a back-merge that conflicts with `dev`. The next promotion is refused until
  someone resolves it, so it cannot be missed (7.2, item 4), and an admin
  widens dev's ruleset for that one merge commit (D10);
- 2.0.0's notes, which are curated once (7.4, step 5).

Out of scope: what goes into a release, and the follow-ups in section 9.

## 2. How a release works today, and why it hurts

### 2.1 The bot commits back to the release branch

`release.config.cjs` runs `@semantic-release/changelog` and
`@semantic-release/git`. They commit `CHANGELOG.md` and `package.json` as
`chore(release): set package.json to X [skip ci]` and push that commit to the
branch being released. Three rulesets guard the branches. Each requires a pull
request, and none has a bypass actor:

| Ruleset | Branches | Merge methods | Approvals |
|---|---|---|---|
| `no-direct-commits` (6204890) | default branch, `dev`, `beta`, `main` | merge, squash, rebase | 1 |
| `dev branch merge method` (23269236) | `dev` | squash, merge | 0 |
| `main branch merge method` (23269071) | `main` | merge | 0 |

The bot's push is rejected, and `github-actions[bot]` cannot be added as a
bypass actor. So an admin switches `no-direct-commits` off for each release.
For 2.0.0-beta.2 it went off at 12:14Z on 2026-09-29 and came back on at
12:27Z.

`main branch merge method` was created as 1.5.0's release run finished
(07:16:54Z on 2026-09-14) and switched on at 07:18:06Z. No release has run
against it since, and the next stable release would be rejected even with
`no-direct-commits` off. The git plugin pushes during `prepare`, before the tag
and the npm publish, so that run would fail without publishing anything.

### 2.2 The release commit makes the branches drift apart

`dev` never receives beta's release commits, so each branch's copy of these
files diverges:

- `CHANGELOG.md` on `dev` ends at 1.5.0;
- beta's copy is 898 lines, opens with 2.0.0-beta.2, and every prerelease
  section in it would ride into main's copy when beta is promoted.

On 2026-09-28, dev → beta conflicted on `CHANGELOG.md`, `package.json` and two
prompt files, and `beta` was deleted and recreated from `dev` by hand.

### 2.3 A commit body reaches the notes and can change the version

The repository's default squash message is `COMMIT_MESSAGES`: the squash body
is every commit message on the branch, one after another. #359's squash commit
(`c48f91b5`) is 222 lines; #347's is 159. The notes generator reads two things
from a body:

- **Notes.** A `BREAKING CHANGE:` footer is read up to the end of the message,
  so each footer takes the rest of its squash body with it. 2.0.0-beta.1's
  BREAKING CHANGES section runs from line 64 to line 346 of beta's
  `CHANGELOG.md`. The pattern is case-insensitive and allows `*`, `|` or spaces
  before the keyword. A body line such as `* Breaking change: none` or
  `| Breaking change | No |` becomes a breaking note, and the release becomes a
  **major** (section 10). Three of the last 150 PR descriptions (#343, #347,
  #363) contain such a line.
- **References.** Every `#N` in a body is printed as `closes #N`, whether or
  not it closes anything. That is where `closes #358 #358` on #359's line comes
  from.

### 2.4 The angular preset does not read `!`

`conventional-changelog-angular` 8.3.1 has no breaking-header pattern. Run
through the repo's own commit analyzer and notes generator (section 10), a
`feat(sdk)!: …` commit without a footer is **left out of the notes and releases
nothing**. 2.0.0 is a major release only because #347, #359 and #363 carry
footers. Their `!` headers print as three bullets under no heading at the top
of 2.0.0-beta.1's notes. `conventional-changelog-conventionalcommits` reads the
`!`, makes the release a major, and lists the subject under ⚠ BREAKING CHANGES.

### 2.5 A change can reach a release branch twice

#339 put a squashed copy of #338 on `main`, and #342 (dev → main) later brought
#338's own commit. So "add Codex docs link to plugin try-it-locally note" is
listed in both 1.4.0 and 1.5.0. beta's `591c10eb` (#331, a squashed
cherry-pick of #328 and #329) did the same on `beta`. Every squash, cherry-pick
or rebase into a release branch creates a second commit for a change that will
arrive again.

### 2.6 The merge-method rules overlap

Where rulesets overlap, the most restrictive version of each rule applies. The
merge methods left are those every matching ruleset allows, and the highest
approval count wins. That leaves:

- `dev` with squash and merge;
- `main` with merge;
- `beta` with all three, so a squashed or rebased promotion into `beta` is one
  click away.

`alpha` and `1.x` do not exist, and no ruleset names them. Nothing has been
published from an `alpha` branch since 1.1.0-alpha.22, on 2025-09-05, though
`release.config.cjs`, `release.yml` and `test.yml` all still name it.

### 2.7 A tag sits on a commit only its release branch has

semantic-release works out a branch's next version from the tags that branch
can reach (`git tag --merged`). The tag goes on the release commit, which only
the release branch has. `dev` reaches `v1.5.0` only because #394 merged `main`
in on 2026-09-28, and it cannot reach `v2.0.0-beta.*` at all. Nothing in the
process says when to merge back. So 1.2 to 1.5 went dev → main directly,
`beta` sat at 1.3.0-beta.2 from 2026-08-27, and #394 had to land before the
2.0 beta.

### 2.8 A channel name in the code

`APIMATIC_SCHEMA_URL` (`src/types/apimatic-config/document.ts:14`, explained
by the comment above it) and `apimatic.schema.json`'s `$id` name the `@beta`
dist-tag (#406). Quickstart writes that URL into every scaffolded
`apimatic.json` (`src/actions/quickstart.ts:100,121`). A promotion moves beta's
commits to `main` unchanged, so 2.0.0 would scaffold a `$schema` that follows
the beta line. The CLI never fetches the URL; only editors use it.

### 2.9 Smaller gaps

- `release.yml` has no `concurrency` group, so two quick merges into one branch
  race for the same version.
- Tests (`test.yml`) runs on pull requests only, and nothing requires it to
  pass. `release.yml` builds but does not test.
- `check_build.yml` builds on Node 24 and 26 for PRs into `alpha`, `dev` and
  `beta`, which Tests already does on three operating systems.
- "Allow GitHub Actions to create and approve pull requests" is on
  (`can_approve_pull_request_reviews: true`). Any workflow's token can then
  approve a PR, including a workflow that a PR adds for itself, and that
  approval satisfies an approval rule.
- `.ai/instructions.md` says the default branch is `beta` (it is `dev`) and
  forbids targeting `main`, which a hotfix has to do.

## 3. Decisions

| # | Decision | Rejected, and why |
|---|---|---|
| D1 | Release notes live in GitHub Releases only. `@semantic-release/git` and `@semantic-release/changelog` go, so a release pushes no commit. semantic-release itself pushes only tags (`git push --tags`) and `refs/notes/semantic-release-*` (its `lib/git.js`), and branch rulesets do not cover either. | Keeping `CHANGELOG.md` on `main` only needs a GitHub App on the bypass list, a secret, a token step, and the commit merged back every time. Keeping it on every branch is today's drift (2.2), with the toggle swapped for the App. `CHANGELOG.md` is not in `package.json` `files`, so npm users never saw it. |
| D2 | `beta` takes PRs only from `dev`; `main` takes only `beta` and hotfix branches. A required check enforces it (7.2, item 4). | A longer chain, with an alpha stage before beta, adds a PR to every beta for no extra safety. Allowing dev → main means a stable can ship code no beta tester ran, as 1.2 to 1.5 did. |
| D3 | A squash commit into `dev` is the PR title plus the PR description. Only the title decides the version and the notes line: a breaking change takes `!` in the title, and the parser ignores notes and issue references in the body (7.2, item 1). | Title only drops the why from `git log` and `git blame`; it survives only on the PR. Commit messages (today) cause 2.3. Asking authors to avoid footer-like wording fails silently, because of the pattern described in 2.3. |
| D4 | Both semantic-release plugins use the `conventionalcommits` preset. | `angular` (2.4). |
| D5 | A PR into a release branch needs 1 approval, from anyone with write access, and a green Tests matrix. | Without a gate, a red build can publish. |
| D6 | Workflows can no longer open or approve PRs. | Requiring a code owner's approval instead: only two owners in `.github/CODEOWNERS` resolve, and one of them approved none of the last 60 merged PRs, so most promotions would need the admin bypass. Keeping the setting with a plain approval: a PR could approve itself (2.9). |
| D7 | `1.x` is created only if a 1.x patch is ever needed, from `v1.5.0`. | Creating it now: nothing ships on it yet, and it needs the bootstrap PR in 7.6 either way. |
| D8 | After every push to `main`, the release run merges `main` into `dev` with a merge commit and pushes it. It pushes with a deploy key, the only bypass actor on dev's ruleset, kept in a `back-merge` environment that admits only `main`. `dev → beta` is refused while `dev` lacks `main`. | A manual back-merge: the one step anyone could forget, and a forgotten one ships a mis-numbered beta. A GitHub App: more to create and maintain for the same bypass. `@saithodev/semantic-release-backmerge`: it rebases by default, which loses the tag, and it puts the push credential inside the publishing job. A fast-forward promotion that would make the back-merge unnecessary: GitHub cannot fast-forward a PR merge. |
| D9 | No `alpha` branch: `main` and `beta` are the release branches, and `release.config.cjs`, `release.yml` and `test.yml` stop naming `alpha`. | Keeping it: nothing has shipped on it since 1.1.0-alpha.22, and a second prerelease line costs a promotion PR, a ruleset entry and a gate case each time. Keeping it dormant in the config: an `alpha` branch created by accident would publish on its first push. |
| D10 | `dev`'s ruleset allows only squash. The release run's back-merge pushes past it with the deploy key. The only PRs into `dev` that must be merge commits, the conflict path's `<name>/merge-main` and the linked main → dev PR before the key exists, need an admin to add merge commit to the ruleset's allowed methods for that merge and remove it afterwards. | Allowing both methods on `dev`: whoever merges picks from a dropdown, and a feature PR merged with a merge commit lands its branch's commits on `dev` unlinted, since `Commit messages` reads only the title. Each one that parses as a conventional commit gets a line in the notes and can move the version, and no check catches it. A dispatched job that fast-forwards `dev` to the resolved branch with the key, so that no ruleset is touched: another guarded use of the key, and it skips the PR's approval unless the job checks it. |

## 4. The model

| Branch | Takes PRs from | Merge method | Publishes |
|---|---|---|---|
| `dev` | feature and fix branches; the release run's back-merge from `main`, or a `<name>/merge-main` branch when it conflicts | squash, the only method the ruleset allows; a back-merge is a **merge commit**, pushed past the ruleset by the release run or let through by an admin (D10) | nothing |
| `beta` | `dev` | merge commit | `x.y.z-beta.N` → `beta` |
| `main` | `beta`; hotfix branches cut from `main` | merge commit | `x.y.z` → `latest` |
| `1.x` | fix branches cut from `1.x` | merge commit | `1.x.y` → `release-1.x` |

1. **A release branch takes only merge commits.** semantic-release reads every
   commit on the branch to choose the version and write the notes. A squash
   collapses a promotion into one commit. That commit either isn't a
   conventional commit (no release) or duplicates changes that will arrive
   again (2.5). A rebase gives the commits new hashes, so the release branch
   stops containing dev's commits and the next promotion conflicts.
2. **Only `dev` squashes, and `dev` only squashes**, so one PR is one commit
   and one line in the notes. The PR title is the line users read, and
   `Commit messages` refuses a title that is not a conventional header before
   the PR can merge. Its ruleset allows no other method (D10): a feature PR
   merged with a merge commit would land commits nobody linted, and the next
   promotion would read every one of them.
3. **After every push to `main`, stable release or hotfix, `main` is merged
   into `dev` with a merge commit, and the release run does it (D8).** The
   `v2.0.0` tag sits on main's merge commit. Until `dev` can reach it, the
   betas cut from `dev` can't either, and the next beta comes out as
   `2.0.0-beta.4` instead of `2.1.0-beta.1` (section 5). So `dev → beta` is
   refused while `dev` lacks `main`. A squashed back-merge brings the content
   but not the tag. A beta release needs no back-merge: no other branch's next
   version depends on beta's tags.
4. **`beta` contains `main` before it is promoted.** After a hotfix, the
   back-merge and one dev → beta promotion come before the next beta → main, so
   that PR cannot conflict. Its "Resolve conflicts" button would commit to
   `beta`, which the ruleset blocks. `Promotion source` refuses a beta → main
   that breaks this rule.
5. **`1.x` is never merged into `main` or `dev`.** A fix both lines need is
   made twice: on a branch from `1.x`, and on a branch from `dev`.
6. **Code never names a channel.** A promotion ships beta's commits unchanged
   as the stable release (2.8).

## 5. Versions each step produces

Every row but the last was produced by the simulation in section 10, starting
from today's branches and tags. The last follows from the commit analyzer's
release rules.

| Step | Result |
|---|---|
| dev → beta, once 7.2 and a `fix:` are on `dev` | `2.0.0-beta.3`. The tag is on the promotion's merge commit; `beta` gains no commit. |
| beta → main | `2.0.0` on `latest` |
| a `feat` on `dev`, dev → beta **without** the back-merge | `2.0.0-beta.4`, the failure rule 3 prevents; `Promotion source` now refuses that promotion |
| back-merge, then the same dev → beta | `2.1.0-beta.1` |
| hotfix → main | `2.0.1`; after the back-merge, beta continues at `2.1.0-beta.2` |
| `1.x` from `v1.5.0` with the bootstrap PR (7.6), then a `fix` | `1.5.1` on `release-1.x` |
| `1.x` from `v1.5.0` **without** the bootstrap PR | nothing: 1.5.0's `release.config.cjs` has no `1.x` entry, and 1.5.0's `release.yml` does not trigger on `1.x` |
| a promotion with no new `feat`, `fix`, `perf` or `revert` commit and nothing marked `!` | nothing ("no relevant changes") |

A prerelease's notes list only what changed since the previous prerelease on
the same branch. A stable release's notes list everything since the previous
stable release.

The preset links a bare `@name` in a title to a GitHub user, so a title that
says `@2` renders as a link to github.com/2. Write "2.x" instead.

## 6. What the notes look like

Take a `feat(sdk)!:` squash and a `fix(portal):` squash whose description has
`* Breaking change: none`, `Follow-up to #394` and
`Fixes apimatic/apimatic-io#2259`. Add a `docs:` squash and a promotion's merge
commit. With 7.2's configuration, the notes are:

```markdown
### ⚠ BREAKING CHANGES

* **sdk:** retire v3 generation (#359)

### Features

* **sdk:** retire v3 generation ([#359](…)) ([bbbbbbb](…))

### Bug Fixes

* **portal:** keep the header on one line ([#398](…)) ([aaaaaaa](…))
```

The version is major, from the `!` alone. Nothing from either description
reaches the notes, and the `docs:` commit and the merge commit are hidden.
GitHub still closes the issues a description's `Fixes #N` names when the PR
merges into `dev`, the default branch. What the notes lose is the `closes …`
suffix, which also linked private `apimatic-io` issues from public notes.

## 7. Steps

### 7.1 Repository settings (admin)

- Pull Requests → Allow squash merging → default message: **Default to pull
  request title and description** (API: `squash_merge_commit_title=PR_TITLE`,
  `squash_merge_commit_message=PR_BODY`). The person merging can still edit the
  message in the merge dialog.
- Allow merge commits → keep **Default message**: `Merge pull request #N from
  …`, with the PR title as its body. Its header isn't a conventional commit, so
  the notes skip it.
- Untick **Allow rebase merging**. Nothing uses it, and rule 1 forbids it.
- Actions → General → Workflow permissions: untick **Allow GitHub Actions to
  create and approve pull requests** (D6). No workflow here opens or approves a
  PR today.

The last two settings can change at any time. The squash message changes right
after 7.2 merges into `dev`, because until then the parser still reads commit
bodies (2.3). Every promotion from then on carries 7.2's configuration.

### 7.2 The pipeline PR

Branch `saeedjamshaid/release-pipeline` → `dev`, titled
`ci(release): publish from the merge commit, without a release commit`. A
`ci` commit releases nothing by itself.

1. `release.config.cjs` drops `alpha` from its branches (D9) and becomes:

   ```js
   // A squash commit's body is its PR description; only the header may decide a version or a notes line.
   const headerOnly = { noteKeywords: null, issuePrefixes: null, fieldPattern: null };

   module.exports = {
     branches: [ "1.x", "main", { name: "beta", prerelease: true } ],
     plugins: [
       [
         "@semantic-release/commit-analyzer",
         {
           preset: "conventionalcommits",
           parserOpts: headerOnly,
           releaseRules: [
             { breaking: true, release: "major" },
             { type: "revert", release: "patch" }
           ]
         }
       ],
       ["@semantic-release/release-notes-generator", { preset: "conventionalcommits", parserOpts: headerOnly }],
       "@semantic-release/npm",
       "@semantic-release/github"
     ]
   };
   ```

   - `noteKeywords: null` gives the parser its built-in never-match notes
     pattern, so no body line makes a note. The preset's `!` header pattern
     still makes the breaking note. (`noteKeywords: []` would be a trap: it
     builds a pattern that matches every indented line.)
   - `issuePrefixes: null` stops the parser collecting references.
   - `fieldPattern: null` stops a `-name-` line in a description from writing
     into a commit field. With the default, `-notes-` crashes the notes
     generator, and `-revert-` makes a `docs:` commit release a patch.
   - `releaseRules`: a revert squash has no "This reverts commit" line, so a
     `revert(scope):` header releases a patch by its type. A matched custom
     rule skips the defaults, so the breaking rule comes first.
   - The notes still link the `(#N)` in a subject, because the writer finds that
     itself.
   - One body line still reaches the notes: the writer shows a hidden-type
     commit (a `chore:`) whose body has a `Release-As: x.y.z` line. No parser
     option covers it, and no description in this repository has one.
   - The header comment about beta.19 and the git-notes migration describes a
     config that no longer exists, and goes. The one-line reason for `1.x`
     stays.
2. `package.json` devDependencies:
   - remove `@semantic-release/changelog` and `@semantic-release/git`;
   - add `conventional-changelog-conventionalcommits` at `^9.3.1`, the version
     `@commitlint/config-conventional` already brings, so pnpm's 7-day age guard
     is not involved. Without a direct entry, the preset resolves only through
     pnpm's hoisting into `node_modules/.pnpm/node_modules`;
   - add `@semantic-release/commit-analyzer` `^13.0.1` and
     `@semantic-release/release-notes-generator` `^14.1.1`, the versions
     semantic-release 25.0.3 bundles (pnpm resolves one copy of each), for the
     test in item 8.
3. `.github/workflows/release.yml`:
   - A per-branch concurrency group, in block style (a flow mapping cannot hold
     `${{ }}`). A second merge then waits for the first run instead of racing
     it:

     ```yaml
     concurrency:
       group: release-${{ github.ref_name }}
       cancel-in-progress: false
     ```

   - A `back-merge` job (D8), on `main` only. It needs the release job, and it
     runs even when that job failed, because the tag may already be on `main`.
     It runs in the `back-merge` environment with a read-only token, and
     times out after ten minutes, so a hung push cannot hold the next release
     behind the concurrency group.
     - **With `BACK_MERGE_DEPLOY_KEY` set:**
       1. It checks out `dev` over SSH with the key.
       2. It merges `origin/main` with `--no-ff` as
          `chore: merge main into dev`, and pushes to `dev`.
       3. A push that loses a race with another merge into `dev` (git's
          `fetch first` or `non-fast-forward` rejection) is retried twice after
          a fresh fetch. Any other rejection is a ruleset on `dev` that lacks
          the deploy-key bypass: the job fails at once, and its summary says so.
       4. When `dev` already contains `main`, the merge is a no-op and the job
          succeeds.
       5. On a conflict, the job aborts the merge, leaves `dev` alone, fails,
          and says in the run summary how to finish it by hand, the ruleset
          step of D10 included.
     - **Without the key** (before 7.3's setup): it writes the compare link
       into the run summary, with the PR title filled in and the same ruleset
       step, for a person to open. So this PR can merge before the key exists.
   - The `permissions` block moves from the workflow to the `release` job, so
     each job states its own token, and the `contents: write` comment stops
     mentioning "version commits". SonarCloud fails the gate on a
     workflow-level write permission (S8233).
   - `actions/checkout` and `actions/setup-node` are pinned by commit, as in
     `test.yml`.
   - `alpha` leaves the `push` triggers (D9); `test.yml` drops it from its
     `pull_request` triggers as well.
4. `.github/workflows/pull-requests.yml`, new, on `pull_request` (opened,
   edited, synchronize, reopened) into `dev`, `beta` and `main`, with
   one concurrency group per PR that cancels a superseded run. The job names
   are the required checks of 7.3, which a comment in the file says.
   - **`Commit messages`**, one job with one install, for the two subjects a
     commit message has here:
     - **PRs into `dev`:** the PR title, which becomes the squash commit's
       header. It is linted with `.github/commitlint-pr-title.cjs`, which
       extends the repo's config with `defaultIgnores: false`. Otherwise
       commitlint waves through titles such as GitHub's `Revert "…"`,
       `Merge …`, `fixup! …` and a bare `2.0.1`, all of which release
       nothing. The title is passed in through an environment variable, never
       interpolated into the script. It is a required check on `dev` too
       (7.3): the title is the one thing that decides a release, and the job
       runs on every PR into `dev` anyway.
     - **Hotfix PRs into `main`** (head not `beta`): commitlint
       `--from <base sha> --to <head sha>` after a checkout with
       `fetch-depth: 0`, because a hotfix lands with its own commits.
       Promotions skip it: their commits are dev's squash commits, already
       linted by title, and a failure there could not be fixed without
       rewriting `dev`.
   - **`Promotion source`**, for every PR, enforcing D2 and rules 3 to 5:
     - into `dev`: the head must not be `1.x`;
     - into a release branch: the head must be a branch of this repository;
     - into `beta`: the head must be `dev`, and `dev` must contain
       `main`. A back-merge that didn't happen (a conflict, or no key yet)
       blocks the next prerelease instead of mis-numbering it;
     - into `main`: the head must not be `dev` or `1.x`;
     - into `main` from `beta`: `beta` must contain `main`
       (`git merge-base --is-ancestor`). That enforces rule 4, and rule 3's
       back-merge along with it;
     - into `main` from any other branch: none of the head's unreleased
       commits may be on `dev`. A branch cut from `dev` under any name is
       refused, while a branch cut from `main` passes.

     It checks out history only for PRs into a release branch.
   - A job skipped by `if:` reports success, so both checks can be required on
     every release branch (7.3). A check whose workflow never runs stays pending
     and blocks the merge. Skipping on body-only edits would be wrong for the
     same reason: the skipped run would report success over a failing one on
     the same commit.
   - Not `1.x`. A `pull_request` run uses the workflows in the PR's merge commit
     (the target branch plus the PR's changes). A `1.x` cut from `v1.5.0`, and
     an ordinary fix branch cut from it, carry neither this file nor `test.yml`
     (7.6).
   - Of the 47 squash titles on `dev` since 1.5.0, 45 pass. The other two exceed
     `header-max-length` (100) only because of GitHub's ` (#N)` suffix, which
     the title check never sees.
5. `.ai/instructions.md`:
   - **Branching:**
     - say that the default branch is `dev`;
     - add the table and rules from section 4, and the hotfix exception to
       "never target main";
     - in the Worktrees paragraph, start new worktrees from `origin/dev`
       explicitly.
   - **Branching, the back-merge:**
     - the release run makes the back-merge itself, and a promotion is refused
       without it;
     - the conflict path's `<name>/merge-main` branch, cut from `dev`, is
       merged with a merge commit, because a squash there loses the tag, and
       an admin widens dev's ruleset for it (D10).
   - **Commit Conventions:**
     - the PR title becomes the squash commit's header;
     - a revert PR is titled `revert(scope): …` and releases a patch; the
       title check refuses GitHub's `Revert "…"`;
     - a breaking change takes `!` in the header of any commit, and a
       `BREAKING CHANGE:` footer alone is ignored.
   - `.ai/plans/apimatic-config.md:82` still prescribes a footer in PR
     descriptions; mark that line superseded by D3.
6. Delete `.github/workflows/check_build.yml` (2.9). No ruleset requires its
   checks.
7. Leave `CHANGELOG.md` alone. Editing it on `dev` now would conflict with
   beta's copy on the next promotion; 7.4 retires it once `dev` holds main's
   copy.
8. `commitlint.config.cjs` gets a local rule, `breaking-change-in-header`. It
   refuses a commit whose body carries a `BREAKING CHANGE` or
   `BREAKING-CHANGE` note while its header has no `!`. The release ignores
   every body, not only a squash's, so a hotfix commit's footer-only breaking
   change would otherwise ship to `latest` as a patch. The husky hook and the
   hotfix range lint both apply it. The parser's own match is case-insensitive
   and allows `*` or `|` before the keyword, so the rule looks at the note's
   title: a body line such as `* Breaking change: none` does not count.
   `test/commitlint-config.test.ts` runs the CLI, as the hook and the title
   check do, over the footer, the `!` header, that body line, and GitHub's own
   `Revert "…"` and `Merge …` titles.
9. `test/release-config.test.ts`, with the two plugins typed in
   `test/semantic-release-plugins.d.ts`, runs the analyzer and notes generator
   with `release.config.cjs`'s own options:
   - a `fix:` whose description holds the lines of section 6 plus `-notes-`
     releases a patch, and its notes show neither BREAKING nor `closes`;
   - a `feat!:` releases a major, with a BREAKING section;
   - `revert(scope):` releases a patch, and `revert(scope)!:` a major;
   - a promotion merge commit and a `docs:` commit release nothing.

   With the parser options emptied, the first two fail; the first crashes on
   `-notes-`. A preset or parser bump that changes what these options mean
   fails the Tests matrix instead of a release.

Verification:

- `pnpm install --frozen-lockfile` after the lockfile update.
- Re-run section 10's simulation with this PR's exact `release.config.cjs`, the
  npm and GitHub plugins swapped for the notes recorder; it must reproduce
  section 5.
- Lint the workflows with actionlint.
- Run the workflow's own scripts, read from the YAML, against every promotion
  and title case, the ancestry cases on the real `origin/main`, `origin/dev`
  and `origin/beta` included.
- Run the back-merge job's script, read from the YAML, against a throwaway
  bare repository in four cases: a release commit `dev` lacks (a merge
  commit lands on `dev`), `dev` already containing `main` (no new commit),
  a conflicting hotfix (the job fails and says so, leaving `dev` untouched),
  and a push the repository refuses (the job fails after one attempt and names
  the ruleset bypass).
- Open a throwaway PR into `beta` from a branch other than `dev` and see
  `Promotion source` fail; close it unmerged.
- The first real run is 7.4, step 2.

### 7.3 Rulesets (admin), once 7.2 is merged into `dev`

| Ruleset | Targets | Rules | Bypass |
|---|---|---|---|
| `dev` (rename `dev branch merge method`) | `refs/heads/dev` | require a pull request; allowed merge method: **squash** only (D10); 1 approval (what `no-direct-commits` enforced); required checks `Commit messages` and `Promotion source`; up to date off; block force pushes and deletion | **deploy keys**, mode **always**: the back-merge key below is the only one |
| `release branches` (replaces `main branch merge method`) | `refs/heads/main`, `refs/heads/beta` | require a pull request; allowed merge method: **merge commit** only; 1 approval; required checks `ubuntu-latest / Node 24`, `ubuntu-latest / Node 26`, `windows-latest / Node 24`, `windows-latest / Node 26`, `macos-latest / Node 24`, `macos-latest / Node 26`, `Commit messages`, `Promotion source`; **require branches to be up to date: off**; block force pushes and deletion | repository admin, mode **pull requests only** |
| `release tags` (new, targets tags) | `refs/tags/v*` | restrict updates; restrict deletions. Creations stay allowed, because semantic-release creates the tags. | repository admin, mode **always** (a tag cannot be deleted through a PR) |
| `no-direct-commits` | | deleted last, once the three above are active, so no branch is ever unprotected | |

- **"Up to date" must stay off.** A release branch always has promotion merge
  commits that `dev` never gets. So every promotion PR would count as out of
  date forever, and "Update branch" would commit to the release branch.
- **Squash only on `dev` (D10).** The back-merge key bypasses the whole
  ruleset, so the restriction never touches the release run. A
  `<name>/merge-main` PR, or the linked main → dev PR before the key exists,
  are the only PRs into `dev` that must be merge commits. Their merge button
  offers only **Squash and merge** until an admin adds **merge commit** to the
  ruleset's allowed merge methods; the admin merges the PR with **Create a
  merge commit** and removes the method again. While it is widened, `dev`
  still requires a pull request, one approval and both checks.
- **A PR into `dev` opened before 7.2 merged reports the two checks only after
  its next event.** Editing its title once is enough; the workflow runs on
  `edited`.
- **`1.x` joins a ruleset only after it exists.** A ruleset with required
  checks blocks creating a branch it targets, and no commit on `dev` carries
  those checks. So it is created first and protected minutes later (7.6).
- **It is safe to switch before any promotion.** A release run reads
  `release.config.cjs` from the commit it releases, so the first promotion that
  carries 7.2 already pushes no commit. A run that somehow still had the old
  config would fail at the git plugin's push, before tagging or publishing.
- **The admin bypass exists for two cases, both merged through the PR:**
  - a required check that flaked (the e2e prerender fetch does);
  - a hotfix into `main` before 2.0.0 ships. `main` is at 1.5.0 until then, so
    a branch cut from it has no `test.yml` or `pull-requests.yml`, and the
    required checks would never report.

  Nobody pushes past the bypass.

**The back-merge key (D8).** Set it up after `no-direct-commits` is deleted. A
bypass belongs to one ruleset, so while a second ruleset still requires a pull
request on `dev`, the key's push is refused, and the job's summary says so.
Until the key exists, the release run prints the back-merge link instead of
pushing.

1. Generate a key pair on your machine:
   `ssh-keygen -t ed25519 -N "" -C "back-merge" -f back-merge`.
2. Settings → Deploy keys → Add deploy key: paste `back-merge.pub`, and tick
   **Allow write access**. The repository had no deploy keys on 2026-09-30,
   so the `dev` ruleset's "deploy keys" bypass admits this key alone. Add any
   later deploy key read-only.
3. Settings → Environments → `back-merge` (the first run on `main` creates it,
   or create it by hand):
   - under **Deployment branches and tags**, choose **Selected branches** and
     add `main` only, so no workflow a PR runs can read the key;
   - add the secret `BACK_MERGE_DEPLOY_KEY` with the contents of `back-merge`,
     the private half.
4. Delete both files from your machine.

The only ruleset the key gets past is `dev`'s. `main`, `beta` and existing
tags stay behind rulesets that list no deploy keys.

### 7.4 Ship 2.0.0 on the new pipeline

1. PR into `dev`: `fix(config): point apimatic.json's $schema at the 2.x
   releases`. It moves the URL from `@beta` to `@2` in:
   - `APIMATIC_SCHEMA_URL` and the comment above it
     (`src/types/apimatic-config/document.ts:9-14`);
   - `apimatic.schema.json`'s `$id`;
   - `test/resources/portal-inputs/branded/src/apimatic.json`;
   - `.ai/plans/portal-config.md:145,581-586`.

   jsDelivr resolves `@2` only once 2.0.0 exists. So the release candidate
   scaffolds a `$schema` that 404s until the stable ships; only editors notice.
2. PR dev → beta, **Create a merge commit** → `2.0.0-beta.3`, the release
   candidate. Check the run:
   - no commit was pushed to `beta`, and `v2.0.0-beta.3` is on the merge commit;
   - `npm view @apimatic/cli dist-tags` shows `beta: 2.0.0-beta.3`;
   - the GitHub prerelease lists only the schema fix.

   If the run fails, follow section 8.
3. Test the candidate.
4. PR beta → main, merge commit → `2.0.0` on `latest`; GitHub marks the release
   Latest.
5. Curate 2.0.0's GitHub release notes by hand, once, starting from the curated
   2.0.0-beta.1 notes. The generated notes are about 60 lines, with the three
   `!` subjects under BREAKING CHANGES. What they cannot know:
   - breaking changes whose commits carry no `!`: the 1.x portal commands #343
     removed, and the move to `apimatic.json` (#348). The curated notes already
     describe both;
   - fixes to 2.0-only work are left out of these notes.
6. Check the release run's `back-merge` job: `dev` now contains `main`. Without
   the key yet, open the back-merge from the link in its summary, have an admin
   widen dev's ruleset (7.3), and merge it with **Create a merge commit**.
7. PR into `dev`: `chore: retire CHANGELOG.md and the committed version`.
   `dev` now has main's copies, so there is no conflict.
   - `CHANGELOG.md` opens with a line pointing at GitHub Releases. It keeps the
     history up to 1.5.0 and drops the 2.0.0-beta sections, which live in the
     releases.
   - `package.json`'s `version` becomes `0.0.0-development`. Otherwise it stays
     at `2.0.0-beta.2` forever, because nothing commits a version any more. The
     published package still gets the real version: `@semantic-release/npm`
     writes it before `npm publish`. A build run from source reports the new
     value in its User-Agent (`src/infrastructure/env-info.ts:30-33`).

### 7.5 After 2.0.0

The `beta` dist-tag stays on `2.0.0-beta.3` until the next beta, so
`npm install @apimatic/cli@beta` installs an older build than `latest` in the
meantime. No action is needed.

### 7.6 If a 1.x patch is ever needed

A `1.x` cut from `v1.5.0` runs 1.5.0's workflows. 1.5.0 has:

- `release.yml`;
- `check_build.yml`, with jobs `Node 22 sample` and `Node 24 sample`,
  triggered on `alpha`, `dev` and `beta`;
- `npm-tag-latest.yml`.

It has no `test.yml` and no `pull-requests.yml`. Its lockfile resolves
`conventional-changelog-conventionalcommits` to 4.6.3 (via
`@commitlint/config-conventional` 15), an older preset than 7.2's.

1. Create `1.x` from tag `v1.5.0`. 1.5.0's `release.yml` does not trigger on
   `1.x`, so creating it runs nothing.
2. Add a `1.x` ruleset: require a pull request; merge commit only; 1 approval;
   required checks `Node 22 sample` and `Node 24 sample`; up to date off; block
   force pushes and deletion; the same admin bypass as `release branches`.
3. The first PR into `1.x` is `ci(release): release 1.x from the merge commit`:
   - 1.5.0's `release.yml` gets `1.x` in its triggers, plus the concurrency
     group, and its `permissions` move onto the job (SonarCloud's S8233 fails
     the gate on a workflow-level write permission, as it did on this PR);
   - 1.5.0's `check_build.yml` gets `1.x` in its triggers, so this PR and every
     later one report the checks step 2 requires;
   - its `release.config.cjs` gets 7.2's plugins, parser options and `1.x` in
     `branches`;
   - `package.json` gets `conventional-changelog-conventionalcommits` at
     `^9.3.1` as a direct devDependency.

   Before merging it, re-run the simulation against a 1.5.0 install, because
   section 5's 1.x row ran dev's `node_modules`. Without this PR:
   - a push to `1.x` releases nothing;
   - the old git plugin would try to push a commit;
   - no PR into `1.x` could satisfy its required checks.
4. Fix branches cut from `1.x` → PR → merge commit → `1.5.1` on `release-1.x`.
5. If 2.x needs the same fix, make it separately on a branch from `dev`
   (rule 5).

## 8. Day to day

- **Feature or fix:** branch from `dev` → PR → **Squash and merge**. Title it
  `type(scope): summary`, with `!` if it breaks something, and explain the
  change in the description.
- **Beta:** PR `dev → beta` → **Create a merge commit**.
- **Stable:** PR `beta → main` → **Create a merge commit**. The release run
  then merges `main` back into `dev` by itself.
- **Hotfix:**
  1. Branch from `main`, make one conventional commit, and open a PR into
     `main`.
  2. Merge it with a merge commit. The release run back-merges it into `dev`.
  3. Promote dev → beta before the next beta → main (rule 4).
- **A back-merge the run could not make** (its `back-merge` job failed on a
  conflict): GitHub's "Resolve conflicts" button would commit to `main`, which
  the ruleset blocks. Until this is done, `dev → beta` is refused. Instead:
  1. Cut a `<name>/merge-main` branch from `dev`.
  2. Merge `origin/main` into it, resolve the conflicts, and open the PR into
     `dev`.
  3. An admin adds **merge commit** to dev's ruleset, merges the PR with
     **Create a merge commit**, and sets the ruleset back to squash only.
     Until then the merge button offers only **Squash and merge**.

When something goes wrong:

- **A hand-made back-merge was squashed.** `dev` still lacks main's commit, so
  the next `dev → beta` is refused. Make the back-merge again, with the
  ruleset widened and a merge commit; the content is already there, so only
  the ancestry changes.
- **The back-merge push was refused.** A ruleset that requires a pull request
  on `dev` does not list deploy keys as a bypass actor (7.3). Fix the ruleset
  and re-run the job.
- **A release run failed.** Check first whether the run pushed its tag.
  semantic-release tags, pushes the tag, pushes the tag's note, and only then
  publishes.
  - **No tag:** re-run the job.
  - **Tag, but no `refs/notes/semantic-release-<tag>`:** the tag reads as
    channel `null`, so beta ignores it and the next run tries to
    create the same tag again. Add the note by hand and push it:
    `git notes --ref semantic-release-<tag> add -m '{"channels":["beta"]}' <tag>`,
    then `git push origin refs/notes/semantic-release-<tag>`. Use the branch's
    channel, and `[null]` for `main`.
  - **Tag and note, but npm or GitHub lacks the release:** a re-run finds
    nothing new to release. If npm has the version, create the GitHub release
    by hand from the notes in the run log. If npm doesn't have it, an admin
    deletes the tag and its note (the tags ruleset's bypass) and re-runs.
- **A required check flaked.** Re-run the failed jobs; an admin can merge
  through the PR bypass.

## 9. Follow-ups, not part of this plan

- `.github/CODEOWNERS` names `@aliasghar98`, whom GitHub reports as an unknown
  owner.
- `@semantic-release/github` comments on and labels every PR a release
  includes, at each prerelease and again at the stable. For 2.0.0-beta.1 that
  was every PR since 1.5.0. `successComment: false` on prerelease branches
  would cut that.
- A preview of the next version on promotion PRs. semantic-release refuses to
  run for `pull_request` events, so this needs a dry run against a local merge.
- Stale branches: `master`, `v3`, the `v3-*` family, and merged topic branches.
  The README's License badge links `blob/master`, so deleting `master` needs
  that link changed first.
- The npm `alpha` dist-tag still points at 1.1.0-alpha.22, and nothing will
  publish there again (D9). `npm dist-tag rm @apimatic/cli alpha` retires it.
- `default_workflow_permissions` is `write`. `release.yml` declares its own
  permissions, so the default could be `read`. That is hygiene only; 7.1's
  setting is what stops workflows approving PRs.

## 10. Verification log

- **Presets and parser options.** A script ran the commit analyzer and notes
  generator that semantic-release 25.0.3 bundles.
  - **Samples:** the two commits of section 6, plus a `docs:` commit and a
    promotion's merge commit.
    - `angular`: the `feat!:` alone releases nothing and is missing from the
      notes.
    - `conventionalcommits` with its default parser: the `fix` whose
      description says `* Breaking change: none` makes the release a major,
      with three junk breaking notes and `closes` links.
    - With 7.2's parser options: section 6 exactly.
  - **Real history:** the 48 commits in `v1.5.0..origin/dev`, with 7.2's
    options.
    - Still major.
    - The notes shrink from 337 lines to 60, and the BREAKING section from 283
      lines to the three `!` subjects.
    - No `closes` remains.
- **Versions.** The simulation ran on a bare copy of the repository.
  - **Contents:** `dev` `74ad5d2e`, `beta` `8581f9e8`, `main` `c199698a`, every
    tag, and every `refs/notes/semantic-release-*` from GitHub.
  - **Configuration:** 7.2's, with the npm and GitHub plugins swapped for a
    plugin that records the notes.
  - **Merges:** made with `--no-ff` and GitHub's merge message.
  - **Runs:** semantic-release 25.0.3 with `--no-ci` and a `file://`
    repository URL.

  semantic-release pushed tags and notes to the copy and never moved a branch;
  the results are section 5. The scripts live outside the repository because
  they hold machine paths.
- **Commit titles.** commitlint (the repo's config) over the 47 non-merge
  commits in `v1.5.0..origin/dev`: 45 pass (7.2, item 4).
- **Merges.** In a scratch clone, 7.2's `package.json` and lockfile edits:
  - resolve under the age guard, and `pnpm install --frozen-lockfile` passes;
  - merge into `origin/beta` cleanly;
  - leave beta → main and main → dev clean as well.
- **GitHub state, read on 2026-09-29:**
  - the rulesets and their history (2.1);
  - the repository merge settings;
  - Actions workflow permissions;
  - the check names on #406;
  - CODEOWNERS errors;
  - who approved the last 60 merged PRs.
- **Review.** An independent review checked the first draft's claims against
  the repository, GitHub, and semantic-release's source. The review produced:
  - the body-notes and references hazard (2.3);
  - branch creation under required checks;
  - the "up to date" setting;
  - the approval problem behind D6;
  - the missing `Promotion source` check;
  - the tag-without-note recovery;
  - the YAML flow-mapping error;
  - the committed-version drift.

  Each is folded in above.
- **Code review of 7.2.** A code review of the implementation found, and the
  implementation fixed:
  - `fieldPattern` still read the body;
  - a revert title that released nothing;
  - the title check waving through `Revert "…"` and `Merge …`;
  - footer-only breaking changes in hotfix commits;
  - name-only promotion checks;
  - the conflict path missing from the instructions;
  - the back-merge link skipped after a failed run;
  - duplicated setup steps, per-edit runs without a concurrency group, and a
    hard-coded repository URL.

  `Release-As:` is the one gap left, as 7.2 item 1 notes.
- **The back-merge, automated (D8).** Asked for because it was the one step
  that could be forgotten. Two changes:
  - the release run makes the back-merge with a deploy key;
  - `Promotion source` refuses `dev → beta` while `dev` lacks `main`.

  The job's script ran against a throwaway repository in its four cases. The
  gate ran against a `dev` that lacks `main` (`v1.3.0-beta.2`), and was refused.
  On 2026-09-30 the repository had no deploy keys and no environments.
- **Review of the whole PR (2026-09-30).** Found, and fixed here: the conflict
  summary's `<name>` placeholder, which GitHub's Markdown strips; a refused
  push retried as if it had lost a race, with the key set up before
  `no-direct-commits` was gone; the title check left advisory on `dev`; the
  commitlint rule tripping on a body line such as `* Breaking change: none`;
  that rule guarded by no test in the repository; and unpinned actions in the
  release job.
- **`alpha` dropped (D9, 2026-09-30).** The simulation re-ran without its alpha
  steps against this configuration: every `beta` and `main` row of section 5
  came out the same, and no branch moved. The promotion harness lost its three
  alpha cases.
- **`dev` restricted to squash (D10, 2026-10-02).** Asked for because a feature
  PR merged with a merge commit was the one wrong merge method nothing caught.
  The conflict path and the no-key path gain the admin step, in the job's two
  summaries, 7.3, 7.4, section 8 and the instructions. The job's script is
  unchanged.
