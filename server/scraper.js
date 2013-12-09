/**
 * scraper - a set of utility methods to make scraping HTML easier
 */

"use strict";

var when = require("when");
var http = require("http");
var htmlparser = require("htmlparser");
var tool = require("./tool");
var log = tool.log();

/**
 * Converts the provided HTML text into a dom.
 *
 * @param {string} text
 * @returns {Object} object representing the dom
 */
function parseHTML(text) {
    var handler = new htmlparser.DefaultHandler(null, {verbose: false, ignoreWhitespace: true});
    new htmlparser.Parser(handler).parseComplete(text);
    return handler.dom;
}

/**
 * Performs an http GET and parses the HTML into a dom. The result is a promise for the dom.
 *
 * @param options same as those taken by the http.request method.
 * @param [converter] a callback that takes a buffer and converts it to another format.
 * @returns {promise} a promise for the parsed dom of the specified url
 */
exports.fetch = function(options, converter) {
    converter = converter || function(buffer) { return buffer; };
    var d = when.defer();
    log.info("get: " + options);
    http.get(options, function(response) {
        var chunks = [];
        response.on("data", function(chunk) {
            chunks.push(chunk);
        });
        response.on("end", function() {
            log.info("got: " + options);
            var converted = converter(Buffer.concat(chunks));
            var parsed = parseHTML(converted);
            log.info("done: " + options);
            d.resolve(parsed);
        });
    }).on("error", function(error) {
        d.reject(error);
    });
    return d.promise;
};

/**
 * Returns the match results of all text nodes in the provided dom, satisfying the specified regex, as elements
 * in an array.
 *
 * @param regex a regular expression.
 * @param {Object} dom a parse tree obtained from calling the parseHTML function.
 * @returns {Array} an array of regex match results.
 */
exports.matchText = function(regex, dom) {
    var results = [];
    function matchForRegex(data) {
        var match = data.match(regex);
        return match ? results.push(match) : false;
    }
    htmlparser.DomUtils.getElements({tag_type: "text", tag_contains: matchForRegex}, dom);
    return results;
};

/**
 * Returns the values of the attributes of all elements of the specified tag in the dom.
 *
 * @param {String} tag the name of the tag: a, h1, img, etc.
 * @param {String} attribute the attribute: href, id, class, etc.
 * @param {Object} dom a parse tree obtained from calling the parseHTML function.
 * @returns {Array} an array of matching attribute values
 */
exports.extractAttributes = function(tag, attribute, dom) {
    var results = [];
    var elements = htmlparser.DomUtils.getElementsByTagName(tag, dom);
    htmlparser.DomUtils.getElements({href: function(x) { results.push(x); return true; }}, elements);
    return results;
};
