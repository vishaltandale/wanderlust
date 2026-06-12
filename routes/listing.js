const express = require("express");
const router = express.Router();
const wrapAsync = require("../utils/wrapAsync.js");
const ExpressError = require("../utils/ExpressError.js");
const { listingSchema } = require("../schema.js");
const Listing = require("../models/listing.js");
const { isLoggedIn } = require("../utils/middleware.js");
const upload = require("../utils/upload.js");

const validateListing = (req, res, next) => {
    let { error } = listingSchema.validate(req.body);
    if (error) {
        let errMsg = error.details.map(el => el.message).join(",");
        throw new ExpressError(400, errMsg);
    } else {
        next();
    }
};

const isListingOwner = async (req, res, next) => {
    const { id } = req.params;
    const listing = await Listing.findById(id);
    if (!listing) {
        req.flash("error", "Listing not found!");
        return res.redirect("/listings");
    }
    if (!listing.owner || listing.owner.toString() !== req.user._id.toString()) {
        req.flash("error", "You are not authorized to do that!");
        return res.redirect(`/listings/${id}`);
    }
    next();
};

// Categories for filter
const CATEGORIES = ["Beach", "Mountain", "City", "Countryside", "Lake", "Desert", "Tropical", "Historic", "Luxury", "Budget"];

// Index Route - Show all listings (with search + filters)
router.get("/", wrapAsync(async (req, res) => {
    const { search, category, minPrice, maxPrice, sort } = req.query;
    let query = {};

    // Text search
    if (search) {
        const regex = new RegExp(search, "i");
        query.$or = [
            { title: regex },
            { location: regex },
            { country: regex },
            { description: regex }
        ];
    }

    // Category filter
    if (category && CATEGORIES.includes(category)) {
        query.category = category;
    }

    // Price range filter
    if (minPrice || maxPrice) {
        query.price = {};
        if (minPrice) query.price.$gte = parseInt(minPrice);
        if (maxPrice) query.price.$lte = parseInt(maxPrice);
    }

    // Sort
    let sortOption = {};
    switch (sort) {
        case "price_low": sortOption = { price: 1 }; break;
        case "price_high": sortOption = { price: -1 }; break;
        case "newest": sortOption = { _id: -1 }; break;
        default: sortOption = {}; break;
    }

    const allListings = await Listing.find(query).sort(sortOption);
    res.render("listings/index.ejs", {
        allListings,
        searchQuery: search || "",
        selectedCategory: category || "",
        minPrice: minPrice || "",
        maxPrice: maxPrice || "",
        sort: sort || "",
        categories: CATEGORIES
    });
}));

// New Route - Show form to create new listing (auth required)
router.get("/new", isLoggedIn, (req, res) => {
    res.render("listings/new.ejs", { categories: CATEGORIES });
});

// Show Route
router.get("/:id",
    wrapAsync(async (req, res) => {
        let { id } = req.params;
        const listing = await Listing.findById(id)
            .populate("reviews")
            .populate({ path: "reviews", populate: { path: "author", select: "firstName lastName" } })
            .populate("owner", "firstName lastName email");
        if (!listing) {
            req.flash("error", "Listing not found!");
            return res.redirect("/listings");
        }
        // Calculate average rating
        let avgRating = 0;
        if (listing.reviews.length > 0) {
            avgRating = listing.reviews.reduce((sum, r) => sum + r.rating, 0) / listing.reviews.length;
        }
        res.render("listings/show.ejs", { listing, avgRating: avgRating.toFixed(1) });
    })
);

// Create Route (auth required, with image upload)
router.post(
    "/",
    isLoggedIn,
    upload.single("listing[image]"),
    validateListing,
    wrapAsync(async (req, res) => {
        const newListing = new Listing(req.body.listing);
        newListing.owner = req.user._id;

        if (req.file) {
            newListing.image.url = "/uploads/" + req.file.filename;
            newListing.image.filename = req.file.filename;
        }

        await newListing.save();
        req.flash("success", "New listing created successfully!");
        res.redirect("/listings");
    })
);

// Edit Route (auth required, owner only)
router.get("/:id/edit", isLoggedIn, isListingOwner, wrapAsync(async (req, res) => {
    let { id } = req.params;
    const listing = await Listing.findById(id);
    res.render("listings/edit.ejs", { listing, categories: CATEGORIES });
}));

// Update Route (auth required, owner only)
router.put("/:id",
    isLoggedIn,
    isListingOwner,
    upload.single("listing[image]"),
    validateListing,
    wrapAsync(async (req, res) => {
        let { id } = req.params;
        let updateData = req.body.listing;

        if (req.file) {
            updateData.image = {
                url: "/uploads/" + req.file.filename,
                filename: req.file.filename
            };
        }

        await Listing.findByIdAndUpdate(id, updateData);
        req.flash("success", "Listing updated successfully!");
        res.redirect(`/listings/${id}`);
    })
);

// Delete Route (auth required, owner only)
router.delete("/:id", isLoggedIn, isListingOwner, wrapAsync(async (req, res) => {
    let { id } = req.params;
    await Listing.findByIdAndDelete(id);
    req.flash("success", "Listing deleted successfully!");
    res.redirect("/listings");
}));

module.exports = router;
