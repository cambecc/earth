"use strict";

var util = require("util");
var stream = require("stream");
var fs = require("fs");
var crypto = require("crypto");
var zlib = require("zlib");
var when = require("when");
var tool = require("../tool");

var Readable = stream.Readable;
util.inherits(ReadableString, Readable);

function ReadableString(str, options) {
    Readable.call(this, options);
    this._str = str;
}

ReadableString.prototype._read = function() {
    this.push(this._complete ? null : new Buffer(this._str, "utf8"));
    this._complete = true;
};

exports.testCompress = function(test) {
    tool.compress(new ReadableString("abc")).then(function(path) {
        fs.createReadStream(path).pipe(zlib.createGunzip()).on("data", function(data) {
            test.equal(data.toString("utf8"), "abc");
            test.done();
        });
    }).then(null, tool.report);
};

exports.testHash = function(test) {
    tool.hash(new ReadableString("abc")).then(function(hash) {
        test.equal(hash.toString("hex"), "900150983cd24fb0d6963f7d28e17f72");
        test.done();
    }).then(null, tool.report);
    tool.hash(new ReadableString("abc"), "md5", "hex").then(function(hash) {
        test.equal(hash, "900150983cd24fb0d6963f7d28e17f72");
        test.done();
    }).then(null, tool.report);
};
