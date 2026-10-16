/** SecureStore permits only letters, digits, dots, hyphens and underscores. */
export function businessConfigurationCacheKey(businessId: string): string {
  // Encode every UTF-16 code unit so arbitrary IDs stay valid and distinct.
  // The previous colon-prefixed key was rejected by SecureStore, so there is
  // no valid native cache entry to migrate from that format.
  const encodedId = Array.from({ length: businessId.length }, (_, index) =>
    businessId.charCodeAt(index).toString(16).padStart(4, '0'),
  ).join('');
  return `business-config.v1.${encodedId}`;
}
