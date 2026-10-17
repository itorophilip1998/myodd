// Local-only, consistent-snapshot JSONL export. No public dataset endpoint.
const { PrismaClient } = require('@prisma/client');
const { createWriteStream, writeFileSync, linkSync, unlinkSync } = require('node:fs');
const { once } = require('node:events');
const { createHash } = require('node:crypto');
const prisma = new PrismaClient();
(async () => {
  const output = process.argv[2];
  if (!output) throw new Error('Usage: node scripts/export-training.cjs /tmp/myodd-training.jsonl');
  const partial = output + '.partial'; const stream = createWriteStream(partial, { flags: 'wx', mode: 0o600 });
  const hash = createHash('sha256'); let count = 0;
  await once(stream, 'open');
  const manifest = await prisma.$transaction(async tx => {
    const expected = await tx.trainingEvent.count(); let cursor;
    while (true) {
      const rows = await tx.trainingEvent.findMany({ take: 10, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }], ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}) });
      if (!rows.length) break;
      for (const row of rows) { const line = JSON.stringify(row) + '\n'; hash.update(line); count++; if (!stream.write(line)) await once(stream, 'drain'); }
      cursor = rows.at(-1).id;
    }
    if (count !== expected) throw new Error('Export count mismatch');
    return { schemaVersion: 1, records: count, expectedRecords: expected, sha256: hash.digest('hex'), exportedAt: new Date().toISOString(),
      labels: 'Generated tickets and user feedback are not verified outcome labels. Legacy records lack historical fixture context.' };
  }, { isolationLevel: 'RepeatableRead', timeout: 300000 });
  stream.end(); await once(stream, 'finish');
  linkSync(partial, output); unlinkSync(partial);
  writeFileSync(output + '.manifest.json', JSON.stringify(manifest, null, 2), { flag: 'wx', mode: 0o600 });
  console.log(JSON.stringify({ output, ...manifest }));
})().catch(error => { console.error(error.message); process.exitCode = 1; }).finally(() => prisma.$disconnect());
