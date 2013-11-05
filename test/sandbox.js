"use strict";

exports.testSomething = function(test) {

    console.log(encodeURI("http://test.nullschool.net/#data=2013-11-05T06_wind_isobaric_1000mb_gfs_2.5&pos=31.322_-1230.34"));

    test.done();
}
