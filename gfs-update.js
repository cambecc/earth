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
var FORECASTS = [0, 3/*, 6, 9, 12, 15, 18, 21, 24*/];
var GRIB2JSON_FLAGS = "-n";
var LAYER_RECIPES = {
    wi1: {
        name: "wind-isobaric-1hPa",
        filter: "--fc 2 --fp wind --fs 100 --fv 100",
        description: "Wind Velocity @ 1 hPa",
        stack: ["wi1000", "wi100", "wi10", "wi1"],
        cross: ["wi1"]
    },
    wi10: {
        name: "wind-isobaric-10hPa",
        filter: "--fc 2 --fp wind --fs 100 --fv 1000",
        description: "Wind Velocity @ 10 hPa",
        stack: ["wi1000", "wi100", "wi10", "wi1"],
        cross: ["wi10"]
    },
    wi100: {
        name: "wind-isobaric-100hPa",
        filter: "--fc 2 --fp wind --fs 100 --fv 10000",
        description: "Wind Velocity @ 100 hPa",
        stack: ["wi1000", "wi100", "wi10", "wi1"],
        cross: ["wi100"]
    },
    wi1000: {
        name: "wind-isobaric-1000hPa",
        filter: "--fc 2 --fp wind --fs 100 --fv 100000",
        description: "Wind Velocity @ 1000 hPa",
        stack: ["wi1000", "wi100", "wi10", "wi1"],
        cross: ["wi1000", "ti1000"]
    },
    ti1000: {
        name: "temp-isobaric-1000hPa",
        filter: "--fc 0 --fp 0 --fs 100 --fv 100000",
        description: "Temperature @ 1000 hPa",
        stack: [],
        cross: ["wi1000", "ti1000"]
    }
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
                    return when.reject(result);  // ??
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

    if (fs.existsSync(layerPath)) {
        log.info("already exists: " + layerPath);
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
        fs.writeFileSync(layerPath, JSON.stringify(data, null, 2));
        log.info("successfully built: " + layerPath);
        return layer;
    });
}

var extractLayer_throttled = guard(guard.n(1), extractLayer);

function extractLayers(product) {
    var recipes = Object.keys(LAYER_RECIPES).map(function(recipeId) {
        return gfs.layer(LAYER_RECIPES[recipeId], product);
    });
    return when.map(recipes, extractLayer_throttled);
}

function pushLayer(layer) {
    if (!layer) {
        return null;  // no layer, so nothing to do
    }
    var layerPath = layer.path(LAYER_HOME);
    var key = layer.path(aws.S3_LAYER_HOME);
    return aws.uploadFile(layerPath, aws.S3_BUCKET, key).then(function(result) {
        console.log(key + ": " + util.inspect(result));
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
        console.log(result);
    });
}

var main = processCycle(gfs.cycle(date).previous().previous().previous().previous());

main.then(null, tool.report);
