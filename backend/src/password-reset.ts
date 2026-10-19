import type { Prisma } from '@prisma/client';

/**
 * Shared mechanics for admin-initiated password resets (Phase 1, F-001).
 *
 * An admin never learns or keeps the user's long-term password: the account is
 * flagged `mustChangePassword`, every existing session is revoked, and the
 * user must choose their own password at next sign-in. The caller is
 * responsible for authorization, the actual audit event (business vs platform
 * actions differ), and for hashing the new password *before* opening its
 * transaction (bcrypt is CPU work and must not hold a transaction open).
 */
export async function applyAdminPasswordReset(
  tx: Prisma.TransactionClient,
  userId: string,
  passwordHash: string,
): Promise<{ sessionsRevoked: number }> {
  await tx.user.update({
    where: { id: userId },
    data: { passwordHash, mustChangePassword: true },
  });
  const revoked = await tx.refreshToken.updateMany({
    where: { userId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
  return { sessionsRevoked: revoked.count };
}
