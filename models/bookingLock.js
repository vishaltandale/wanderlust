const mongoose = require("mongoose");
const Schema = mongoose.Schema;

// Lock collection to prevent race conditions on concurrent bookings
const bookingLockSchema = new Schema({
    listing: {
        type: Schema.Types.ObjectId,
        ref: "Listing",
        required: true,
        unique: true  // Only one lock per listing at a time
    },
    lockedBy: {
        type: Schema.Types.ObjectId,
        ref: "User",
        required: true
    },
    createdAt: {
        type: Date,
        default: Date.now,
        expires: 30  // Auto-delete after 30 seconds (TTL index)
    }
});

module.exports = mongoose.model("BookingLock", bookingLockSchema);
