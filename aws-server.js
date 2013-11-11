/**
 * server - the "earth" server.
 */

"use strict";

console.log("============================================================");
console.log(new Date().toISOString() + " - Starting");

var util = require("util");
var when = require("when");
var nodefn = require("when/node/function");
var express = require("express");
var fs = require('fs');
var zlib = require('zlib');
var AWS = require('aws-sdk');

var mime = express.static.mime;
mime.define({"font/ttf": ["ttf"]});

var temp = require('temp');
// Automatically track and cleanup files at exit
temp.track(true);

AWS.config.loadFromPath('./scratch/aws-config.json');
var s3 = new AWS.S3();

function compressible(contentType) {
    return (/json|text|javascript|font/).test(contentType);
}

var cacheControl = function() {
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

function compress(input) {
    var d = when.defer();
    var gzip = zlib.createGzip({level: 9});
    var output = temp.createWriteStream();
    input.pipe(gzip).pipe(output).on("finish", function() {
        d.resolve(fs.createReadStream(output.path));
    });
    return d.promise;
}

function upload(path, bucket, key) {
    var contentType = mime.lookup(path);
    var options = {
        Bucket: bucket,
        Key: key,
        ContentType: contentType,
        CacheControl: cacheControl(key)
    };

    function putObject(stream) {
        console.log(util.inspect(options));
        options.Body = stream;
        s3.client.putObject(options, function(error, data) {
            if (error) {
                console.error(error);
            }
            else {
                console.log(path + ": " + util.inspect(data));
            }
        });
    }

    var stream = when(fs.createReadStream(path));
    if (compressible(contentType)) {
        options.ContentEncoding = "gzip";
        stream = stream.then(compress);
    }
    stream.then(putObject, console.error);
}

[

    "about.html",
    "index.html",
    "natural-earth.png",
    "css/styles.css",
    "css/mplus-2p-thin-056.ttf",
    "data/earth-topo.json",
    "data/weather/current/current_wind_isobaric_1000mb_gfs_0.5.json",
    "js/d3.v3.js",
    "js/d3.geo.polyhedron.v0.js",
    "js/d3.geo.projection.v0.js",
    "js/earth.js",
    "js/mvi.js",
    "js/topojson.v1.js",
    "js/util.js",
    "js/when.js"

].forEach(function(path) {
    upload("public/" + path, "test.nullschool.net", path);
});
