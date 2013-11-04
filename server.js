/**
 * server - the "earth" server.
 */

"use strict";

console.log("============================================================");
console.log(new Date().toISOString() + " - Starting");

/**
 * Returns true if the response should be compressed.
 */
function compressionFilter(req, res) {
    return /json|text|javascript|font/.test(res.getHeader('Content-Type'));
}

/**
 * Adds headers to a response to enable caching. maxAge is number of seconds to cache the response.
 */
function prepareCacheControl(res, maxAge) {
    res.setHeader("Cache-Control", "public, max-age=" + maxAge);
    if (maxAge) {
        var now = (Math.ceil(Date.now() / 1000) + 1) * 1000;
        res.setHeader("Expires", new Date(now + maxAge * 1000).toUTCString());
    }
}

function cacheControl() {
    var SECOND = 1;
    var MINUTE = 60 * SECOND;
    var HOUR = 60 * MINUTE;
    var DAY = 24 * HOUR;
    var DEFAULT = 30 * MINUTE;

    var rules = [
        // very-short-lived
        [/data\/.*\/current/, 1 * MINUTE],

        // short-lived (default behavior for all other resources)
        [/js\/air\.js/, DEFAULT],  // override medium-lived .js rule below
        [/js\/mvi\.js/, DEFAULT],  // override medium-lived .js rule below

        // medium-lived
        [/js\/.*\.js/, 5 * DAY],
        [/tokyo-topo\.json/, 5 * DAY],

        // long-lived
        [/mplus-.*\.ttf/, 30 * DAY],
        [/\.png|\.ico/, 30 * DAY]
    ];

    return function(req, res, next) {
        var maxAge = DEFAULT;
        for (var i = 0; i < rules.length; i++) {
            var rule = rules[i];
            if (rule[0].test(req.url)) {
                maxAge = rule[1];
                break;
            }
        }
        prepareCacheControl(res, maxAge);
        return next();
    };
}

function logger() {
    express.logger.token("date", function() {
        return new Date().toISOString();
    });
    express.logger.token("response-all", function(req, res) {
        return (res._header ? res._header : "").trim();
    });
    return express.logger(
        ':date - info: :remote-addr :req[cf-connecting-ip] :req[cf-ipcountry] :method :url HTTP/:http-version ' +
        '":user-agent" :referrer :req[cf-ray]');
        // '":user-agent" :referrer :req[cf-ray]\\n:response-all\\n');
}

function staticResources() {
    // CF won't compress MIME type "application/x-font-ttf" (the express.js default) but will compress "font/ttf".
    // https://support.cloudflare.com/hc/en-us/articles/200168396-What-will-CloudFlare-gzip-
    express.static.mime.define({"font/ttf": ["ttf"]});
    return express.static(__dirname + "/public");
}

var port = process.argv[2];
var express = require("express");
var app = express();

app.use(cacheControl());
app.use(express.compress({filter: compressionFilter}));
app.use(logger());
app.use(staticResources());

app.listen(port);
console.log("Listening on port " + port + "...");
