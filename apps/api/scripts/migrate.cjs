// Safely adopt the original db-push schema without resetting an existing local database.
const { PrismaClient } = require('@prisma/client');
const { spawnSync } = require('node:child_process');
const prisma = new PrismaClient();
function run(args) {
  const result = spawnSync('pnpm', ['exec', 'prisma', ...args], { stdio: 'inherit' });
  if (result.status !== 0) throw new Error(`Migration command failed (${result.status})`);
}
(async () => {
  const [tables] = await prisma.$queryRaw`SELECT to_regclass('public.slip_groups')::text AS groups, to_regclass('public._prisma_migrations')::text AS migrations`;
  const history = tables.migrations ? await prisma.$queryRaw`SELECT count(*)::int AS count FROM "_prisma_migrations"` : [{ count: 0 }];
  if (tables.groups && history[0].count === 0) {
    // Only baseline a database that exactly matches the committed original schema.
    run(['migrate', 'diff', '--from-url', process.env.DATABASE_URL, '--to-schema-datamodel', 'prisma/baseline.prisma', '--exit-code']);
    run(['migrate', 'resolve', '--applied', '202610160001_initial']);
  }
  run(['migrate', 'deploy']);
})().catch(error => {
  console.error(error.message);
  process.exitCode = 1;
}).finally(() => prisma.$disconnect());
