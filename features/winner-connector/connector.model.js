const mongoose = require('mongoose');

/**
 * Desktop connector identity for Winner ASCII uploads.
 * Token is stored hashed (bcrypt). Plain token is shown once at seed/create time.
 */
const connectorSchema = new mongoose.Schema(
  {
    connectorId: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      index: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
    },
    tokenHash: {
      type: String,
      required: true,
      select: false,
    },
    isActive: {
      type: Boolean,
      default: true,
      index: true,
    },
    lastSeenAt: {
      type: Date,
      default: null,
    },
    notes: {
      type: String,
      trim: true,
      default: '',
    },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model('WinnerConnector', connectorSchema);
