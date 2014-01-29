/**
 * oscar-update - a script to download OSCAR data and deploy extracted layers to AWS S3
 */

"use strict";

var INDENT; // = 2;
var GRIB2JSON_FLAGS = "-c -d -n";
var LAYER_RECIPES = [
    { name: "ocean_currents-surface-level", filter: "--fd 10 --fc 10 --fp currents --fs 160 --fv 15" }
];
var BASE_URL = "http://podaac-opendap.jpl.nasa.gov/opendap";
var CATALOG = BASE_URL + "/allData/oscar/preview/L4/oscar_third_deg/catalog.xml";

var util = require("util");
var fs = require("fs");
var path = require("path");
var _ = require("underscore"); _.str = require('underscore.string'); _.mixin(_.str.exports());
var when = require("when");
var guard = require("when/guard");
var mkdirp = require("mkdirp");
var temp = require("temp"); temp.track(true);
var tool = require("./tool");
var oscar = require("./oscar");
var scraper = require("./scraper");
var aws = require("./aws");
var log = tool.log();
var opt = function() {
    var argv = require("optimist")
        .usage("Usage: $0 -g {path} -l {path} [-p]")
        .demand(["g", "l"])
        .alias("g", "gridhome")
            .describe("g", "path where to save downloaded grid data files")
        .alias("l", "layerhome")
            .describe("l", "path where to save extracted layers")
        .alias("p", "push")
            .boolean("p")
            .describe("p", "push updated layers to S3")
        .argv;

    log.info("arguments: \n" + util.inspect(argv));
    return {
        gridHome: tool.ensureTrailing(argv.gridhome, "/"),
        layerHome: tool.ensureTrailing(argv.layerhome, "/"),
        push: argv.push
    }
}();

function fetchCatalog() {

    /* A typical catalog entry looks like:

        { type: 'tag',
          name: 'thredds:dataset',
          attribs:
           { name: 'oscar_vel7783.nc.gz',
             ID: '/opendap/hyrax/allData/oscar/preview/L4/oscar_third_deg/oscar_vel7783.nc.gz' },
          children:
           [ { type: 'tag',
               name: 'thredds:dataSize',
               attribs: { units: 'bytes' },
               children: [ { data: '493177744', type: 'text' } ] },
             { type: 'tag',
               name: 'thredds:date',
               attribs: { type: 'modified' },
               children: [ { data: '2013-07-02T08:38:12', type: 'text' } ] },
             { type: 'tag',
               name: 'thredds:access',
               attribs:
                { serviceName: 'dap',
                  urlPath: '/allData/oscar/preview/L4/oscar_third_deg/oscar_vel7783.nc.gz' } },
             { type: 'tag',
               name: 'thredds:access',
               attribs:
                { serviceName: 'file',
                  urlPath: '/allData/oscar/preview/L4/oscar_third_deg/oscar_vel7783.nc.gz' } } ] }, */

    return scraper.fetch(CATALOG).then(function(dom) {
        var catalog = scraper.getElementsByTagName("thredds:dataset", dom, true, 1)[0];
        return scraper.getElementsByTagName("thredds:dataset", catalog.children).map(function(entry) {
            var name = entry.attribs.name;
            name = _.endsWith(name, ".gz") ? name.substr(0, name.length - 3) : name;
            var link = scraper.getElementsByAttribute("serviceName", "file", entry)[0];
            return {name: name, url: BASE_URL + link.attribs.urlPath};
        });
    });
}

/**
 * Returns a promise for a downloaded product. If the product already exists, this method skips
 * the download and returns success. If the download fails, the promise is rejected. The file is
 * decompressed if the server responds with gzip content encoding.
 *
 * @param product object of the form {name:, url:}
 * @returns promise for the downloaded product.
 */
function download(product) {
    var localPath = path.join(opt.gridHome, product.name);
    if (fs.existsSync(localPath)) {
        log.info("already exists: " + localPath);
        return when.resolve(product);
    }

    var tempStream = temp.createWriteStream();
    var progress = 0;
    return when(true).then(function() {
        return tool.download(product.url, tempStream).then(
            function(result) {
                if (result.statusCode >= 300) {
                    log.info(util.format("download failed: %s", util.inspect(result)));
                    return product;
                }
                var kps = Math.round(result.received / 1024 / result.duration * 1000);
                log.info("download complete: " + kps + "Kps "  + product.url);
                var postProcess = when.resolve(tempStream.path);
                if ((result.headers["content-encoding"] || "").indexOf("gzip") >= 0) {
                    log.info("decompressing: " + product.url);
                    postProcess = tool.decompress(fs.createReadStream(tempStream.path));
                }
                return when(postProcess).then(function(tempPath) {
                    fs.renameSync(tempPath, localPath);
                    return product;
                })
            },
            null,
            function(update) {
                var current = Math.floor(update.received / 1024 / 1024);
                if (current > progress) {
                    log.info((progress = current) + "M " + product.url);
                }
            });
    });
}

