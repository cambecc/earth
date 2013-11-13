/**
 * gfs-update - downloads GFS files and deploys them to AWS S3
 */

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
var FORECASTS = [0, 3, 6, 9, 12, 15, 18, 21, 24];
var GRIB2JSON_FLAGS = "-n";
var LAYER_RECIPES = [
    {name: "wind_isobaric_1mb",    filter: "--fp wind --fs 100 --fv 100"},
    {name: "wind_isobaric_10mb",   filter: "--fp wind --fs 100 --fv 1000"},
    {name: "wind_isobaric_100mb",  filter: "--fp wind --fs 100 --fv 10000"},
    {name: "wind_isobaric_200mb",  filter: "--fp wind --fs 100 --fv 20000"},
    {name: "wind_isobaric_1000mb", filter: "--fp wind --fs 100 --fv 100000"}];
var servers = [
    gfs.servers.NOMADS,
    gfs.servers.NCEP];

var GRIB_HOME = tool.ensureTrailing(process.argv[2], "/");
var LAYER_HOME = tool.ensureTrailing(process.argv[3], "/");
var S3_BUCKET = "test.nullschool.net";
var S3_LAYER_HOME = "data/weather/";
var date = process.argv[4] === "now" ? new Date() : new Date(process.argv[4]);

temp.track(true);

log.info(GRIB_HOME);
log.info(LAYER_HOME);
log.info(date.toISOString());

mkdirp.sync(GRIB_HOME);
mkdirp.sync(LAYER_HOME);

function nap(millis) {
    return function(value) {
        return typeof value === "number" ? delay(value, millis) : delay(millis, value);
    };
}

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
        }).then(nap(10 * 1000));
}

var download_throttled = guard(guard.n(servers.length), download);

function extractLayer(layer) {
    var productPath = layer.product.path(GRIB_HOME);
    var layerPath = layer.path(LAYER_HOME);

    if (fs.existsSync(layerPath)) {
        log.info("already exists: " + layerPath);
        return when.resolve(layer);
    }

    mkdirp.sync(layer.dir(LAYER_HOME));
    var args = util.format("%s %s -o %s %s", layer.filter, GRIB2JSON_FLAGS, layerPath, productPath);
    return tool.grib2json(args, process.stdout, process.stderr).then(function(returnCode) {
        if (returnCode !== 0) {
            log.info(util.format("grib2json failed (%s): %s", returnCode, productPath));
            return when.reject(returnCode);  // ?
        }
        log.info("successfully built: " + layerPath);
        return layer;
    });
}

var extractLayer_throttled = guard(guard.n(1), extractLayer);

function extractLayers(product) {
    var recipes = LAYER_RECIPES.map(function(recipe) { return gfs.layer(recipe.name, recipe.filter, product); });
    return when.map(recipes, extractLayer_throttled);
}

function pushLayer(layer) {
    var layerPath = layer.path(LAYER_HOME);
    var key = layer.path(S3_LAYER_HOME);
    return aws.uploadFile(layerPath, S3_BUCKET, key).then(function(result) {
        console.log(key + ": " + util.inspect(result));
        return true;
    });
}

var pushLayer_throttled = guard(guard.n(1), pushLayer);

function pushLayers(layers) {
    var allLayers = [];
    console.log(layers instanceof Array);
    layers.forEach(function(layer) {
        allLayers.push(layer);
    });
    return when.map(allLayers, pushLayer_throttled);
}

function processCycle(cycle) {
    var products = [];

    PRODUCT_TYPES.forEach(function(type) {
        FORECASTS.forEach(function(forecastHour) {
            products.push(gfs.product(type, cycle, forecastHour));
        });
    });

    var downloads = when.map(products, download_throttled);
    var extracted = when.map(downloads, extractLayers);
    var pushed = when.map(extracted, pushLayers);

    return pushed.then(function(result) {
        console.log(result);
    });
}

var main = processCycle(gfs.cycle(date).previous().previous());

main.then(null, tool.report);
