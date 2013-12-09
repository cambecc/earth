/**
 * gfs: a collection of objects to describe the NOAA Global Forecast System.
 *
 * These GFS objects are coded to match the layout of the data files available from the NOAA's web servers.
 *
 * An example schedule for GFS products is:
 *
 *        cycle
 * date  runtime forecast-hour
 * 11-29   00    00    03    06    09    12    15    18    21    24 ...
 * 11-29   06                00    03    06    09    12    15    18    21    24 ...
 * 11-29   12                            00    03    06    09    12    15    18    21    24 ...
 * 11-29   18                                        00    03    06    09    12    15    18    21    24 ...
 * 11-30   00                                                    00    03    06    09    12    15    18    21    24 ...
 *
 *       actual 00:00 00:03 00:06 00:09 00:12 00:15 00:18 00:21 00:00 00:03 00:06 00:09 00:12 00:15 00:18 00:21 00:00
 *        time  11-29 11-29 11-29 11-29 11-29 11-29 11-29 11-29 11-30 11-30 11-30 11-30 11-30 11-30 11-30 11-30 12-01
 *
 * See http://www.emc.ncep.noaa.gov/index.php?branch=GFS
 */

"use strict";

var util = require("util");
var tool = require("./tool");

var RUN_FREQ = 6;  // GFS cycles run every six hours, at 00, 06, 12, and 18 UTC.
var FORECAST_FREQ = 3;  // forecast files are available in three hour increments: 00, 03, 06, ...

/**
 * A collection of URLs describing the internet location for GFS files.
 */
exports.servers = {
    NCEP: "www.ftp.ncep.noaa.gov/data/nccf/com/gfs/prod/",
    NOMADS: "nomads.ncep.noaa.gov/pub/data/nccf/com/gfs/prod/"
};

/**
 * Returns an object that describes the most recent GFS cycle for the specified date. For example, specifying
 * 2013-11-04T05:50Z will return the cycle starting at 2013-11-04T00:00Z.
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
        hour: Math.floor(date.getUTCHours() / RUN_FREQ) * RUN_FREQ,  // round down to nearest runtime

        /**
         * @returns {Date} this cycle's start time.
         */
        date: function() {
            return new Date(tool.toISOString(this));
        },
        /**
         * @returns {Object} the cycle following this one.
         */
        next: function() {
            return cycle(tool.addHours(date, RUN_FREQ));
        },
        /**
         * @returns {Object} the cycle before this one.
         */
        previous: function() {
            return cycle(tool.addHours(date, -RUN_FREQ));
        }
    };
}; var cycle = exports.cycle;

/**
 * Returns an object that describes the most recent GFS forecast product within the specified cycle. For example,
 * specifying a forecast hour of 9 will return the product for T+9 within the provided cycle, where T is the cycle
 * start time.
 *
 * @param {String} type the GFS product type: ["0.5", "0.5b", "1.0", "2.5", "master"]
 * @param {Object} cycle a cycle object (see cycle function).
 * @param {Number} forecastHour the hour of the forecast product within the specified cycle.
 * @returns {Object} the product object.
 */
