const express = require("express");
const router = express.Router({ mergeParams: true });
const wrapAsync = require("../utils/wrapAsync.js");
const ExpressError = require("../utils/ExpressError.js");
const { reviewSchema } = require("../schema.js");
const Listing = require("../models/listing.js");
const Review = require("../models/reviews.js");
const { isLoggedIn } = require("../utils/middleware.js");

const validateReview = (req, res, next) => {
    let { error } = reviewSchema.validate(req.body);
    if (error) {
        let errMsg = error.details.map(el => el.message).join(",");
        throw new ExpressError(400, errMsg);
    } else {
        next();
    }
};

// Post Review Route (auth required)
router.post(
    "/",
    isLoggedIn,
    validateReview,
    wrapAsync(async (req, res) => {
        let listing = await Listing.findById(req.params.id);
        if (!listing) {
            req.flash("error", "Listing not found!");
            return res.redirect("/listings");
        }

        // Check if user already reviewed
        const existingReview = await Review.findOne({
            _id: { $in: listing.reviews },
            author: req.user._id
        });
        if (existingReview) {
            req.flash("error", "You have already reviewed this listing!");
            return res.redirect(`/listings/${listing._id}`);
        }

        let newReview = new Review(req.body.review);
        newReview.author = req.user._id;
        listing.reviews.push(newReview);
        await newReview.save();
        await listing.save();
        req.flash("success", "Review added successfully!");
        res.redirect(`/listings/${listing._id}`);
    })
);

// Delete Review Route (auth required, author or listing owner only)
router.delete(
    "/:reviewId",
    isLoggedIn,
    wrapAsync(async (req, res) => {
        let { id, reviewId } = req.params;
        const listing = await Listing.findById(id);
        const review = await Review.findById(reviewId);

        if (!listing || !review) {
            req.flash("error", "Review not found!");
            return res.redirect("/listings");
        }

        // Allow review author or listing owner to delete
        const isReviewAuthor = review.author && review.author.toString() === req.user._id.toString();
        const isListingOwner = listing.owner && listing.owner.toString() === req.user._id.toString();

        if (!isReviewAuthor && !isListingOwner) {
            req.flash("error", "You are not authorized to delete this review!");
            return res.redirect(`/listings/${id}`);
        }

        await Listing.findByIdAndUpdate(id, { $pull: { reviews: reviewId } });
        await Review.findByIdAndDelete(reviewId);
        req.flash("success", "Review deleted successfully!");
        res.redirect(`/listings/${id}`);
    })
);

module.exports = router;
