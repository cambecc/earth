/**
 * aws - deploys "earth" files to AWS S3
 */

"use strict";

console.log("============================================================");
console.log(new Date().toISOString() + " - Starting");

var util = require("util");
var fs = require("fs");
var when = require("when");
var apply = require("when/apply");
var AWS = require("aws-sdk");
var tool = require(__dirname + "/tool");

AWS.config.loadFromPath("./scratch/aws-config.json");
var s3 = new AWS.S3();

function headObject(params) {
    var d = when.defer();
    s3.client.headObject(params, function(error, data) {
        return error ? error.statusCode !== 404 ? d.reject(error) : d.resolve(error) : d.resolve(data);
    });
    return d.promise;
}

function putObject(params, expectedETag) {
    var d = when.defer();
    s3.client.putObject(params, function(error, data) {
        if (error) {
            return d.reject(error);
        }
        if (expectedETag && data.ETag.replace(/"/g, "") !== expectedETag) {
            return d.reject({expected: expectedETag, data: data});
        }
        delete params.Body;
        return d.resolve({putObject: params, response: data});
    });
    return d.promise;
}

function uploadFile(path, bucket, key) {

    var meta = headObject({Bucket: bucket, Key: key});
    var options = {
        Bucket: bucket,
        Key: key,
        ContentType: tool.contentType(path),
        CacheControl: tool.cacheControl(key)
    };

    if (tool.isCompressionRequired(options.ContentType)) {
        options.ContentEncoding = "gzip";
        path = tool.compress(fs.createReadStream(path));
    }

    var md5 = when(path).then(function(path) { return tool.hash(fs.createReadStream(path)); });

    return when.all([meta, path, md5]).then(apply(function(meta, path, md5) {

        if (meta.statusCode !== 404 &&
            meta.ContentLength * 1 === fs.statSync(path).size &&
            meta.ETag.replace(/"/g, "") === md5 &&
            meta.ContentType === options.ContentType &&
            meta.CacheControl === options.CacheControl) {

            return {unchanged: meta};
        }

        options.Body = fs.createReadStream(path);
        return putObject(options, md5);

    }));
}

// UNDONE: delete objects in S3 but not in the list below
// UNDONE: super awesome logic that defines and iterates file sets, to eliminate this list
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

].forEach(function(key) {
    uploadFile("public/" + key, "test.nullschool.net", key).then(function(result) {
        console.log(key + ": " + util.inspect(result));
    }, tool.report);
});
