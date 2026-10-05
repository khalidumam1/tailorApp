export function requireIsolatedTestDatabaseUrl(
  testDatabaseUrl: string | undefined,
  applicationDatabaseUrl?: string,
  allowSharedTestDatabase = false,
): string {
  if (!testDatabaseUrl) {
    throw new Error('RUN_DB_TESTS=true requires a dedicated TEST_DATABASE_URL');
  }

  let testUrl: URL;
  try {
    testUrl = new URL(testDatabaseUrl);
  } catch {
    throw new Error('TEST_DATABASE_URL must be a valid PostgreSQL URL');
  }

  if (!['postgres:', 'postgresql:'].includes(testUrl.protocol)) {
    throw new Error('TEST_DATABASE_URL must use PostgreSQL');
  }
  if (applicationDatabaseUrl) {
    const applicationUrl = new URL(applicationDatabaseUrl);
    if (testUrl.href === applicationUrl.href && !allowSharedTestDatabase) {
      throw new Error('TEST_DATABASE_URL must not match DATABASE_URL');
    }
    if (allowSharedTestDatabase && testUrl.href !== applicationUrl.href) {
      throw new Error('Shared development database testing must use the configured DATABASE_URL exactly');
    }
  } else if (allowSharedTestDatabase) {
    throw new Error('Shared development database testing requires DATABASE_URL to match');
  }

  if (!allowSharedTestDatabase) {
    if (!['localhost', '127.0.0.1', '::1', '[::1]'].includes(testUrl.hostname)) {
      throw new Error('Database integration tests are restricted to a local PostgreSQL server');
    }
    if (!/(?:test|acceptance)/i.test(decodeURIComponent(testUrl.pathname))) {
      throw new Error('TEST_DATABASE_URL must target a database named for testing or acceptance');
    }
  }

  return testDatabaseUrl;
}
