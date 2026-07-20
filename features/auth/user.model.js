const mongoose = require('mongoose');
const { ALL_ROLES } = require('../../config/constants');

const userSchema = new mongoose.Schema(
  {
    firstName: {
      type: String,
      trim: true,
      default: '',
    },
    lastName: {
      type: String,
      trim: true,
      default: '',
    },
    name: {
      type: String,
      required: true,
      trim: true,
    },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      index: true,
    },
    phone: {
      type: String,
      trim: true,
      default: '',
    },
    password: {
      type: String,
      required: true,
      select: false,
    },
    role: {
      type: String,
      enum: ALL_ROLES,
      required: true,
      index: true,
    },
    isActive: {
      type: Boolean,
      default: true,
      index: true,
    },
    lastLogin: {
      type: Date,
      default: null,
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

userSchema.statics.buildDisplayName = function buildDisplayName(firstName, lastName, fallback = '') {
  const combined = `${firstName || ''} ${lastName || ''}`.trim();
  return combined || fallback || 'User';
};

userSchema.statics.splitName = function splitName(name = '') {
  const parts = String(name).trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return { firstName: '', lastName: '' };
  if (parts.length === 1) return { firstName: parts[0], lastName: '' };
  return { firstName: parts[0], lastName: parts.slice(1).join(' ') };
};

userSchema.methods.toSafeObject = function toSafeObject() {
  let firstName = this.firstName || '';
  let lastName = this.lastName || '';

  if (!firstName && !lastName && this.name) {
    const split = userSchema.statics.splitName(this.name);
    firstName = split.firstName;
    lastName = split.lastName;
  }

  return {
    id: this._id,
    firstName,
    lastName,
    name: this.name || userSchema.statics.buildDisplayName(firstName, lastName),
    email: this.email,
    phone: this.phone || '',
    role: this.role,
    isActive: this.isActive,
    lastLogin: this.lastLogin || null,
    createdBy: this.createdBy || null,
    createdAt: this.createdAt,
    updatedAt: this.updatedAt,
  };
};

userSchema.statics.toSafeObjectFromLean = function toSafeObjectFromLean(doc) {
  if (!doc) return null;

  let firstName = doc.firstName || '';
  let lastName = doc.lastName || '';

  if (!firstName && !lastName && doc.name) {
    const split = userSchema.statics.splitName(doc.name);
    firstName = split.firstName;
    lastName = split.lastName;
  }

  return {
    id: doc._id,
    firstName,
    lastName,
    name: doc.name || userSchema.statics.buildDisplayName(firstName, lastName),
    email: doc.email,
    phone: doc.phone || '',
    role: doc.role,
    isActive: doc.isActive,
    lastLogin: doc.lastLogin || null,
    createdBy: doc.createdBy || null,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
};

module.exports = mongoose.model('User', userSchema);
