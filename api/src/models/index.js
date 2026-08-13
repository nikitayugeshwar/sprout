import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';

const { Schema, model } = mongoose;

/** Strips Mongo internals from every JSON response and exposes `id`. */
const jsonOptions = {
  virtuals: true,
  versionKey: false,
  transform(_doc, ret) {
    ret.id = ret._id?.toString();
    delete ret._id;
    delete ret.passwordHash;
    return ret;
  },
};

const userSchema = new Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 80 },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true, index: true },
    passwordHash: { type: String, required: true },
    role: { type: String, enum: ['parent', 'admin'], default: 'parent' },
    isDemo: { type: Boolean, default: false },
  },
  { timestamps: true, toJSON: jsonOptions },
);

userSchema.methods.verifyPassword = function verifyPassword(plain) {
  return bcrypt.compare(plain, this.passwordHash);
};

userSchema.statics.hashPassword = function hashPassword(plain) {
  return bcrypt.hash(plain, 10);
};

const childSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    name: { type: String, required: true, trim: true, maxlength: 60 },
    /**
     * Biological sex, required because every WHO growth standard is sexed —
     * there is no combined reference table to fall back on.
     */
    sex: { type: String, enum: ['male', 'female'], required: true },
    dob: { type: Date, required: true },
    birthWeightKg: { type: Number, min: 0.3, max: 8 },
    birthLengthCm: { type: Number, min: 20, max: 70 },
    /** Deterministic seed for the generated avatar, so it never changes. */
    avatarSeed: { type: String, default: () => Math.random().toString(36).slice(2, 10) },
    notes: { type: String, maxlength: 2000 },
  },
  { timestamps: true, toJSON: jsonOptions },
);

childSchema.index({ userId: 1, createdAt: 1 });

const measurementSchema = new Schema(
  {
    childId: { type: Schema.Types.ObjectId, ref: 'Child', required: true, index: true },
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    takenAt: { type: Date, required: true },
    weightKg: { type: Number, min: 0.3, max: 60 },
    heightCm: { type: Number, min: 20, max: 160 },
    headCircumferenceCm: { type: Number, min: 20, max: 65 },
    source: { type: String, enum: ['parent', 'clinic'], default: 'parent' },
    note: { type: String, maxlength: 500 },
  },
  { timestamps: true, toJSON: jsonOptions },
);

measurementSchema.index({ childId: 1, takenAt: -1 });

const milestoneRecordSchema = new Schema(
  {
    childId: { type: Schema.Types.ObjectId, ref: 'Child', required: true, index: true },
    milestoneKey: { type: String, required: true },
    status: { type: String, enum: ['achieved', 'not_yet'], required: true },
    achievedAt: { type: Date },
    note: { type: String, maxlength: 500 },
  },
  { timestamps: true, toJSON: jsonOptions },
);

// One record per milestone per child — updating a tick must not create a second row.
milestoneRecordSchema.index({ childId: 1, milestoneKey: 1 }, { unique: true });

const vaccineRecordSchema = new Schema(
  {
    childId: { type: Schema.Types.ObjectId, ref: 'Child', required: true, index: true },
    vaccineKey: { type: String, required: true },
    administeredAt: { type: Date, required: true },
    note: { type: String, maxlength: 500 },
  },
  { timestamps: true, toJSON: jsonOptions },
);

vaccineRecordSchema.index({ childId: 1, vaccineKey: 1 }, { unique: true });

export const User = model('User', userSchema);
export const Child = model('Child', childSchema);
export const Measurement = model('Measurement', measurementSchema);
export const MilestoneRecord = model('MilestoneRecord', milestoneRecordSchema);
export const VaccineRecord = model('VaccineRecord', vaccineRecordSchema);
