/*
 * find-chars - small utility to find all unique chars in all text files not already contained in characters.txt.
 *
 * The file characters.txt is used to build a subset font. The find-chars utility allows (somewhat incomplete)
 * detection of new chars that may not be included in the site's font, requiring a font rebuild.
 *
 * Font sub-setting of the M+ font used for the site can be performed here: http://font-face.jp/#mplus-2p-light
 *
 * don't really care about making the code nice at the moment
 * ideally, this would be a grunt task run at build time, and would warn/error on any new chars found
 */

"use strict";

var fs = require("fs");
var when = require("when");
var guard = require('when/guard');
var tool = require("./tool");

var inspections = [];
var existingChars = {};
var uniqueChars = {};

function inspect(target, file) {
    var d = when.defer();
    fs.readFile(file, {encoding: "utf8"}, function(err, data) {
        if (err) {
            return console.error(err);
        }
        for (var i = 0; i < data.length; i++) {
            // UNDONE: support for surrogate pairs
            var c = data.charAt(i);
            target[c] = true;
        }
        d.resolve();
    });
    return d.promise;
}

var inspectUnique_throttled = guard(guard.n(5), inspect.bind(null, uniqueChars));

function onFile(err, file, name, dir, stats) {
    if (err) {
        return console.error(err);
    }
    if (name.substr(0, 1) === ".") {
        return true;  // ignore hidden directories and files
    }
    if (name === "node_modules") {
        return true;  // ignore all node module sources
    }
    if (name === "characters.txt") {
        return true;  // ignore file we're diffing against
    }
    if (dir.substring(dir.length - 4) === "data") {
        return true;  // ignore the data directory
    }
    if (stats.isFile() && /\.(js|json|txt|html|css|md)$/.test(name)) {
        inspections.push(when(file).then(inspectUnique_throttled));
    }
}

inspect(existingChars, "characters.txt").then(function() {
    return tool.walk("../public", onFile).then(function() {
        return when.all(inspections).then(function() {
            var n = 0, keys = Object.keys(uniqueChars);
            keys.sort();
            for (var i = 0; i < keys.length; i++) {
                if (existingChars[keys[i]]) {
                    continue;
                }
                console.log("'" + keys[i] + "'");
                n++;
            }
            console.log("\nFound " + n + " new chars.");
        });
    });
}).otherwise(console.error);
