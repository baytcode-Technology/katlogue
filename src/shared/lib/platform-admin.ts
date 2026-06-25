export function getPlatformAdminUserIds(): string[] {
  return (process.env.PLATFORM_ADMIN_USER_IDS ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

export function isPlatformAdmin(userId: string): boolean {
  return getPlatformAdminUserIds().includes(userId);
}
