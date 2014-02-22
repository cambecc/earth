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
var path = require("path");
var when = require("when");
var guard = require('when/guard');

/**
 * Recursively walks a directory, invoking onFile for each file found.
 *
 * @param dir the starting directory of the walk
 * @param onFile a callback function(err, file, name, dir, stats) where file is the path of the file relative to
 *               the start of the walk, name is the name of the file, dir is the directory containing the
 *               the file, and stats is the fs.Stats object for the file. If the file is a directory, the callback
 *               can return true to skip walking the contents of the directory.
 */
function walk(dir, onFile) {
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
}

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
    return walk("public", onFile).then(function() {
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
