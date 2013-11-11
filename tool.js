/**
 * tool - a set of general utility functions
 */

"use strict";

var when = require("when");
var zlib = require("zlib");
var crypto = require("crypto");
var mime = require("express").static.mime;
var temp = require("temp");

// CF won't compress MIME type "application/x-font-ttf" (the express.js default) but will compress "font/ttf".
// https://support.cloudflare.com/hc/en-us/articles/200168396-What-will-CloudFlare-gzip-
mime.define({"font/ttf": ["ttf"]});

temp.track(true);

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
