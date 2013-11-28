/**
 * gfs-update - downloads GFS files and deploys them to AWS S3
 */

// TODO: freshly downloaded grib files should overwrite existing layers, but only if they come from an older run
// TODO: allow extraction and push to S3 to occur right after download rather than waiting for all downloads to finish
// TODO: process json files to add nav info and add readable fields to header for browser to display -- like the actual
//       date and layer type
// TODO: handle case where two separate process pipelines, from two different runs, may be trying to extract the same
//       layer at once, or push to the S3 at once
// TODO: process to keep CURRENT up to date... somehow...
// TODO: optimize process of doing catch-up against several cycles. Don't want to keep re-putting items into S3.
//       probably a combination of checking for age of layer and doing catch-up in reverse chronological order
// TODO: cache-control for forecast layers should be short -- because they will be replaced. But the final layers
//       should have a long cache time.
// TODO: failure to download one grib file aborts whole process

"use strict";

console.log("============================================================");
console.log(new Date().toISOString() + " - Starting");

var util = require("util");
var fs = require("fs");
var mkdirp = require("mkdirp");
var temp = require("temp");
var when = require("when");
var delay = require("when/delay");
var guard = require('when/guard');
var tool = require("./tool");
var gfs = require("./gfs");
var aws = require("./aws");
var log = tool.log();

var PRODUCT_TYPES = ["1.0"];
var FORECASTS = [0, 3, 6, 9/*, 12, 15, 18, 21, 24*/];
var INDENT = undefined; // 2
var GRIB2JSON_FLAGS = "-n -d";
var LAYER_RECIPES = {
//    wi1: {
//        name: "wind-isobaric-1hPa",
//        filter: "--fc 2 --fp wind --fs 100 --fv 100",
//        description: "Wind Velocity @ 1 hPa",
//        stack: ["wi1000", "wi100", "wi10", "wi1"],
//        cross: ["wi1"]
//    },
    wi10: {
        name: "wind-isobaric-10hPa",
        filter: "--fc 2 --fp wind --fs 100 --fv 1000",
        description: "Wind Velocity @ 10 hPa"
    },
    wi70: {
        name: "wind-isobaric-70hPa",
        filter: "--fc 2 --fp wind --fs 100 --fv 7000",
        description: "Wind Velocity @ 70 hPa"
    },
    wi250: {
        name: "wind-isobaric-250hPa",
        filter: "--fc 2 --fp wind --fs 100 --fv 25000",
        description: "Wind Velocity @ 250 hPa"
    },
    wi500: {
        name: "wind-isobaric-500hPa",
        filter: "--fc 2 --fp wind --fs 100 --fv 50000",
        description: "Wind Velocity @ 500 hPa"
    },
    wi700: {
        name: "wind-isobaric-700hPa",
        filter: "--fc 2 --fp wind --fs 100 --fv 70000",
        description: "Wind Velocity @ 700 hPa"
    },
    wi850: {
        name: "wind-isobaric-850hPa",
        filter: "--fc 2 --fp wind --fs 100 --fv 85000",
        description: "Wind Velocity @ 850 hPa"
    },
    wi1000: {
        name: "wind-isobaric-1000hPa",
        filter: "--fc 2 --fp wind --fs 100 --fv 100000",
        description: "Wind Velocity @ 1000 hPa"
    }
//    ti1000: {
//        name: "temp-isobaric-1000hPa",
//        filter: "--fc 0 --fp 0 --fs 100 --fv 100000",
//        description: "Temperature @ 1000 hPa",
//        stack: [],
//        cross: ["wi1000", "ti1000"]
//    }
};

var servers = [
    gfs.servers.NOMADS,
    gfs.servers.NCEP
];

var GRIB_HOME = tool.ensureTrailing(process.argv[2], "/");
var LAYER_HOME = tool.ensureTrailing(process.argv[3], "/");
var date = process.argv[4] === "now" ? new Date() : new Date(process.argv[4]);

temp.track(true);

log.info(GRIB_HOME);
log.info(LAYER_HOME);
log.info(date.toISOString());

mkdirp.sync(GRIB_HOME);
mkdirp.sync(LAYER_HOME);

//function nap(millis) {
//    return function(value) {
//        return typeof value === "number" ? delay(value, millis) : delay(millis, value);
//    };
//}

