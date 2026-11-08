/** Result links stay open for drafts; library/public feeds require an explicit save. */
export function canAccessGroup(
  group: { deletedAt?: Date | null; isPublic: boolean; userSaved: boolean; ownerId?: string | null } | null | undefined,
  userId?: string,
): group is NonNullable<typeof group> {
  if (!group || group.deletedAt) return false;
  if (group.isPublic && group.userSaved) return true;
  if (userId && group.ownerId === userId) return true;
  // Draft collections remain reachable by their unguessable publicId while unsaved.
  if (!group.userSaved && !group.ownerId) return true;
  return false;
}
