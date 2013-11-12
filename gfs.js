/**
 * gfs-source: describes and downloads GFS products.
 */

"use strict";

var util = require("util");
var when = require("when");
var tool = require(__dirname + "/tool");
var log = tool.log();

var RUN_FREQ = 6;  // GFS cycles run every six hours
var FORECAST_FREQ = 3;  // forecasts are available in three hour increments

exports.NCEP = "www.ftp.ncep.noaa.gov/data/nccf/com/gfs/prod/";
exports.NOMADS = "nomads.ncep.noaa.gov/pub/data/nccf/com/gfs/prod/";

/**
 * Returns an object that describes the GFS cycle matching the specified date. The object has the form:
 *
 *     {year:, month:, day:, hour:, next(), previous(), yyyymmdd()}
 *
 * where hour is the cycle runtime, next() and previous() return the chronologically next or previous cycles,
 * and yyyymmdd() provides a string format of this cycle's date.
 *
 * @param {Date, Number, String} date a Date object, milliseconds since epoch, or ISO string.
 * @returns {Object} the cycle object
 */
exports.cycle = function(date) {
    date = new Date(date);
    return {
        year: date.getUTCFullYear(),
        month: date.getUTCMonth() + 1,
        day: date.getUTCDate(),
        hour: Math.floor(date.getUTCHours() / RUN_FREQ) * RUN_FREQ,  // round down to nearest multiple

        next: function() {
            return cycle(tool.addHours(date, RUN_FREQ));
        },
        previous: function() {
            return cycle(tool.addHours(date, -RUN_FREQ));
        },
        yyyymmdd: function() {
            return tool.pad(this.year, 4) + tool.pad(this.month, 2) + tool.pad(this.day, 2);
        },
        date: function() {
            return new Date(tool.toISOString(this));
        }
    };
}; var cycle = exports.cycle;

/**
 * Returns an object that describes a GFS product within the specified cycle. The object has the form:
 *
 *     {type:, cycle:, forecastHour:, name(), path(), url(), next(), previous(), nextCycle(), previousCycle()}
 *
 * where name() returns the file name of the product, path() returns the expected path to the file,
 * next() and previous() return the chronologically next or previous forecast product, and nextCycle() and
 * previousCycle() return the product in the next or previous cycle.
 *
 * @param {String} type the GFS product type: ["0.5", "0.5b", "1.0", "2.5", "master"]
 * @param {Object} cycle a cycle object (see cycle(Date) function)
 * @param {Number} forecastHour the hour of the forecast product within the specified cycle
 * @returns {Object} the product object
 */
exports.product = function(type, cycle, forecastHour) {
    return {
        type: type,
        cycle: cycle,
        forecastHour: Math.floor(forecastHour / FORECAST_FREQ) * FORECAST_FREQ,  // round down to nearest multiple

        name: function() {
            var cc = tool.pad(cycle.hour, 2), ff = tool.pad(forecastHour, 2);
            switch (type) {
                case "0.5":    return util.format("gfs.t%sz.pgrb2f%s", cc, ff);
                case "0.5b":   return util.format("gfs.t%sz.pgrb2bf%s", cc, ff);
                case "1.0":    return util.format("gfs.t%sz.pgrbf%s.grib2", cc, ff);
                case "2.5":    return util.format("gfs.t%sz.pgrbf%s.2p5deg.grib2", cc, ff);
                case "master": return util.format("gfs.t%sz.mastergrb2f%s", cc, ff);
            }
        },
        path: function() {
            var result = util.format("gfs.%s%s", cycle.yyyymmdd(), tool.pad(cycle.hour, 2));
            return type === "master" ? result + "/master" : result;
        },
        url: function(base) {
            return base + this.path() + "/" + this.name();
        },
        next: function() {
            return product(type, cycle, forecastHour + FORECAST_FREQ);
        },
        previous: function() {
            return product(type, cycle, forecastHour - FORECAST_FREQ);
        },
        nextCycle: function() {
            return product(type, cycle.next(), forecastHour);
        },
        previousCycle: function() {
            return product(type, cycle.previous(), forecastHour);
        }
    };
}; var product = exports.product;

exports.client = function(server) {
    return {
//        checkAvailable: function(product) {
//            var resource = product.url(server);
//            log.info("HEAD: " + resource);
//            return tool.head(resource).then(function(result) {
//                return result.statusCode === 200;
//            });
//        },

        download: function(product, output) {
            var resource = product.url(server);
            var progress = 0;
            log.info("GET: " + resource);
            return tool.download(resource, output).then(
                function(result) {
                    var kps = Math.round(result.received / 1024 / result.duration * 1000);
                    log.info("GET: " + kps + "Kps "  + resource);
                    return result;
                },
                null,
                function(update) {
                    var current = Math.floor(update.received / 1024 / 1024);
                    if (current > progress) {
                        log.info((progress = current) + "M");
                    }
                    return update;
                });
        }
    };
};
