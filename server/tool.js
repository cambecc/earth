/**
 * tool - a dumping ground for general utility functions
 */

"use strict";

var util = require("util");
var zlib = require("zlib");
var crypto = require("crypto");
var http = require("http");
var url = require("url");
var when = require("when");
var winston = require("winston");
var mime = require("express").static.mime;
var temp = require("temp");
var spawn = require("child_process").spawn;
var fs = require("fs");
var path = require("path");

// CF won't compress MIME type "application/x-font-ttf" (the express.js default) but will compress "font/ttf".
// https://support.cloudflare.com/hc/en-us/articles/200168396-What-will-CloudFlare-gzip-
mime.define({"font/ttf": ["ttf"]});

temp.track(true);

/**
 * Returns a new, nicely configured winston logger.
 *
 * @returns {winston.Logger}
 */
exports.log = function() {
    return new (winston.Logger)({
        transports: [
            new (winston.transports.Console)({level: 'debug', timestamp: true, colorize: false})
        ]
    });
}; var log = exports.log();

exports.isNullOrUndefined = function(x) {
    return x === null || x === undefined;
}; var isNullOrUndefined = exports.isNullOrUndefined;

exports.coalesce = function(a, b) {
    return isNullOrUndefined(a) ? b : a;
}; var coalesce = exports.coalesce;

exports.report = function(e) {
    log.error(e.stack ? e.stack : e);
};

exports.contentType = function(path) {
    return mime.lookup(path);
};

exports.isCompressionRequired = function(contentType) {
    return (/json|text|javascript|font/).test(contentType);
};

exports.cacheControl = function() {
    var SECOND = 1;
    var MINUTE = 60 * SECOND;
    var HOUR = 60 * MINUTE;
    var DAY = 24 * HOUR;
    var DEFAULT = 6 * HOUR;

    var rules = [
        // very-short-lived
        [/data\/.*\/current/, 1 * MINUTE],

        // short-lived (default behavior for all other resources)
        [/libs\/earth\/.*\.js/, DEFAULT],  // override medium-lived .js rule below

        // long-lived
        [/libs\/.*\.js/, 30 * DAY],

        // extremely long-lived
        [/\.(ico|png|jpg|ttf)/, 365 * DAY],
        [/earth-topo\.json/, 365 * DAY]
    ];

    return function(key) {
        var maxAge = DEFAULT;
        for (var i = 0; i < rules.length; i++) {
            var rule = rules[i];
            if (rule[0].test(key)) {
                maxAge = rule[1];
                break;
            }
        }
        return "public, max-age=" + maxAge;
    };
}();

exports.compress = function(input, options) {
    var d = when.defer(), gzip = zlib.createGzip(options || {level: 9}), output = temp.createWriteStream();
    input.pipe(gzip).pipe(output).on("finish", function() {
        d.resolve(output.path);
    });
    return d.promise;
};

exports.hash = function(input, algorithm, encoding) {
    var d = when.defer(), hash = crypto.createHash(algorithm || "md5");
    hash.setEncoding(encoding = encoding || "binary");
    input.pipe(hash).on("finish", function() {
        var output = hash.read();
        d.resolve(encoding === "binary" ? new Buffer(output, "binary") : output);
    });
    return d.promise;
};

exports.head = function(resource) {
    var d = when.defer();
    var options = typeof resource === "string" ? url.parse(resource) : resource;
    options.method = "HEAD";
    http.request(options, function(res) {
        res.on("data", function() {
        });
        res.on("error", function(error) {
            d.reject(error);
        });
        res.on("end", function() {
            d.resolve({statusCode: res.statusCode, headers: res.headers});
        });
    }).end();
    return d.promise;
};

exports.download = function(resource, output) {
    var d = when.defer();
    var start = Date.now();
    http.get(resource, function(res) {
        var total = +res.headers["content-length"];
        var received = 0;

        res.on("data", function(chunk) {
            d.notify({resource: resource, block: chunk.length, received: received += chunk.length, total: total});
        });
        res.on("error", function(error) {
            d.reject(error);
        });
        res.on("end", function() {
            d.resolve({
                resource: resource,
                statusCode: res.statusCode,
                headers: res.headers,
                received: received,
                duration: Date.now() - start});
        });
        if (output) {
            res.pipe(output);
            output.on("finish", function() {
                output.close();
            });
        }
    });
    return d.promise;
};

exports.grib2json = function(args, out, err) {
    var d = when.defer();
    var command = process.platform.indexOf("win") >= 0 ? "grib2json.bat" : "grib2json";
    log.info(command + " " + args);
    var child = spawn(command, args instanceof Array ? args : args.split(" "));

    if (out) {
        child.stdout.pipe(out);
    }
    if (err) {
        child.stderr.pipe(err);
    }

    child.on("close", function(code) {
        d.resolve(code);
    });

    return d.promise;
};

/**
 * Returns the string representation of a number padded with leading characters to make
 * it at least "width" length.
 *
 * @param {Number} n the number to convert to a padded string
 * @param {Number} width the desired minimum width of the resulting string
 * @param {Object} [options] an object with keys:
 *                     [char:] the character to use for padding, default is "0";
 *                     [radix:] the radix to use for number conversion, default is 10;
 * @returns {String} the padded string
 */
