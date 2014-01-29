/**
 * oscar: a collection of objects to describe Ocean Surface Current Analyses Real-time (OSCAR) data.
 *
 * See http://www.esr.org/oscar_index.html
 */

"use strict";

var util = require("util");
var tool = require("./tool");
var _ = require("underscore"); _.str = require('underscore.string'); _.mixin(_.str.exports());

exports.layer = function(recipe, header) {
    var date = new Date(header.refTime);
    return {
        recipe: recipe,
        date: date,
        file: function() {
            var parts = this.date.toISOString().split(/[- T:]/);
            return util.format("%s%s%s-surface-currents-oscar-0.33.json", parts[0], parts[1], parts[2]);
        },
        dir: function(parent) {
            return parent;
        },
        path: function(parent) {
            return this.dir(parent) + this.file();
        }
    }
}

var SECOND = 1;
var MINUTE = 60 * SECOND;
var HOUR = 60 * MINUTE;
var DAY = 24 * HOUR;

exports.cacheControlFor = function(layer) {
    return function() {
        var maxAge = layer.isCurrent ? 1 * DAY : 30 * DAY;
        return "public, max-age=" + maxAge;
    };
};
