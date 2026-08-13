/**
 * Checks a MongoDB connection string without booting the whole API.
 *
 * Runs the same three steps the driver does — resolve, connect, authenticate —
 * and reports which one failed, because "querySrv ENOTFOUND" on its own does
 * not tell you whether the cluster is missing, asleep, or firewalled.
 *
 * Usage:  node scripts/check-db.mjs            (uses MONGODB_URI from .env)
 *         node scripts/check-db.mjs "mongodb+srv://..."
 */
import 'dotenv/config';
import dns from 'node:dns/promises';
import mongoose from 'mongoose';

const uri = process.argv[2] ?? process.env.MONGODB_URI;

if (!uri) {
  console.error('No connection string. Pass one as an argument or set MONGODB_URI in api/.env');
  process.exit(1);
}

const isSrv = uri.startsWith('mongodb+srv://');
const host = uri.replace(/^mongodb(\+srv)?:\/\/[^@]*@/, '').split(/[/?]/)[0];
const redacted = uri.replace(/\/\/([^:]+):[^@]+@/, '//$1:****@');

console.log(`Checking ${redacted}\n`);

// --- 1. DNS -----------------------------------------------------------------
process.stdout.write(`1. DNS resolve ${host} ... `);
try {
  if (isSrv) {
    const records = await dns.resolveSrv(`_mongodb._tcp.${host}`);
    console.log(`ok (${records.length} shard${records.length === 1 ? '' : 's'})`);
    for (const r of records) console.log(`     ${r.name}:${r.port}`);
  } else {
    const addrs = await dns.lookup(host.split(':')[0], { all: true });
    console.log(`ok (${addrs.map((a) => a.address).join(', ')})`);
  }
} catch (err) {
  console.log('FAILED');
  console.log(`\n   ${err.code ?? err.message}\n`);
  console.log('   The hostname does not exist in public DNS. That is almost always one of:');
  console.log('     • the Atlas cluster was deleted, or never finished provisioning');
  console.log('     • the hostname in the connection string has a typo');
  console.log('     • you are on a network that blocks SRV lookups (rare, and easy to rule out:');
  console.log('       `nslookup -type=SRV _matrix._tcp.matrix.org` should return records)');
  console.log('\n   Fix: open the Atlas dashboard, confirm the cluster is running, and re-copy');
  console.log('   the string from Connect → Drivers.');
  process.exit(1);
}

// --- 2. Connect + authenticate ---------------------------------------------
process.stdout.write('2. Connect and authenticate ... ');
try {
  await mongoose.connect(uri, { serverSelectionTimeoutMS: 15_000 });
  console.log('ok');
} catch (err) {
  console.log('FAILED');
  console.log(`\n   ${err.message}\n`);
  if (/Authentication failed|bad auth/i.test(err.message)) {
    console.log('   Credentials rejected. Check Atlas → Database Access.');
    console.log('   A password containing @ : / ? # [ ] must be percent-encoded.');
  } else {
    console.log('   Reached DNS but could not connect. Check Atlas → Network Access');
    console.log('   includes your IP (or 0.0.0.0/0 for platforms with non-fixed egress IPs).');
  }
  process.exit(1);
}

// --- 3. Read/write ----------------------------------------------------------
process.stdout.write('3. Write and read back ... ');
try {
  const probe = mongoose.connection.collection('_sprout_connectivity_probe');
  await probe.insertOne({ at: new Date() });
  await probe.deleteMany({});
  console.log('ok');
} catch (err) {
  console.log('FAILED');
  console.log(`\n   ${err.message}\n`);
  console.log('   Connected, but the user lacks write permission on this database.');
  console.log('   Check the role in Atlas → Database Access (readWriteAnyDatabase is typical).');
  process.exit(1);
}

const db = mongoose.connection;
const collections = await db.db.listCollections().toArray();

console.log(`\nConnected to database "${db.name}" on ${db.host}`);
console.log(`Collections: ${collections.length ? collections.map((c) => c.name).join(', ') : '(none yet — run `npm run seed`)'}`);

if (db.name === 'test') {
  console.log('\nNote: the connection string has no database path, so this is the default "test"');
  console.log('database. Add /sprout before the ? to keep the data somewhere deliberate.');
}

await mongoose.disconnect();
