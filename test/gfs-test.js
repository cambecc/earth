"use strict";

var util = require("util");
var fs = require("fs");
var tool = require("../tool");
var gfs = require("../gfs");

exports.testCycle = function(test) {

    test.equal(
        JSON.stringify(gfs.cycle(new Date("2014-01-01T00:00Z"))),
        '{"year":2014,"month":1,"day":1,"hour":0}');
    test.equal(
        JSON.stringify(gfs.cycle(new Date("2014-01-01T05:59Z"))),
        '{"year":2014,"month":1,"day":1,"hour":0}');
    test.equal(
        JSON.stringify(gfs.cycle(new Date("2014-01-01T06:00Z"))),
        '{"year":2014,"month":1,"day":1,"hour":6}');
    test.equal(
        JSON.stringify(gfs.cycle(new Date("2014-01-01T12:01Z"))),
        '{"year":2014,"month":1,"day":1,"hour":12}');
    test.equal(
        JSON.stringify(gfs.cycle(new Date("2014-01-01T18:00Z"))),
        '{"year":2014,"month":1,"day":1,"hour":18}');
    test.equal(
        JSON.stringify(gfs.cycle(new Date("2014-01-01T23:59Z"))),
        '{"year":2014,"month":1,"day":1,"hour":18}');

    test.equal(
        JSON.stringify(gfs.cycle(new Date("2013-12-31T23:59Z")).next()),
        '{"year":2014,"month":1,"day":1,"hour":0}');
    test.equal(
        JSON.stringify(gfs.cycle(new Date("2014-01-01T00:00Z")).previous()),
        '{"year":2013,"month":12,"day":31,"hour":18}');

    test.deepEqual(gfs.cycle(new Date("2013-12-31T23:59Z")).date(), new Date("2013-12-31T18:00Z"));
    test.deepEqual(gfs.cycle(new Date("2014-01-01T00:01Z")).date(), new Date("2014-01-01T00:00Z"));

    test.done();
};

exports.testProduct = function(test) {

    var cycle = gfs.cycle(new Date("2014-01-01T00:00Z"));

    test.equal(
        JSON.stringify(gfs.product("0.5", cycle, 0)),
        '{"type":"0.5","cycle":{"year":2014,"month":1,"day":1,"hour":0},"forecastHour":0}');
    test.equal(
        JSON.stringify(gfs.product("0.5b", cycle, 1)),
        '{"type":"0.5b","cycle":{"year":2014,"month":1,"day":1,"hour":0},"forecastHour":0}');
    test.equal(
        JSON.stringify(gfs.product("1.0", cycle, 3)),
        '{"type":"1.0","cycle":{"year":2014,"month":1,"day":1,"hour":0},"forecastHour":3}');
    test.equal(
        JSON.stringify(gfs.product("2.5", cycle, 4)),
        '{"type":"2.5","cycle":{"year":2014,"month":1,"day":1,"hour":0},"forecastHour":3}');
    test.equal(
        JSON.stringify(gfs.product("master", cycle, 6)),
        '{"type":"master","cycle":{"year":2014,"month":1,"day":1,"hour":0},"forecastHour":6}');

    test.equal(gfs.product("0.5", cycle, 9).file(), "gfs.t00z.pgrb2f09");
    test.equal(gfs.product("0.5b", cycle, 12).file(), "gfs.t00z.pgrb2bf12");
    test.equal(gfs.product("1.0", cycle, 15).file(), "gfs.t00z.pgrbf15.grib2");
    test.equal(gfs.product("2.5", cycle, 18).file(), "gfs.t00z.pgrbf18.2p5deg.grib2");
    test.equal(gfs.product("master", cycle, 21).file(), "gfs.t00z.mastergrb2f21");

    test.deepEqual(gfs.product("0.5", cycle, 9).date(),  new Date("2014-01-01T09:00Z"));
    test.deepEqual(gfs.product("0.5", cycle, 12).date(), new Date("2014-01-01T12:00Z"));
    test.deepEqual(gfs.product("0.5", cycle, 15).date(), new Date("2014-01-01T15:00Z"));
    test.deepEqual(gfs.product("0.5", cycle, 18).date(), new Date("2014-01-01T18:00Z"));
    test.deepEqual(gfs.product("0.5", cycle, 21).date(), new Date("2014-01-01T21:00Z"));
    test.deepEqual(gfs.product("0.5", cycle, 27).date(), new Date("2014-01-02T03:00Z"));

    test.equal(gfs.product("0.5", cycle, 9).next().file(), "gfs.t00z.pgrb2f12");
    test.equal(gfs.product("0.5b", cycle, 12).next().file(), "gfs.t00z.pgrb2bf15");
    test.equal(gfs.product("1.0", cycle, 15).previous().file(), "gfs.t00z.pgrbf12.grib2");
    test.equal(gfs.product("2.5", cycle, 18).previous().file(), "gfs.t00z.pgrbf15.2p5deg.grib2");

    test.equal(gfs.product("0.5", cycle, 0).dir(), "gfs.2014010100/");
    test.equal(gfs.product("0.5b", cycle, 0).dir(), "gfs.2014010100/");
    test.equal(gfs.product("1.0", cycle, 0).dir(), "gfs.2014010100/");
    test.equal(gfs.product("2.5", cycle, 0).dir(), "gfs.2014010100/");
    test.equal(gfs.product("master", cycle, 0).dir(), "gfs.2014010100/master/");

    test.equal(gfs.product("0.5", cycle, 0).path(), "gfs.2014010100/gfs.t00z.pgrb2f00");
    test.equal(gfs.product("0.5b", cycle.next(), 3).path(), "gfs.2014010106/gfs.t06z.pgrb2bf03");
    test.equal(gfs.product("1.0", cycle, 6).path(), "gfs.2014010100/gfs.t00z.pgrbf06.grib2");
    test.equal(gfs.product("2.5", cycle, 0).path(), "gfs.2014010100/gfs.t00z.pgrbf00.2p5deg.grib2");
    test.equal(gfs.product("master", cycle, 0).path(), "gfs.2014010100/master/gfs.t00z.mastergrb2f00");

    test.equal(gfs.product("0.5", cycle, 0).path("foo/"), "foo/gfs.2014010100/gfs.t00z.pgrb2f00");
    test.equal(gfs.product("0.5b", cycle.next(), 3).path("foo/"), "foo/gfs.2014010106/gfs.t06z.pgrb2bf03");
    test.equal(gfs.product("1.0", cycle, 6).path("foo/"), "foo/gfs.2014010100/gfs.t00z.pgrbf06.grib2");
    test.equal(gfs.product("2.5", cycle, 0).path("foo/"), "foo/gfs.2014010100/gfs.t00z.pgrbf00.2p5deg.grib2");
    test.equal(gfs.product("master", cycle, 0).path("foo/"), "foo/gfs.2014010100/master/gfs.t00z.mastergrb2f00");

    test.done();
};

