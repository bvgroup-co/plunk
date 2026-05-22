import {PrismaClient} from '@plunk/db';
import {execSync} from 'child_process';

/**
 * Test database helper
 * Manages test database isolation and cleanup
 */
class TestDatabase {
  private prisma: PrismaClient | null = null;

  async initialize() {
    // Use test database URL if provided, otherwise use main database
    const databaseUrl = process.env.TEST_DATABASE_URL || process.env.DATABASE_URL;

    if (!databaseUrl) {
      throw new Error('DATABASE_URL or TEST_DATABASE_URL must be set for testing');
    }

    // Raise Prisma's connection pool above its default (num_cpus * 2 + 1, ~5 on CI).
    // Bulk inserts in some tests (e.g. SecurityService) saturate the default pool
    // and time out. Test Postgres has max_connections=100, so 20 is well under budget.
    const url = new URL(databaseUrl);
    if (!url.searchParams.has('connection_limit')) {
      url.searchParams.set('connection_limit', '20');
    }
    if (!url.searchParams.has('pool_timeout')) {
      url.searchParams.set('pool_timeout', '20');
    }

    this.prisma = new PrismaClient({
      datasources: {
        db: {
          url: url.toString(),
        },
      },
    });

    // Connect to database
    await this.prisma.$connect();

    // Run migrations (only once per test suite)
    try {
      execSync('yarn workspace @plunk/db migrate:dev', {
        env: {
          ...process.env,
          DATABASE_URL: databaseUrl,
        },
        stdio: 'ignore',
      });
    } catch (error) {
      console.warn('Migration warning (may already be up to date):', error);
    }
  }

  /**
   * Get Prisma client instance
   */
  getClient(): PrismaClient {
    if (!this.prisma) {
      throw new Error('Database not initialized. Call initialize() first.');
    }
    return this.prisma;
  }

  /**
   * Clean up database after each test
   * Deletes all records in reverse order of dependencies
   * Uses batched deletes to prevent memory issues with large datasets
   * Retries on deadlock to handle race conditions with background event tracking
   */
  async cleanup() {
    if (!this.prisma) return;

    const maxRetries = 3;
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        // Use a transaction to ensure all deletes happen atomically
        // This prevents foreign key constraint violations and race conditions
        await this.prisma.$transaction([
          // Level 1: Delete deepest dependencies first
          this.prisma.event.deleteMany(),
          this.prisma.workflowStepExecution.deleteMany(),

          // Level 2: Delete entities that depend on Level 1
          this.prisma.email.deleteMany(),
          this.prisma.workflowExecution.deleteMany(),

          // Level 3: Delete workflow structure
          this.prisma.workflowTransition.deleteMany(),
          this.prisma.workflowStep.deleteMany(),
          this.prisma.workflow.deleteMany(),

          // Level 4: Delete campaigns and templates
          this.prisma.campaign.deleteMany(),
          this.prisma.template.deleteMany(),

          // Level 5: Delete segment relationships
          this.prisma.segmentMembership.deleteMany(),
          this.prisma.segment.deleteMany(),

          // Level 6: Delete contacts
          this.prisma.contact.deleteMany(),

          // Level 7: Delete domains
          this.prisma.domain.deleteMany(),

          // Level 8: Delete memberships (has FK to both user and project)
          this.prisma.membership.deleteMany(),

          // Level 9: Delete projects
          this.prisma.project.deleteMany(),

          // Level 10: Delete users last
          this.prisma.user.deleteMany(),
        ]);

        // Success - exit retry loop
        return;
      } catch (error) {
        lastError = error as Error;

        // Check if this is a deadlock error (PostgreSQL error code 40P01)
        const isDeadlock = error instanceof Error && error.message?.includes('deadlock detected');

        if (isDeadlock && attempt < maxRetries) {
          // Wait before retrying (exponential backoff)
          const delay = Math.pow(2, attempt) * 50; // 100ms, 200ms, 400ms
          await new Promise(resolve => setTimeout(resolve, delay));
          continue;
        }

        // Not a deadlock or out of retries
        break;
      }
    }

    // If we get here, all retries failed
    console.error(`Error cleaning up database after ${maxRetries} attempts:`, lastError);
    throw lastError;
  }

  /**
   * Disconnect from database
   */
  async disconnect() {
    if (this.prisma) {
      await this.prisma.$disconnect();
      this.prisma = null;
    }
  }

  /**
   * Execute raw SQL (useful for advanced test setup)
   */
  async executeRaw(sql: string) {
    if (!this.prisma) {
      throw new Error('Database not initialized');
    }
    return this.prisma.$executeRawUnsafe(sql);
  }

  /**
   * Reset database sequences (useful for predictable IDs in tests)
   */
  async resetSequences() {
    if (!this.prisma) return;

    // Get all tables with sequences
    const tables = [
      'User',
      'Project',
      'Contact',
      'Campaign',
      'Email',
      'Workflow',
      'WorkflowExecution',
      'Template',
      'Segment',
    ];

    for (const table of tables) {
      try {
        await this.prisma.$executeRawUnsafe(`ALTER SEQUENCE "${table}_id_seq" RESTART WITH 1`);
      } catch (error) {
        // Sequence might not exist, ignore
      }
    }
  }
}

// Export singleton instance
export const testDatabase = new TestDatabase();

// Export helper to get Prisma client in tests
// Returns a Proxy that lazily initializes the database on first property access
export const getPrismaClient = (() => {
  let clientProxy: PrismaClient | null = null;

  return () => {
    if (!clientProxy) {
      clientProxy = new Proxy({} as PrismaClient, {
        get(target, prop) {
          const client = testDatabase.getClient();
          const value = client[prop as keyof PrismaClient];
          // Bind methods to the actual client
          return typeof value === 'function' ? value.bind(client) : value;
        },
      });
    }
    return clientProxy;
  };
})();
