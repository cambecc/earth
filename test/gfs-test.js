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

    test.equal(gfs.cycle(new Date("2013-12-31T23:59Z")).yyyymmdd(), "20131231");
    test.equal(gfs.cycle(new Date("2014-01-01T00:00Z")).yyyymmdd(), "20140101");

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

    test.equal(gfs.product("0.5", cycle, 9).name(), "gfs.t00z.pgrb2f09");
    test.equal(gfs.product("0.5b", cycle, 12).name(), "gfs.t00z.pgrb2bf12");
    test.equal(gfs.product("1.0", cycle, 15).name(), "gfs.t00z.pgrbf15.grib2");
    test.equal(gfs.product("2.5", cycle, 18).name(), "gfs.t00z.pgrbf18.2p5deg.grib2");
    test.equal(gfs.product("master", cycle, 21).name(), "gfs.t00z.mastergrb2f21");

    test.equal(gfs.product("0.5", cycle, 9).next().name(), "gfs.t00z.pgrb2f12");
    test.equal(gfs.product("0.5b", cycle, 12).next().name(), "gfs.t00z.pgrb2bf15");
    test.equal(gfs.product("1.0", cycle, 15).previous().name(), "gfs.t00z.pgrbf12.grib2");
    test.equal(gfs.product("2.5", cycle, 18).previous().name(), "gfs.t00z.pgrbf15.2p5deg.grib2");

    test.equal(gfs.product("0.5", cycle, 0).path(), "gfs.2014010100");
    test.equal(gfs.product("0.5b", cycle, 0).path(), "gfs.2014010100");
    test.equal(gfs.product("1.0", cycle, 0).path(), "gfs.2014010100");
    test.equal(gfs.product("2.5", cycle, 0).path(), "gfs.2014010100");
    test.equal(gfs.product("master", cycle, 0).path(), "gfs.2014010100/master");

    test.equal(gfs.product("0.5", cycle, 0).nextCycle().path(), "gfs.2014010106");
    test.equal(gfs.product("0.5b", cycle, 0).nextCycle().path(), "gfs.2014010106");
    test.equal(gfs.product("1.0", cycle, 0).previousCycle().path(), "gfs.2013123118");
    test.equal(gfs.product("2.5", cycle, 0).previousCycle().path(), "gfs.2013123118");
    test.equal(gfs.product("master", cycle, 0).previousCycle().path(), "gfs.2013123118/master");

    test.equal(gfs.product("0.5", cycle, 0).url("foo/"), "foo/gfs.2014010100/gfs.t00z.pgrb2f00");
    test.equal(gfs.product("0.5b", cycle.next(), 3).url("foo/"), "foo/gfs.2014010106/gfs.t06z.pgrb2bf03");
    test.equal(gfs.product("1.0", cycle, 6).url("foo/"), "foo/gfs.2014010100/gfs.t00z.pgrbf06.grib2");
    test.equal(gfs.product("2.5", cycle, 0).url("foo/"), "foo/gfs.2014010100/gfs.t00z.pgrbf00.2p5deg.grib2");
    test.equal(gfs.product("master", cycle, 0).url("foo/"), "foo/gfs.2014010100/master/gfs.t00z.mastergrb2f00");

    test.done();
}

exports.testDownload = function(test) {

//    var cycle = gfs.cycle(Date.now());
//    var product = gfs.product("1.0", cycle, 0);
//    var client = gfs.client("http://" + gfs.NOMADS);
//
//    tool.download("http://" + gfs.NOMADS).then(function(res) {
//        console.log("result:" + util.inspect(res));
//    }, tool.report);
//
//    client.download(product, fs.createWriteStream(product.name())).then(function(res) {
//        if (res.statusCode != 200) {
//            console.log(res);
//            return;
//        }
//        var args = util.format("-c -d --fp wind --fs 100 --fv 100000 -o %s.json %s", product.name(), product.name());
//        tool.grib2json(args, process.stdout, process.stderr).then(null, tool.report);
//    });

    test.done();
}
