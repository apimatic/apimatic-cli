/** An operation git is in the middle of, by the file it leaves in the repository while it is. */
export const OPERATIONS = {
  MERGE_HEAD: 'merge',
  REBASE_HEAD: 'rebase',
  CHERRY_PICK_HEAD: 'cherry-pick',
  REVERT_HEAD: 'revert'
} as const;

export type GitOperation = (typeof OPERATIONS)[keyof typeof OPERATIONS];
