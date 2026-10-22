const IP_LIKE = /^[0-9a-fA-F:.]{2,45}$/;

/**
 * Identifies the caller for rate limiting. On Vercel the platform sets x-forwarded-for, so its first entry
 * is trustworthy; behind other proxies make sure the proxy overwrites this header (see SECURITY.md).
 */
export function getClientId(headers: Headers): string {
  const forwarded = headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  if (forwarded && IP_LIKE.test(forwarded)) return forwarded;
  const real = headers.get("x-real-ip")?.trim();
  if (real && IP_LIKE.test(real)) return real;
  return "unknown";
}