function nextServer() {
    if (servers.length === 0) {
        log.error("didn't expect to find 0 servers available");
        return gfs.servers.NOMADS;
    }
    return servers.pop();
}

function releaseServer(server) {
    servers.push(server);
}

/**
 * Returns a promise for a downloaded product. If the product already exists, this method skips
 * the download and returns success. If the download fails, the promise is rejected.
 *
 * @param product
 * @returns {*}
 */
function download(product) {
    // CONSIDER: generalize this function by removing dependency on product object
    var localPath = product.path(GRIB_HOME);
    if (fs.existsSync(localPath)) {
        log.info("already exists: " + localPath);
        return when.resolve(product);
    }

    var server = nextServer();
    var remotePath = product.path("http://" + server);
    var tempStream = temp.createWriteStream();
    var progress = 0;
    log.info("GET: " + remotePath);
    return delay(10 * 1000).then(function() {
        return tool.download(remotePath, tempStream).then(
            function(result) {
                releaseServer(server);
                if (result.statusCode >= 300) {
                    log.info(util.format("download failed: %s", util.inspect(result)));
                    return product;
                }
                mkdirp.sync(product.dir(GRIB_HOME));
                fs.renameSync(tempStream.path, localPath); // UNDONE: cleanup temp, and don't affect other dls in progress
                var kps = Math.round(result.received / 1024 / result.duration * 1000);
                log.info("download complete: " + kps + "Kps "  + remotePath);
                return product;
            },
            null,
            function(update) {
                var current = Math.floor(update.received / 1024 / 1024);
                if (current > progress) {
                    log.info((progress = current) + "M " + remotePath);
                }
            });
    });
}

var download_throttled = guard(guard.n(servers.length), download);

function createTemp(options) {
    var tempStream = temp.createWriteStream(options), tempPath = tempStream.path;
    return tempStream.end(), tempPath;
}

function processLayer(layer, path) {
    var data = require(path);
    if (data.length == 0) {
        return null;  // no records
    }
    data.forEach(function(record) {
        record.meta = {
//            id: layer.id(),
            date: layer.product.date().toISOString()
//            description: layer.recipe.description + " - GFS " + layer.product.resolution() + "º",
//            center: "US National Weather Service",
//            nav: {
//                previousDay: null, // gfs.layer(),
//                previous: gfs.layer(layer.recipe, layer.product.previous()).id(),
//                next: gfs.layer(layer.recipe, layer.product.next()).id(),
//                nextDay: null // gfs.layer(),
//            }
        };
    });
    return data;
}

function extractLayer(layer) {
    var productPath = layer.product.path(GRIB_HOME);
    var layerPath = layer.path(LAYER_HOME);

    if (!fs.existsSync(productPath)) {
        log.info("product file not found, skipping: " + productPath);
        return null;
    }

    if (fs.existsSync(layerPath)) {
        var existing = require("./" + layerPath);  // HACK
        var refTime = existing.refTime;
        if (refTime && new Date(refTime) >= layer.product.cycle.date()) {
            log.info("already exists and is newer: " + layerPath);
        }
        return when.resolve(layer);
    }

    var tempPath = createTemp({suffix: ".json"});
    var args = util.format("%s %s -o %s %s", layer.recipe.filter, GRIB2JSON_FLAGS, tempPath, productPath);

    return tool.grib2json(args, process.stdout, process.stderr).then(function(returnCode) {
        if (returnCode !== 0) {
            log.info(util.format("grib2json failed (%s): %s", returnCode, productPath));
            return when.reject(returnCode);  // ?
        }
        log.info("processing: " + layerPath);

        var data = processLayer(layer, tempPath);
        if (!data) {
            log.info("no layer data, skipping: " + layerPath);
            return null;
        }

        mkdirp.sync(layer.dir(LAYER_HOME));
        fs.writeFileSync(layerPath, JSON.stringify(data, null, INDENT));
        log.info("successfully built: " + layerPath);
        return layer;
    });
}

var extractLayer_throttled = guard(guard.n(2), extractLayer);

function extractLayers(product) {
    var layers = Object.keys(LAYER_RECIPES).map(function(recipeId) {
        return gfs.layer(LAYER_RECIPES[recipeId], product);
    });
    return when.map(layers, extractLayer_throttled);
}

