/**
 * oscar: a collection of objects to describe Ocean Surface Current Analyses Real-time (OSCAR) data.
 *
 * See http://www.esr.org/oscar_index.html
 */

"use strict";

var util = require("util");
var tool = require("./tool");
var _ = require("underscore"); _.str = require('underscore.string'); _.mixin(_.str.exports());

exports.layer = function(recipe, header, isCurrent) {
    var date = new Date(header.refTime);
    return {
        recipe: recipe,
        isCurrent: isCurrent,
        date: date,
        file: function() {
            var parts = this.date.toISOString().split(/[- T:]/);  // extract hh and mm from date
            var timestamp = isCurrent ? "current" : (parts[3] + parts[4]);
            return util.format("%s-%s-oscar-0.33.json", timestamp, recipe.name);
        },
        dir: function(parent) {
            var timestamp = isCurrent ? "current" : tool.yyyymmddPath(this.date);
            return tool.coalesce(parent, "") + timestamp + "/";
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