function createTempSync(options) {
    var tempFile = temp.openSync(options);
    fs.closeSync(tempFile.fd);
    return tempFile.path;
}

function processLayer(recipe, path) {
    var data = tool.readJSONSync(path);
    return {data: data, layer: oscar.layer(recipe, data[0].header)};
}

function extractLayers(product) {
    var productPath = path.join(opt.gridHome, product.name);
    if (!fs.existsSync(productPath)) {
        log.info("product file not found, skipping: " + productPath);
        return when.resolve([]);
    }
    var layers = LAYER_RECIPES.map(function(recipe) {
        var tempPath = createTempSync({suffix: ".json"});
        var args = util.format("%s %s -o %s %s", GRIB2JSON_FLAGS, recipe.filter, tempPath, productPath);
        return tool.grib2json(args, process.stdout, process.stderr).then(function(returnCode) {
            if (returnCode !== 0) {
                log.info(util.format("grib2json failed (%s): %s", returnCode, productPath));
                return when.reject(returnCode);
            }
            log.info("processing: " + tempPath);
            var processed = processLayer(recipe, tempPath);
            var layer = processed.layer, layerPath = layer.path(opt.layerHome);
            mkdirp.sync(layer.dir(opt.layerHome));
            fs.writeFileSync(layerPath, JSON.stringify(processed.data, null, INDENT), {encoding: "utf8"});
            log.info("successfully built: " + layerPath);
            return layer;
        });
    });
    return when.all(layers);
}

function pushLayer(layer) {
    if (!opt.push) {
        // Push to S3 not enabled, so nothing to do.
        log.info("push flag not specified. Not updating S3.");
        return null;
    }

    var layerPath = layer.path(opt.layerHome);
    if (!fs.existsSync(layerPath)) {
        log.info("Layer file not found, skipping: " + layerPath);
        return null;
    }
    var key = layer.path(aws.S3_OSCAR_HOME);
    var metadata = {
        "reference-time": layer.date.toISOString()
    };
    function isNewerThan(existing) {
        var refTime = (existing.Metadata || {})["reference-time"];
        return !refTime || new Date(refTime) < layer.date;
    }
    var cacheControl = oscar.cacheControlFor(layer);
    return aws.uploadFile(layerPath, aws.S3_BUCKET, key, metadata, isNewerThan, cacheControl).then(function(result) {
        log.info(key + ": " + util.inspect(result));
        return true;
    });
}

function pushLayers(layers) {
    return when.map(layers, pushLayer);
}

function updateCatalog() {
    // First update the local catalog.
    var names = fs.readdirSync(opt.layerHome).filter(function(e) { return /oscar.*\.json/.test(e); }).sort();
    fs.writeFileSync(path.join(opt.layerHome, "catalog.json"), JSON.stringify(names, null, INDENT), {encoding: "utf8"});

    if (!opt.push) {
        // Push to S3 not enabled, so nothing to do.
        log.info("push flag not specified. Not updating S3.");
        return null;
    }

    // Now update the S3 catalog.
    return aws.listObjects({Bucket: aws.S3_BUCKET, Prefix: aws.S3_OSCAR_HOME}).then(function(data) {
        var names = _.pluck(data.Contents, "Key")
            .map(function(e) { return e.substr(aws.S3_OSCAR_HOME.length); })
            .filter(function(e) { return /oscar.*\.json/.test(e); })
            .sort();
        var tempFile = createTempSync({suffix: ".json"});
        var key = aws.S3_OSCAR_HOME + "catalog.json";
        fs.writeFileSync(tempFile, JSON.stringify(names, null, INDENT), {encoding: "utf-8"});
        return aws.uploadFile(tempFile, aws.S3_BUCKET, key).then(function(result) {
            log.info(key + ": " + util.inspect(result));
            return true;
        });
    });
}

function downloadLatestProduct(catalog) {
    var latest = _.last(catalog);
    return download(latest);
}

log.info("options: \n" + util.inspect(opt));
mkdirp.sync(opt.gridHome);
mkdirp.sync(opt.layerHome);

fetchCatalog()
    .then(downloadLatestProduct)
    .then(extractLayers)
    .then(pushLayers)
    .then(updateCatalog)
    .otherwise(tool.report)
    .done();

//var process_throttled = guard(guard.n(1), function(product) {
//    return download(product).then(extractLayers).then(pushLayers);
//});
//function processAll(catalog) {
//    return when.map(catalog.filter(function(product) { return /oscar_vel7[456]/.test(product.name); }), process_throttled)
//        .otherwise(tool.report);
//}
//fetchCatalog()
//    .then(processAll)
//    .then(updateCatalog)
//    .otherwise(tool.report).done();