function pushLayer(layer) {
    if (!layer) {
        return null;  // no layer, so nothing to do
    }
    var layerPath = layer.path(LAYER_HOME);
    if (!fs.existsSync(layerPath)) {
        log.info("Layer file not found, skipping: " + layerPath);
        return null;
    }
    var key = layer.path(aws.S3_LAYER_HOME);
    var metadata = {
        "reference-time": layer.product.cycle.date().toISOString()
    }
    function isNewerThan(existing) {
        var refTime = (existing.Metadata || {})["reference-time"];
        return !refTime || new Date(refTime) < layer.product.cycle.date() || layer.isCurrent;
    }
    var cacheControl = gfs.cacheControlFor(layer);
    return aws.uploadFile(layerPath, aws.S3_BUCKET, key, metadata, isNewerThan, cacheControl).then(function(result) {
        log.info(key + ": " + util.inspect(result));
        return true;
    });
}

var pushLayer_throttled = guard(guard.n(1), pushLayer);

function pushLayers(layers) {
    return when.map(layers, pushLayer_throttled);
}

function processCycle(cycle) {
    log.info(JSON.stringify(cycle));
    var products = [];

    PRODUCT_TYPES.forEach(function(type) {
        FORECASTS.forEach(function(forecastHour) {
            products.push(gfs.product(type, cycle, forecastHour));
        });
    });

    var downloads = when.map(products, download_throttled);
    var extracted = when.map(downloads, extractLayers);
    var pushed = /*when(extracted); // */when.map(extracted, pushLayers);

    return pushed.then(function(result) {
        log.info("batch complete");
    });
}

function processCycles(bounds) {
    var result = [];
    var stop = new Date(bounds.until);
    var cycle = gfs.cycle(new Date(bounds.from));
    while (cycle.date().getTime() >= stop.getTime()) {
        result.push(processCycle(cycle));
        cycle = cycle.previous();
    }
    return when.all(result);
}

function copyCurrent() {
    // The set of current layers is determined by the current time. Search for the best set of layers
    // available given the current time and upload them to S3 under the "data/weather/current" path.

    var now = Date.now(), threeDaysAgo = now - 3*24*60*60*1000;

    // Start from the next cycle in the future and search backwards until we find the most recent layer.
    var mostRecentLayer = gfs.layer(LAYER_RECIPES.wi1000, gfs.product(PRODUCT_TYPES[0], gfs.cycle(now).next(), 0));
    while (mostRecentLayer.product.date() > now) {
        mostRecentLayer = mostRecentLayer.previous();
    }

    // Continue search backwards until we find a layer that exists on disk. Might be several hours ago.
    while (!fs.existsSync(mostRecentLayer.path(LAYER_HOME))) {
        mostRecentLayer = mostRecentLayer.previous();
        if (mostRecentLayer.product.date() < threeDaysAgo) {
            // Nothing recent exists, so give up.
            log.info("No recent layers found.");
            return;
        }
    }

    // The layer we found belongs to a cycle/product. Crack it open to find out which one.
    var header = require(mostRecentLayer.path("./" + LAYER_HOME))[0].header;  // HACK
    var product = gfs.product(PRODUCT_TYPES[0], gfs.cycle(header.refTime), header.forecastTime);

    // Symlink the layers from the "data/weather/current" directory:
    var layers = Object.keys(LAYER_RECIPES).map(function(recipeId) {
        // create symlink:  current/current-foo-bar.json -> ../2013/11/26/0300-foo-bar.json

        var src = gfs.layer(LAYER_RECIPES[recipeId], product, false);
        var dest = gfs.layer(LAYER_RECIPES[recipeId], product, true);

        mkdirp.sync(dest.dir(LAYER_HOME));
        var destPath = dest.path(LAYER_HOME);
        fs.unlinkSync(destPath);  // remove existing symlinks, if any
        fs.symlinkSync(src.path("../"), destPath);
        return dest;
    });

    // Now push to S3.
    return pushLayers(layers);
}

var now = Date.now(), lastCycle = gfs.cycle(now).previous().date();

processCycles({from: now, until: lastCycle})
    .then(copyCurrent)
    .otherwise(tool.report)
    .done();
