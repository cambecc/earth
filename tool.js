/**
 * tool - a set of general utility functions
 */

"use strict";

var zlib = require("zlib");
var crypto = require("crypto");
var http = require("http");
var url = require("url");
var when = require("when");
var mime = require("express").static.mime;
var temp = require("temp");
var spawn = require("child_process").spawn;

// CF won't compress MIME type "application/x-font-ttf" (the express.js default) but will compress "font/ttf".
// https://support.cloudflare.com/hc/en-us/articles/200168396-What-will-CloudFlare-gzip-
mime.define({"font/ttf": ["ttf"]});

temp.track(true);

exports.isNullOrUndefined = function(x) {
    return x === null || x === undefined;
}; var isNullOrUndefined = exports.isNullOrUndefined;

exports.coalesce = function(a, b) {
    return isNullOrUndefined(a) ? b : a;
};

exports.report = function(e) {
    console.error(e.stack ? e.stack : e);
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
    var DEFAULT = 30 * MINUTE;

    var rules = [
        // very-short-lived
        [/data\/.*\/current/, 1 * MINUTE],

        // short-lived (default behavior for all other resources)
        [/js\/earth\.js/, DEFAULT],  // override medium-lived .js rule below
        [/js\/mvi\.js/, DEFAULT],  // override medium-lived .js rule below
        [/js\/util\.js/, DEFAULT],  // override medium-lived .js rule below

        // long-lived
        [/js\/.*\.js/, 30 * DAY],
        [/earth-topo\.json/, 30 * DAY],
        [/mplus-.*\.ttf/, 30 * DAY],
        [/\.png|\.ico/, 30 * DAY]
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
    hash.setEncoding(encoding || "hex");
    input.pipe(hash).on("finish", function() {
        d.resolve(hash.read());
    });
    return d.promise;
};

//exports.head = function(resource) {
//    var d = when.defer(), r = url.parse(resource);
//    var params = {method: "HEAD", host: r.hostname, port: r.port || 80, path: r.pathname};
//    http.request(params, function(res) {
//        res.on("data", function() {
//        });
//        res.on("error", function(error) {
//            d.reject(error);
//        });
//        res.on("end", function() {
//            d.resolve({statusCode: res.statusCode, headers: res.headers});
//        });
//    }).end();
//    return d.promise;
//};

exports.download = function(resource, output) {
    var d = when.defer();
    http.get(resource, function(res) {
        var start = Date.now(), received = 0, total = +res.headers["content-length"] || NaN;

        res.pipe(output);

        res.on("data", function(chunk) {
            d.notify({block: chunk.length, received: received += chunk.length, total: total});
        });
        res.on("error", function(error) {
            d.reject(error);
        });
        output.on("finish", function() {
            output.close();
            d.resolve({
                statusCode: res.statusCode,
                headers: res.headers,
                received: received,
                duration: Date.now() - start});
        });
    });
    return d.promise;
}

exports.grib2json = function(args, out, err) {
    var d = when.defer();
    var child = spawn("grib2json", args instanceof Array ? args : args.split(" "));

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
}

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
}
