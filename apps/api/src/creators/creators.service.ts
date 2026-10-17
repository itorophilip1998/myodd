export const creatorSelect = { publicId: true, username: true } as const;

export function creatorLabel(user: { publicId: string; username: string | null }) {
  return { publicId: user.publicId, username: user.username, name: user.username ? `@${user.username}` : `Creator ${user.publicId.slice(-6)}` };
}
