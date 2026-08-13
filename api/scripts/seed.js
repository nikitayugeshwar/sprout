/**
 * Seeds a persistent demo account.
 *
 * The "Try the demo" button provisions throwaway accounts at runtime; this
 * script exists so a freshly deployed instance has one stable login you can
 * hand to a reviewer, and so local development starts with real data.
 *
 * Safe to re-run — it wipes and rebuilds only the demo user's records.
 */
import mongoose from 'mongoose';
import { config } from '../src/config/env.js';
import { connectDb, disconnectDb } from '../src/config/db.js';
import { User, Child, Measurement, MilestoneRecord, VaccineRecord } from '../src/models/index.js';
import { seedDemoData } from '../src/services/demo/generate.js';
import { assess, describeAge } from '../src/services/growth/index.js';
import { buildInsights } from '../src/services/insights/engine.js';

async function main() {
  if (!config.MONGODB_URI) {
    console.error('Seeding an in-memory database would be pointless — set MONGODB_URI first.');
    process.exit(1);
  }

  await connectDb();

  let user = await User.findOne({ email: config.DEMO_EMAIL });
  if (user) {
    const children = await Child.find({ userId: user._id }).select('_id');
    const ids = children.map((c) => c._id);
    await Promise.all([
      Measurement.deleteMany({ childId: { $in: ids } }),
      MilestoneRecord.deleteMany({ childId: { $in: ids } }),
      VaccineRecord.deleteMany({ childId: { $in: ids } }),
      Child.deleteMany({ userId: user._id }),
    ]);
    user.passwordHash = await User.hashPassword(config.DEMO_PASSWORD);
    await user.save();
    console.log(`Reset existing demo account ${config.DEMO_EMAIL}`);
  } else {
    user = await User.create({
      name: 'Sprout Demo',
      email: config.DEMO_EMAIL,
      passwordHash: await User.hashPassword(config.DEMO_PASSWORD),
    });
    console.log(`Created demo account ${config.DEMO_EMAIL}`);
  }

  const children = await seedDemoData(user.id);

  console.log('');
  for (const child of children) {
    const measurements = await Measurement.find({ childId: child._id }).sort({ takenAt: 1 });
    const milestoneRecords = await MilestoneRecord.find({ childId: child._id });
    const vaccineRecords = await VaccineRecord.find({ childId: child._id });

    const latest = measurements.at(-1);
    const { results } = assess({ sex: child.sex, dob: child.dob, measurement: latest });
    const insights = buildInsights({ child, measurements, milestoneRecords, vaccineRecords });

    console.log(`  ${child.name} — ${describeAge(child.dob)} (${child.sex})`);
    console.log(
      `    ${measurements.length} measurements, ${milestoneRecords.length} milestones ticked, ${vaccineRecords.length} doses recorded`,
    );
    for (const r of Object.values(results)) {
      console.log(`    ${r.label.padEnd(30)} ${String(r.value).padStart(6)} ${r.unit.padEnd(6)} z=${String(r.z).padStart(6)}  p${r.percentile}  ${r.classificationLabel}`);
    }
    for (const i of insights.slice(0, 3)) console.log(`    [${i.severity}] ${i.title}`);
    console.log('');
  }

  console.log(`Sign in with  ${config.DEMO_EMAIL}  /  ${config.DEMO_PASSWORD}`);

  await disconnectDb();
  await mongoose.connection.close();
}

main().catch(async (err) => {
  console.error(err);
  await disconnectDb().catch(() => {});
  process.exit(1);
});