exports.product = function(type, cycle, forecastHour) {
    return {
        type: type,
        cycle: cycle,
        forecastHour: Math.floor(forecastHour / FORECAST_FREQ) * FORECAST_FREQ,  // round down to nearest multiple

        /**
         * @returns {String} the grid resolution for this product.
         */
        resolution: function() {
            switch (type) {
                case "0.5b":   return "0.5";
                case "master": return "0.5";
                default:       return type;
            }
        },
        /**
         * @returns {String} the name of this product's GRIB file.
         */
        file: function() {
            var cc = tool.pad(cycle.hour, 2);
            var ff = tool.pad(forecastHour, 2);
            switch (type) {
                case "0.5":    return util.format("gfs.t%sz.pgrb2f%s", cc, ff);
                case "0.5b":   return util.format("gfs.t%sz.pgrb2bf%s", cc, ff);
                case "1.0":    return util.format("gfs.t%sz.pgrbf%s.grib2", cc, ff);
                case "2.5":    return util.format("gfs.t%sz.pgrbf%s.2p5deg.grib2", cc, ff);
                case "master": return util.format("gfs.t%sz.mastergrb2f%s", cc, ff);
            }
            throw new Error("unknown type: " + type);
        },
        /**
         * @param {String} [parent] the parent directory
         * @returns {String} the directory containing this product's GRIB file, under the (optional) specified parent.
         */
        dir: function(parent) {
            var result =
                tool.coalesce(parent, "") +
                util.format("gfs.%s%s", tool.yyyymmdd(cycle.date()), tool.pad(cycle.hour, 2));
            return (type === "master" ? result + "/master" : result) + "/";
        },
        /**
         * @param {String} [parent] the parent directory
         * @returns {String} the full path for this product's GRIB file, under the (optional) specified parent.
         */
        path: function(parent) {
            return this.dir(parent) + this.file();
        },
        /**
         * @returns {Date} this product's reference time.
         */
        date: function() {
            return tool.addHours(cycle.date(), forecastHour);
        },
        /**
         * @returns {Object} the following forecast product.
         */
        next: function() {
            return product(type, cycle, forecastHour + FORECAST_FREQ);
        },
        /**
         * @returns {Object} the preceding forecast product.
         */
        previous: function() {
            return product(type, cycle, forecastHour - FORECAST_FREQ);
        }
    };
}; var product = exports.product;

/**
 * Returns an object that describes a layer within the specified GFS GRIB file.
 *
 * @param {Object} recipe the recipe {name:, filter:} for the layer.
 * @param {Object} product the GFS product.
 * @param {Boolean} [isCurrent] the layer is the special "current" form.
 * @returns {Object} the layer object.
 */
exports.layer = function(recipe, product, isCurrent) {
    return {
        recipe: recipe,
        product: product,
        isCurrent: isCurrent,

        /**
         * @returns {String} the name of this layer's JSON file.
         */
        file: function() {
            var parts = product.date().toISOString().split(/[- T:]/);  // extract hh and mm from date
            var timestamp = isCurrent ? "current" : (parts[3] + parts[4]);
            return util.format("%s-%s-gfs-%s.json", timestamp, recipe.name, product.resolution());
        },
        /**
         * @param {String} [parent] the parent directory
         * @returns {String} the directory containing this layer's JSON file, under the (optional) specified parent.
         */
        dir: function(parent) {
            var timestamp = isCurrent ? "current" : tool.yyyymmddPath(product.date());
            return tool.coalesce(parent, "") + timestamp + "/";
        },
        /**
         * @param {String} [parent] the parent directory
         * @returns {String} the full path for this layer's JSON file, under the (optional) specified parent.
         */
        path: function(parent) {
            return this.dir(parent) + this.file();
        },
        /**
         * @returns {Object} the following forecast layer.
         */
        next: function() {
            return layer(recipe, product.next(), isCurrent);
        },
        /**
         * @returns {Object} the preceding forecast layer.
         */
        previous: function() {
            return layer(recipe, product.previous(), isCurrent);
        }
    };
}; var layer = exports.layer;

var SECOND = 1;
var MINUTE = 60 * SECOND;
var HOUR = 60 * MINUTE;
var DAY = 24 * HOUR;

exports.cacheControlFor = function(layer) {
    return function() {
        // All forecast products farther out than three hours are replaced during the next cycle, so they live
        // only a short time. The 00 and 03 forecast products will never be replaced by future runs, so they
        // live a very long time. If it's a "current" layer, then it always lives a short time.
        var maxAge = layer.isCurrent || layer.product.forecastHour > 3 ? HOUR : 30 * DAY;
        return "public, max-age=" + maxAge;
    };
};
