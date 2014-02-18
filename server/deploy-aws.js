/**
 * deploy-aws - deploys "earth" files to AWS S3
 *
 * Ideally this script would be converted to a grunt task and take advantage its file selectors.
 */

"use strict";

var util = require("util");
var tool = require("./tool");
var aws = require("./aws");

console.log("============================================================");
console.log(new Date().toISOString() + " - Starting");

// UNDONE: delete objects in S3 but not in the list below
// UNDONE: super awesome logic that defines and iterates file sets, to eliminate this list. too lazy right now.
[

    "about.html",
    "cf-gray.jpg",
    "cover.jpg",
    "favicon.ico",
    "ipad-icon.png",
    "iphone-icon.png",
    "index.html",
    "natural-earth.jpg",
    "preview.jpg",
    "styles/styles.css",
    "styles/monosocialiconsfont-sub.ttf",
    "styles/mplus-2p-light-sub.ttf",
    "data/earth-topo.json",
    "data/earth-topo-mobile.json",
    "jp/about.html",
    "jp/index.html",
    "libs/d3.geo/0.0.0/d3.geo.polyhedron.v0.min.js",
    "libs/d3.geo/0.0.0/d3.geo.projection.v0.min.js",
    "libs/earth/1.0.0/earth.js",
    "libs/earth/1.0.0/globes.js",
    "libs/earth/1.0.0/products.js",
    "libs/earth/1.0.0/micro.js",
    "libs/when/2.6.0/when.js"

].forEach(function(key) {
    aws.uploadFile("../public/" + key, aws.S3_BUCKET, key).then(function(result) {
        console.log(key + ": " + util.inspect(result));
    }, tool.report);
});
