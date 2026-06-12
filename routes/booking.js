const express = require("express");
const router = express.Router();
const wrapAsync = require("../utils/wrapAsync.js");
const { isLoggedIn } = require("../utils/middleware.js");
const Listing = require("../models/listing.js");
const Booking = require("../models/booking.js");
const BookingLock = require("../models/bookingLock.js");

// Show user's bookings
router.get(
    "/my",
    isLoggedIn,
    wrapAsync(async (req, res) => {
        const bookings = await Booking.find({ guest: req.user._id })
            .populate({
                path: "listing",
                select: "title image location country"
            })
            .sort({ createdAt: -1 });
        res.render("bookings/index.ejs", { bookings });
    })
);

// Show booking form for a listing
router.get(
    "/new/:listingId",
    isLoggedIn,
    wrapAsync(async (req, res) => {
        const { listingId } = req.params;
        const listing = await Listing.findById(listingId);
        if (!listing) {
            req.flash("error", "Listing not found!");
            return res.redirect("/listings");
        }
        res.render("bookings/new.ejs", { listing });
    })
);

// Create a booking (uses lock to prevent double-booking)
router.post(
    "/:listingId",
    isLoggedIn,
    wrapAsync(async (req, res) => {
        const { listingId } = req.params;
        const listing = await Listing.findById(listingId);
        if (!listing) {
            req.flash("error", "Listing not found!");
            return res.redirect("/listings");
        }

        const { checkIn, checkOut, guestCount } = req.body.booking;
        const checkInDate = new Date(checkIn);
        const checkOutDate = new Date(checkOut);

        if (checkOutDate <= checkInDate) {
            req.flash("error", "Check-out date must be after check-in date!");
            return res.redirect(`/bookings/new/${listingId}`);
        }

        if (checkInDate < new Date(new Date().setHours(0, 0, 0, 0))) {
            req.flash("error", "Check-in date cannot be in the past!");
            return res.redirect(`/bookings/new/${listingId}`);
        }

        // Acquire lock -- unique index on 'listing' ensures only one booking
        // can be processed for this listing at a time.
        let lock;
        try {
            lock = await BookingLock.create({
                listing: listing._id,
                lockedBy: req.user._id
            });
        } catch (e) {
            if (e.code === 11000) {
                req.flash("error", "This listing is currently being booked by someone else. Please try again in a moment.");
                return res.redirect(`/bookings/new/${listingId}`);
            }
            throw e;
        }

        try {
            // We hold the lock -- now check for overlapping confirmed bookings
            const overlapping = await Booking.findOne({
                listing: listing._id,
                status: "confirmed",
                checkIn: { $lt: checkOutDate },
                checkOut: { $gt: checkInDate }
            });

            if (overlapping) {
                req.flash("error", "These dates are not available. Please choose different dates.");
                return res.redirect(`/bookings/new/${listingId}`);
            }

            const nights = Math.max(1, Math.ceil((checkOutDate - checkInDate) / (1000 * 60 * 60 * 24)));
            const totalPrice = nights * listing.price;

            const booking = new Booking({
                listing: listing._id,
                guest: req.user._id,
                checkIn: checkInDate,
                checkOut: checkOutDate,
                guestCount: parseInt(guestCount),
                totalPrice
            });

            await booking.save();
            listing.bookings.push(booking._id);
            await listing.save();

            req.flash("success", "Booking confirmed successfully!");
            res.redirect("/bookings/my");
        } finally {
            // Always release the lock
            await BookingLock.findByIdAndDelete(lock._id);
        }
    })
);

// Cancel a booking
router.post(
    "/:bookingId/cancel",
    isLoggedIn,
    wrapAsync(async (req, res) => {
        const { bookingId } = req.params;
        const booking = await Booking.findById(bookingId);

        if (!booking) {
            req.flash("error", "Booking not found!");
            return res.redirect("/bookings/my");
        }

        if (booking.guest.toString() !== req.user._id.toString()) {
            req.flash("error", "You are not authorized to cancel this booking!");
            return res.redirect("/bookings/my");
        }

        booking.status = "cancelled";
        await booking.save();

        req.flash("success", "Booking cancelled successfully.");
        res.redirect("/bookings/my");
    })
);

module.exports = router;