exports.pad = function(n, width, options) {
    options = options || {};
    var s = n.toString(options.radix);
    var i = Math.max(width - s.length, 0);
    return new Array(i + 1).join(options.char || "0") + s;
}; var pad = exports.pad;

/**
 * Returns a new date having the specified hours added to the provided date.
 *
 * @param {Date, Number, String} date a Date object, milliseconds from epoch, or ISO date string
 * @param {Number} hours the hours to add
 * @returns {Date} a new date
 */
exports.addHours = function(date, hours) {
    date = new Date(date);
    date.setHours(date.getHours() + hours);
    return date;
};

/**
 * Returns the date as an ISO string having the specified zone:  "yyyy-MM-dd hh:mm:ss±xx:yy"
 */
function dateToISO(date, zone) {
    return !isNaN(date.getFullYear()) ?
        util.format("%s-%s-%s %s:%s:%s%s",
            date.getFullYear(),
            pad(date.getMonth() + 1, 2),
            pad(date.getDate(), 2),
            pad(date.getHours(), 2),
            pad(date.getMinutes(), 2),
            pad(date.getSeconds(), 2),
            zone) :
        null;
}

/**
 * Converts the specified object containing date fields to an ISO 8601 formatted string. This function first
 * constructs a Date object by providing the specified fields to the date constructor, then produces a string from
 * the resulting date. As a consequence of constructing a Date object, date fields in excess of the normal ranges
 * will cause the date to overflow to the next valid date. For example, toISOString({year:2013, month:1, day:31,
 * hour:24}) will produce the string "2013-02-01 00:00:00Z".
 *
 * @param {object} dateFields an object with keys:
 *                     [year:] the four digit year, default is 1901;
 *                     [month:] the month (1-12), default is 1;
 *                     [day:] the day, default is 1;
 *                     [hour:] the hour, default is 0;
 *                     [minute:] minutes, default is 0;
 *                     [second:] seconds, default is 0;
 *                     [zone:] a valid ISO timezone offset string, such as "+09:00", default is "Z"
 * @returns {string} the specified parts in ISO 8601 format: yyyy-MM-dd hh:mm:ss±xx:yy, or null if the parts do not
 *                   represent a valid date.
 */
exports.toISOString = function(dateFields) {
    var date = new Date(
        coalesce(dateFields.year, 1901),
        coalesce(dateFields.month, 1) - 1,
        coalesce(dateFields.day, 1),
        coalesce(dateFields.hour, 0),
        coalesce(dateFields.minute, 0),
        coalesce(dateFields.second, 0));

    return dateToISO(date, coalesce(dateFields.zone, "Z"));
};

/**
 * Converts the date represented by the specified ISO string to a different time zone.
 *
 * @param isoString a date in ISO 8601 format: yyyy-MM-dd hh:mm:ss±xx:yy.
 * @param zone a valid ISO timezone offset string, such as "+09:00", representing the zone to convert to.
 * @returns {string} the date adjusted to the specified time zone as an ISO 8601 string.
 */
exports.withZone = function(isoString, zone) {
    zone = coalesce(zone, "Z");
    var adjust = zone === "Z" ? 0 : +(zone.split(":")[0]) * 60;

    var date = new Date(isoString);
    date.setMinutes(date.getMinutes() + adjust + date.getTimezoneOffset());

    return dateToISO(date, zone);
}; var withZone = exports.withZone;

exports.yyyymmdd = function(date, zone) {
    var iso = withZone(date.toISOString(), zone).split(/[- T:]/);
    return iso[0] + iso[1] + iso[2];
};

exports.yyyymmddhh = function(date, zone) {
    var iso = withZone(date.toISOString(), zone).split(/[- T:]/);
    return iso[0] + iso[1] + iso[2] + iso[3];
};

exports.yyyymmddPath = function(date, zone) {
    var iso = withZone(date.toISOString(), zone).split(/[- T:]/);
    return iso[0] + "/" + iso[1] + "/" + iso[2];
};

exports.ensureTrailing = function(s, c) {
    return s.lastIndexOf(c) < s.length - 1 ? s + c : s;
};

/**
 * Recursively walks a directory, invoking onFile for each file found.
 *
 * @param dir the starting directory of the walk
 * @param onFile a callback function(err, file, name, dir, stats) where file is the path of the file relative to
 *               the start of the walk, name is the name of the file, dir is the directory containing the
 *               the file, and stats is the fs.Stats object for the file. If the file is a directory, the callback
 *               can return true to skip walking the contents of the directory.
 */
exports.walk = function(dir, onFile) {
    var d = when.defer();
    var pending = 1;

    function visit(dir, name) {
        var file = path.join(dir, name);
        fs.stat(file, function(err, stats) {
            var abort = onFile(err, file, name, dir, stats);
            if (!abort && stats && stats.isDirectory()) {
                return expand(file);
            }
            if (!--pending) {
                d.resolve();
            }
        });
    }

    function expand(dir) {
        fs.readdir(dir, function(err, names) {
            pending += names.length;
            names.forEach(function(name) {
                visit(dir, name);
            });
            if (!--pending) {
                d.resolve();
            }
        });
    }

    expand(dir);
    return d.promise;
};

exports.readJSONSync = function(path) {
    return JSON.parse(fs.readFileSync(path, {encoding: "utf8"}));
};
