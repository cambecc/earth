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
var log = tool.log();

var scratch = process.argv[2];
var date = process.argv[3] === "now" ? new Date() : new Date(process.argv[3]);

temp.track(true);

if (!fs.existsSync(scratch)) {
    log.error(scratch + " directory does not exist.");
    return;
}

log.info(scratch);
log.info(date.toISOString());

var cycle = gfs.cycle("2013-11-12T11:12:14.650Z").previous();
var client = gfs.client("http://" + gfs.NOMADS);

[0, 3].forEach(function(forecastHour) {

    var product = gfs.product("1.0", cycle, forecastHour);
    var path = scratch + "/" + product.path();
    var file = path + "/" + product.name();

    if (fs.existsSync(file)) {
        log.info("already exists: " + file);
        splitGrib(product, path, file);
        return;
    }

    var tmp = temp.createWriteStream();
    client.download(product, tmp).then(function(result) {
        if (result.statusCode < 300) {
            if (!fs.existsSync(path)) {
                fs.mkdirSync(path);
            }
            fs.renameSync(tmp.path, file);
            splitGrib(product, path, file);
        }
        else {
            log.info("download failed: " + result.statusCode + ": " + file);
        }
    }).then(null, tool.report);

});

function splitGrib(product, path, file) {

    var LAYER_RECIPES = [
        {filter: "--fp wind --fs 100 --fv 1000",   name: "wind_isobaric_10mb"},
        {filter: "--fp wind --fs 100 --fv 10000",  name: "wind_isobaric_100mb"},
        {filter: "--fp wind --fs 100 --fv 100000", name: "wind_isobaric_1000mb"}
    ];

    LAYER_RECIPES.forEach(function(recipe) {

        var outfile = util.format("%s/%s_%s_gfs_%s.json",
            path,
            tool.addHours(product.cycle.date(), product.forecastHour).toISOString(),
            recipe.name,
            product.type);

        var args = util.format("%s -n -o %s %s", recipe.filter, outfile, file);

        if (fs.existsSync(outfile)) {
            log.info("already exists: " + outfile);
            return;
        }

        tool.grib2json(args, process.stdout, process.stderr).then(function(result) {

            if (result === 0) {  // success
                log.info("successfully built: " + outfile);
            }

        }).then(null, tool.report);

    });

}
