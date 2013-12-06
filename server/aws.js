/**
 * aws - deploys "earth" files to AWS S3
 */

"use strict";

var util = require("util");
var fs = require("fs");
var when = require("when");
var apply = require("when/apply");
var tool = require("./tool");
var AWS = require("aws-sdk");

AWS.config.loadFromPath("../private/aws-config.json");
var s3 = new AWS.S3();

exports.S3_BUCKET = "earth.nullschool.net";
exports.S3_LAYER_HOME = "data/weather/";

exports.headObject = function(params) {
    var d = when.defer();
    s3.client.headObject(params, function(error, data) {
        return error ? error.statusCode !== 404 ? d.reject(error) : d.resolve(error) : d.resolve(data);
    });
    return d.promise;
}; var headObject = exports.headObject;

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

exports.uploadFile = function(path, bucket, key, metadata, predicate, cacheControl) {

    cacheControl = cacheControl || tool.cacheControl;
    predicate = predicate || function() { return true; };
    var existing = headObject({Bucket: bucket, Key: key});
    var options = {
        Bucket: bucket,
        Key: key,
        ContentType: tool.contentType(path),
        CacheControl: cacheControl(key),
        StorageClass: "REDUCED_REDUNDANCY",  // cheaper
        Metadata: metadata || {}
    };

    if (tool.isCompressionRequired(options.ContentType)) {
        options.ContentEncoding = "gzip";
        path = tool.compress(fs.createReadStream(path));
    }

    var md5 = when(path).then(function(path) { return tool.hash(fs.createReadStream(path)); });

    return when.join(existing, path, md5).spread(function(existing, path, md5) {

        if (existing.statusCode !== 404 &&
                existing.ContentLength * 1 === fs.statSync(path).size &&
                existing.ETag.replace(/"/g, "") === md5.toString("hex") &&
                existing.ContentType === options.ContentType &&
                existing.CacheControl === options.CacheControl) {
            return {unchanged: existing};
        }
        if (!predicate(existing)) {  // predicate must be true to perform upload
            return {unchanged: existing};
        }

        options.ContentMD5 = md5.toString("base64");
        options.Body = fs.createReadStream(path);
        return putObject(options, md5.toString("hex"));

    });
};