exports.testLayer = function(test) {

    var cycle = gfs.cycle(new Date("2014-01-01T00:00Z"));
    var product = gfs.product("0.5", cycle, 27);
    var recipe = {name: "a", filer: "f"};
    var layer = gfs.layer(recipe, product);

    test.deepEqual(layer.recipe, recipe);
    test.equal(layer.file(), "0300-a-gfs-0.5.json");
    test.equal(layer.dir(), "2014/01/02/");
    test.equal(layer.path(), "2014/01/02/0300-a-gfs-0.5.json");
    test.equal(layer.dir("foo/"), "foo/2014/01/02/");
    test.equal(layer.path("foo/"), "foo/2014/01/02/0300-a-gfs-0.5.json");

    test.equal(gfs.layer(recipe, gfs.product("master", cycle, 0)).file(), "0000-a-gfs-0.5.json");
    test.equal(gfs.layer(recipe, gfs.product("0.5b", cycle, 3)).file(), "0300-a-gfs-0.5.json");
    test.equal(gfs.layer(recipe, gfs.product("1.0", cycle, 9)).file(), "0900-a-gfs-1.0.json");
    test.equal(gfs.layer(recipe, gfs.product("2.5", cycle, 12)).file(), "1200-a-gfs-2.5.json");

    test.done();
};

exports.testCurrentLayer = function(test) {

    var cycle = gfs.cycle(new Date("2014-01-01T00:00Z"));
    var product = gfs.product("0.5", cycle, 27);
    var recipe = {name: "a", filer: "f"};
    var layer = gfs.layer(recipe, product, true);

    test.deepEqual(layer.recipe, recipe);
    test.equal(layer.file(), "current-a-gfs-0.5.json");
    test.equal(layer.dir(), "current/");
    test.equal(layer.path(), "current/current-a-gfs-0.5.json");
    test.equal(layer.dir("foo/"), "foo/current/");
    test.equal(layer.path("foo/"), "foo/current/current-a-gfs-0.5.json");

    test.equal(gfs.layer(recipe, gfs.product("master", cycle, 0), true).file(), "current-a-gfs-0.5.json");
    test.equal(gfs.layer(recipe, gfs.product("0.5b", cycle, 3), true).file(), "current-a-gfs-0.5.json");
    test.equal(gfs.layer(recipe, gfs.product("1.0", cycle, 9), true).file(), "current-a-gfs-1.0.json");
    test.equal(gfs.layer(recipe, gfs.product("2.5", cycle, 12), true).file(), "current-a-gfs-2.5.json");

    test.done();
};
