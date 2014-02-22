/**
 * expand - expands templates with internationalized strings. The resulting HTML files are written to disk.
 *
 * This utility builds the Japanese and English versions of the HTML files. The templates are written using Swig,
 * and roughly follows the methodology described at http://ejohn.org/blog/a-strategy-for-i18n-and-node/
 *
 * English files are placed in the root: public/
 * Japanese files are placed under the language code: public/jp
 * ...and so on for other languages, if ever...
 *
 * don't really care about making the code nice at the moment
 * ideally, this would be a grunt task run at build time
 */

"use strict";

var fs = require("fs");
var path = require("path");
var swig = require("swig");
var mkdirp = require("mkdirp");
var dictionary = require("./public/templates/il8n.json");

var templateDir = "public/templates";

var templates = [
    "index.html",
    "about.html"
];

var languages = [
    {code: "en", target: "public"},
    {code: "ja", target: "public/jp"}  // *lang* code for Japanese is JA not JP. Too late now. Site already public.
];

function newContext(languageCode) {
    return {
        __: function(s) {
            var entry = dictionary[s];
            if (!entry) {
                console.error("unknown il8n key: " + s);
            }
            return entry && entry[languageCode] || s;
        }
    };
}

templates.forEach(function(file) {
    var template = swig.compileFile(path.join(templateDir, file));

    languages.forEach(function(language) {

        var context = newContext(language.code);
        var result = template(context);

        mkdirp.sync(language.target);
        fs.writeFileSync(path.join(language.target, file), result);
    });
});
