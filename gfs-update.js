/**
 * gfs-update - downloads GFS files and deploys them to AWS S3
 */

"use strict";

console.log("============================================================");
console.log(new Date().toISOString() + " - Starting");

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

var cycle = gfs.cycle(date);
var client = gfs.client("http://" + gfs.NOMADS);

[0/*, 3*/].forEach(function(forecastHour) {

    var product = gfs.product("2.5", cycle, forecastHour);
    var path = scratch + "/" + product.path();
    var file = path + "/" + product.name();

    if (fs.existsSync(file)) {
        log.info("already exists: " + file);
        return;
    }

    var tmp = temp.createWriteStream();
    client.download(product, tmp).then(function(result) {
        if (result.statusCode < 300) {
            if (!fs.existsSync(path)) {
                fs.mkdirSync(path);
            }
            fs.renameSync(tmp.path, file);
        }
        else {
            log.info("download failed: " + result.statusCode + ": " + file);
        }
    }).then(null, tool.report);

});