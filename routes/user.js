const express = require("express");
const router = express.Router();
const passport = require("passport");
const User = require("../models/user.js");
const wrapAsync = require("../utils/wrapAsync.js");

// Show register form
router.get("/register", (req, res) => {
    res.render("auth/register.ejs");
});

// Register new user
router.post(
    "/register",
    wrapAsync(async (req, res) => {
        try {
            const { email, firstName, lastName, password } = req.body;
            const user = new User({ email, firstName, lastName });
            const registeredUser = await User.register(user, password);
            req.login(registeredUser, (err) => {
                if (err) return next(err);
                req.flash("success", `Welcome to WanderLust, ${firstName}!`);
                res.redirect("/listings");
            });
        } catch (e) {
            req.flash("error", e.message);
            res.redirect("/register");
        }
    })
);

// Show login form
router.get("/login", (req, res) => {
    res.render("auth/login.ejs");
});

// Login user
router.post(
    "/login",
    passport.authenticate("local", {
        failureRedirect: "/login",
        failureFlash: true
    }),
    (req, res) => {
        req.flash("success", `Welcome back, ${req.user.firstName}!`);
        res.redirect("/listings");
    }
);

// Logout user
router.post("/logout", (req, res, next) => {
    req.logout((err) => {
        if (err) return next(err);
        req.flash("success", "Logged out successfully!");
        res.redirect("/listings");
    });
});

module.exports = router;
