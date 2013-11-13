/**
 * gfs-update - downloads GFS files and deploys them to AWS S3
 */

"use strict";

console.log("============================================================");
console.log(new Date().toISOString() + " - Starting");

var util = require("util");
var fs = require("fs");
var temp = require("temp");
var gfs = require(__dirname + "/gfs");
var tool = require(__dirname + "/tool");
var aws = require("./aws");
var mkdirp = require("mkdirp");
var when = require("when");
var log = tool.log();

var GRIB_HOME = tool.ensureTrailing(process.argv[2], "/");
var LAYER_HOME = tool.ensureTrailing(process.argv[3], "/");
var date = process.argv[4] === "now" ? new Date() : new Date(process.argv[4]);

temp.track(true);

log.info(GRIB_HOME);
log.info(LAYER_HOME);
log.info(date.toISOString());

mkdirp.sync(GRIB_HOME);
mkdirp.sync(LAYER_HOME);

// var client = gfs.client(server);

/**
 * Returns a promise for a downloaded product. If the product already exists, this method skips
 * the download and returns success. If the download fails, the promise is rejected.
 *
 * @param product
 * @returns {*}
 */
function download(product) {
    var localPath = product.path(GRIB_HOME);
    if (fs.existsSync(localPath)) {
        log.info("already exists: " + localPath);
        return when.resolve(product);
    }

    var remotePath = product.path(server);
    var tempStream = temp.createWriteStream();
    var progress = 0;
    return tool.download(remotePath, tempStream).then(
        function(result) {
            if (result.statusCode >= 300) {
                log.info(util.format("download failed: %s", util.inspect(result)));
                return when.reject(result);  // ??
            }
            mkdirp.sync(product.dir(GRIB_HOME));
            fs.renameSync(tempStream.path, localPath); // UNDONE: cleanup temp. Ensure doesn't affect other dls in progress
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
}

function extractLayer(layer) {
    var productPath = layer.product.path(GRIB_HOME);
    var layerPath = layer.path(LAYER_HOME);

    if (fs.existsSync(layerPath)) {
        log.info("already exists: " + layerPath);
        return when.resolve(layerPath);
    }

    mkdirp.sync(layer.dir(LAYER_HOME));
    var args = util.format("%s -n -o %s %s", layer.filter, layerPath, productPath);
    return tool.grib2json(args, process.stdout, process.stderr).then(function(returnCode) {
        if (returnCode !== 0) {
            log.info(util.format("grib2json failed (%s): %s", returnCode, productPath));
            return when.reject(returnCode);  // ?
        }
        log.info("successfully built: " + layerPath);
        return layerPath;
    });
}

function splitGrib(product) {

    var LAYER_RECIPES = [
        {name: "wind_isobaric_1mb",    filter: "--fp wind --fs 100 --fv 100"},
        {name: "wind_isobaric_10mb",   filter: "--fp wind --fs 100 --fv 1000"},
        {name: "wind_isobaric_100mb",  filter: "--fp wind --fs 100 --fv 10000"},
        {name: "wind_isobaric_1000mb", filter: "--fp wind --fs 100 --fv 100000"}
    ];

    LAYER_RECIPES.forEach(function(recipe) {
        var layer = gfs.layer(recipe.name, recipe.filter, product);
        extractLayer(layer).then(null, tool.report);
    });
}

function pushToAWS(path, name, date) {
    return;
//    var key = util.format("data/weather/%s/%s", tool.yyyymmdd(date), name);
//    aws.uploadFile(path, "test.nullschool.net", key).then(function(result) {
//        console.log(key + ": " + util.inspect(result));
//    }, tool.report);
}

var cycle = gfs.cycle(Date.now()).previous(); // gfs.cycle("2013-11-12T11:12:14.650Z");
var server = "http://" + gfs.NOMADS;

[0, 3, 27].forEach(function(forecastHour) {

    var product = gfs.product("1.0", cycle, forecastHour);

    download(product).then(function() {
        splitGrib(product);
    }).then(null, tool.report);

});

