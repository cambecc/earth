/**
 * products - defines the behavior of weather data grids, including grid construction, interpolation, and color scales.
 *
 * Copyright (c) 2014 Cameron Beccario
 * The MIT License - http://opensource.org/licenses/MIT
 *
 * https://github.com/cambecc/earth
 */
var products = function() {
    "use strict";

    var WEATHER_PATH = "/data/weather";
    var OSCAR_PATH = "/data/oscar";
    var catalogs = {
        // The OSCAR catalog is an array of file names, sorted and prefixed with yyyyMMdd. Last item is the
        // most recent. For example: [ 20140101-abc.json, 20140106-abc.json, 20140112-abc.json, ... ]
        oscar: µ.loadJson([OSCAR_PATH, "catalog.json"].join("/"))
    };

    function buildProduct(overrides) {
        return _.extend({
            description: "",
            paths: [],
            date: null,
            navigate: function(step) {
                return gfsStep(this.date, step);
            },
            load: function(cancel) {
                var me = this;
                return when.map(this.paths, µ.loadJson).then(function(files) {
                    return cancel.requested ? null : _.extend(me, buildGrid(me.builder.apply(me, files)));
                });
            }
        }, overrides);
    }

    /**
     * @param attr
     * @param {String} type
     * @param {String?} surface
     * @param {String?} level
     * @returns {String}
     */
    function gfs1p0degPath(attr, type, surface, level) {
        var dir = attr.date, stamp = dir === "current" ? "current" : attr.hour;
        var file = [stamp, type, surface, level, "gfs", "1.0"].filter(µ.isValue).join("-") + ".json";
        return [WEATHER_PATH, dir, file].join("/");
    }

    function gfsDate(attr) {
        if (attr.date === "current") {
            // Construct the date from the current time, rounding down to the nearest three-hour block.
            var now = new Date(Date.now()), hour = Math.floor(now.getUTCHours() / 3);
            return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), hour));
        }
        var parts = attr.date.split("/");
        return new Date(Date.UTC(+parts[0], parts[1] - 1, +parts[2], +attr.hour.substr(0, 2)));
    }

    /**
     * Returns a date for the chronologically next or previous GFS data layer. How far forward or backward in time
     * to jump is determined by the step. Steps of ±1 move in 3-hour jumps, and steps of ±10 move in 24-hour jumps.
     */
    function gfsStep(date, step) {
        var offset = (step > 1 ? 8 : step < -1 ? -8 : step) * 3, adjusted = new Date(date);
        adjusted.setHours(adjusted.getHours() + offset);
        return adjusted;
    }

    function netcdfHeader(time, lat, lon, center) {
        return {
            lo1: lon.sequence.start,
            la1: lat.sequence.start,
            dx: lon.sequence.delta,
            dy: -lat.sequence.delta,
            nx: lon.sequence.size,
            ny: lat.sequence.size,
            refTime: time.data[0],
            forecastTime: 0,
            centerName: center
        };
    }

    function describeSurface(attr) {
        return attr.surface === "surface" ? "Surface" : µ.capitalize(attr.level);
    }

    function describeSurfaceJa(attr) {
        return attr.surface === "surface" ? "地上" : µ.capitalize(attr.level);
    }

    /**
     * Returns a function f(langCode) that, given table:
     *     {foo: {en: "A", ja: "あ"}, bar: {en: "I", ja: "い"}}
     * will return the following when called with "en":
     *     {foo: "A", bar: "I"}
     * or when called with "ja":
     *     {foo: "あ", bar: "い"}
     */
    function localize(table) {
        return function(langCode) {
            var result = {};
            _.each(table, function(value, key) {
                result[key] = value[langCode] || value.en || value;
            });
            return result;
        }
    }

    var FACTORIES = {

        "wind": {
            matches: _.matches({param: "wind"}),
            create: function(attr) {
                return buildProduct({
                    field: "vector",
                    type: "wind",
                    description: localize({
                        name: {en: "Wind", ja: "風速"},
                        qualifier: {en: " @ " + describeSurface(attr), ja: " @ " + describeSurfaceJa(attr)}
                    }),
                    paths: [gfs1p0degPath(attr, "wind", attr.surface, attr.level)],
                    date: gfsDate(attr),
                    builder: function(file) {
                        var uData = file[0].data, vData = file[1].data;
                        return {
                            header: file[0].header,
                            interpolate: bilinearInterpolateVector,
                            data: function(i) {
                                return [uData[i], vData[i]];
                            }
                        }
                    },
                    units: [
                        {label: "km/h", conversion: function(x) { return x * 3.6; },      precision: 0},
                        {label: "m/s",  conversion: function(x) { return x; },            precision: 1},
                        {label: "kn",   conversion: function(x) { return x * 1.943844; }, precision: 0},
                        {label: "mph",  conversion: function(x) { return x * 2.236936; }, precision: 0}
                    ],
                    scale: {
                        bounds: [0, 100],
                        gradient: function(v, a) {
                            return µ.extendedSinebowColor(Math.min(v, 100) / 100, a);
                        }
                    },
                    particles: {velocityScale: 1/60000, maxIntensity: 17}
                });
            }
        },

        "temp": {
            matches: _.matches({param: "wind", overlayType: "temp"}),
            create: function(attr) {
                return buildProduct({
                    field: "scalar",
                    type: "temp",
                    description: localize({
                        name: {en: "Temp", ja: "気温"},
                        qualifier: {en: " @ " + describeSurface(attr), ja: " @ " + describeSurfaceJa(attr)}
                    }),
                    paths: [gfs1p0degPath(attr, "temp", attr.surface, attr.level)],
                    date: gfsDate(attr),
                    builder: function(file) {
                        var record = file[0], data = record.data;
                        return {
                            header: record.header,
                            interpolate: bilinearInterpolateScalar,
                            data: function(i) {
                                return data[i];
                            }
                        }
                    },
                    units: [
                        {label: "°C", conversion: function(x) { return x - 273.15; },       precision: 1},
                        {label: "°F", conversion: function(x) { return x * 9/5 - 459.67; }, precision: 1},
                        {label: "K",  conversion: function(x) { return x; },                precision: 1}
                    ],
                    scale: {
                        bounds: [193, 328],
                        gradient: µ.segmentedColorScale([
                            [193,     [37, 4, 42]],
                            [206,     [41, 10, 130]],
                            [219,     [81, 40, 40]],
                            [233.15,  [192, 37, 149]],  // -40 C/F
                            [255.372, [70, 215, 215]],  // 0 F
                            [273.15,  [21, 84, 187]],   // 0 C
                            [275.15,  [24, 132, 14]],   // just above 0 C
                            [291,     [247, 251, 59]],
                            [298,     [235, 167, 21]],
                            [311,     [230, 71, 39]],
                            [328,     [88, 27, 67]]
                        ])
                    }
                });
            }
        },

        "relative_humidity": {
            matches: _.matches({param: "wind", overlayType: "relative_humidity"}),
            create: function(attr) {
                return buildProduct({
                    field: "scalar",
                    type: "relative_humidity",
                    description: localize({
                        name: {en: "Relative Humidity", ja: "相対湿度"},
                        qualifier: {en: " @ " + describeSurface(attr), ja: " @ " + describeSurfaceJa(attr)}
                    }),
                    paths: [gfs1p0degPath(attr, "relative_humidity", attr.surface, attr.level)],
                    date: gfsDate(attr),
                    builder: function(file) {
                        var vars = file.variables;
                        var rh = vars.Relative_humidity_isobaric || vars.Relative_humidity_height_above_ground;
                        var data = rh.data;
                        return {
                            header: netcdfHeader(vars.time, vars.lat, vars.lon, file.Originating_or_generating_Center),
                            interpolate: bilinearInterpolateScalar,
                            data: function(i) {
                                return data[i];
                            }
                        };
                    },
                    units: [
                        {label: "%", conversion: function(x) { return x; }, precision: 0}
                    ],
                    scale: {
                        bounds: [0, 100],
                        gradient: function(v, a) {
                            return µ.sinebowColor(Math.min(v, 100) / 100, a);
                        }
                    }
                });
            }
        },

        "air_density": {
            matches: _.matches({param: "wind", overlayType: "air_density"}),
            create: function(attr) {
                return buildProduct({
                    field: "scalar",
                    type: "air_density",
                    description: localize({
                        name: {en: "Air Density", ja: "空気密度"},
                        qualifier: {en: " @ " + describeSurface(attr), ja: " @ " + describeSurfaceJa(attr)}
                    }),
                    paths: [gfs1p0degPath(attr, "air_density", attr.surface, attr.level)],
                    date: gfsDate(attr),
                    builder: function(file) {
                        var vars = file.variables;
                        var air_density = vars.air_density, data = air_density.data;
                        return {
                            header: netcdfHeader(vars.time, vars.lat, vars.lon, file.Originating_or_generating_Center),
                            interpolate: bilinearInterpolateScalar,
                            data: function(i) {
                                return data[i];
                            }
                        };
                    },
                    units: [
                        {label: "kg/m³", conversion: function(x) { return x; }, precision: 2}
                    ],
                    scale: {
                        bounds: [0, 1.5],
                        gradient: function(v, a) {
                            return µ.sinebowColor(Math.min(v, 1.5) / 1.5, a);
                        }
                    }
                });
            }
        },

        "wind_power_density": {
            matches: _.matches({param: "wind", overlayType: "wind_power_density"}),
            create: function(attr) {
                var windProduct = FACTORIES.wind.create(attr);
                var airdensProduct = FACTORIES.air_density.create(attr);
                return buildProduct({
                    field: "scalar",
                    type: "wind_power_density",
                    description: localize({
                        name: {en: "Wind Power Density", ja: "風力エネルギー密度"},
                        qualifier: {en: " @ " + describeSurface(attr), ja: " @ " + describeSurfaceJa(attr)}
                    }),
                    paths: [windProduct.paths[0], airdensProduct.paths[0]],
                    date: gfsDate(attr),
                    builder: function(windFile, airdensFile) {
                        var windBuilder = windProduct.builder(windFile);
                        var airdensBuilder = airdensProduct.builder(airdensFile);
                        var windData = windBuilder.data, windInterpolate = windBuilder.interpolate;
                        var airdensData = airdensBuilder.data, airdensInterpolate = airdensBuilder.interpolate;
                        return {
                            header: _.clone(airdensBuilder.header),
                            interpolate: function(x, y, g00, g10, g01, g11) {
                                var m = windInterpolate(x, y, g00[0], g10[0], g01[0], g11[0])[2];
                                var ρ = airdensInterpolate(x, y, g00[1], g10[1], g01[1], g11[1]);
                                return 0.5 * ρ * m * m * m;
                            },
                            data: function(i) {
                                return [windData(i), airdensData(i)];
                            }
                        };
                    },
                    units: [
                        {label: "kW/m²", conversion: function(x) { return x / 1000; }, precision: 1},
                        {label: "W/m²", conversion: function(x) { return x; }, precision: 0}
                    ],
                    scale: {
                        bounds: [0, 80000],
                        gradient: µ.segmentedColorScale([
                            [0, [15, 4, 96]],
                            [250, [30, 8, 180]],
                            [1000, [121, 102, 2]],
                            [2000, [118, 161, 66]],
                            [4000, [50, 102, 219]],
                            [8000, [19, 131, 193]],
                            [16000, [59, 204, 227]],
                            [64000, [241, 1, 45]],
                            [80000, [243, 0, 241]]
                        ])
                    }
                });
            }
        },

        "total_cloud_water": {
            matches: _.matches({param: "wind", overlayType: "total_cloud_water"}),
            create: function(attr) {
                return buildProduct({
                    field: "scalar",
                    type: "total_cloud_water",
                    description: localize({
                        name: {en: "Total Cloud Water", ja: "雲水量"},
                        qualifier: ""
                    }),
                    paths: [gfs1p0degPath(attr, "total_cloud_water")],
                    date: gfsDate(attr),
                    builder: function(file) {
                        var record = file[0], data = record.data;
                        return {
                            header: record.header,
                            interpolate: bilinearInterpolateScalar,
                            data: function(i) {
                                return data[i];
                            }
                        }
                    },
                    units: [
                        {label: "kg/m²", conversion: function(x) { return x; }, precision: 3}
                    ],
                    scale: {
                        bounds: [0, 1],
                        gradient: µ.segmentedColorScale([
                            [0.0, [5, 5, 89]],
                            [0.2, [170, 170, 230]],
                            [1.0, [255, 255, 255]]
                        ])
                    }
                });
            }
        },

        "total_precipitable_water": {
            matches: _.matches({param: "wind", overlayType: "total_precipitable_water"}),
            create: function(attr) {
                return buildProduct({
                    field: "scalar",
                    type: "total_precipitable_water",
                    description: localize({
                        name: {en: "Total Precipitable Water", ja: "可降水量"},
                        qualifier: ""
                    }),
                    paths: [gfs1p0degPath(attr, "total_precipitable_water")],
                    date: gfsDate(attr),
                    builder: function(file) {
                        var record = file[0], data = record.data;
                        return {
                            header: record.header,
                            interpolate: bilinearInterpolateScalar,
                            data: function(i) {
                                return data[i];
                            }
                        }
                    },
                    units: [
                        {label: "kg/m²", conversion: function(x) { return x; }, precision: 3}
                    ],
                    scale: {
                        bounds: [0, 70],
                        gradient:
                            µ.segmentedColorScale([
                                [0, [230, 165, 30]],
                                [10, [120, 100, 95]],
                                [20, [40, 44, 92]],
                                [30, [21, 13, 193]],
                                [40, [75, 63, 235]],
                                [60, [25, 255, 255]],
                                [70, [150, 255, 255]]
                            ])
                    }
                });
            }
        },

        "mean_sea_level_pressure": {
            matches: _.matches({param: "wind", overlayType: "mean_sea_level_pressure"}),
            create: function(attr) {
                return buildProduct({
                    field: "scalar",
                    type: "mean_sea_level_pressure",
                    description: localize({
                        name: {en: "Mean Sea Level Pressure", ja: "海面更正気圧"},
                        qualifier: ""
                    }),
                    paths: [gfs1p0degPath(attr, "mean_sea_level_pressure")],
                    date: gfsDate(attr),
                    builder: function(file) {
                        var record = file[0], data = record.data;
                        return {
                            header: record.header,
                            interpolate: bilinearInterpolateScalar,
                            data: function(i) {
                                return data[i];
                            }
                        }
                    },
                    units: [
                        {label: "hPa", conversion: function(x) { return x / 100; }, precision: 0},
                        {label: "mmHg", conversion: function(x) { return x / 133.322387415; }, precision: 0},
                        {label: "inHg", conversion: function(x) { return x / 3386.389; }, precision: 1}
                    ],
                    scale: {
                        bounds: [92000, 105000],
                        gradient: µ.segmentedColorScale([
                            [92000, [40, 0, 0]],
                            [95000, [187, 60, 31]],
                            [96500, [137, 32, 30]],
                            [98000, [16, 1, 43]],
                            [100500, [36, 1, 93]],
                            [101300, [241, 254, 18]],
                            [103000, [228, 246, 223]],
                            [105000, [255, 255, 255]]
                        ])
                    }
                });
            }
        },

        "currents": {
            matches: _.matches({param: "ocean", surface: "surface", level: "currents"}),
            create: function(attr) {
                return when(catalogs.oscar).then(function(catalog) {
                    return buildProduct({
                        field: "vector",
                        type: "currents",
                        description: localize({
                            name: {en: "Ocean Currents", ja: "海流"},
                            qualifier: {en: " @ Surface", ja: " @ 地上"}
                        }),
                        paths: [oscar0p33Path(catalog, attr)],
                        date: oscarDate(catalog, attr),
                        navigate: function(step) {
                            return oscarStep(catalog, this.date, step);
                        },
                        builder: function(file) {
                            var uData = file[0].data, vData = file[1].data;
                            return {
                                header: file[0].header,
                                interpolate: bilinearInterpolateVector,
                                data: function(i) {
                                    var u = uData[i], v = vData[i];
                                    return µ.isValue(u) && µ.isValue(v) ? [u, v] : null;
                                }
                            }
                        },
                        units: [
                            {label: "m/s",  conversion: function(x) { return x; },            precision: 2},
                            {label: "km/h", conversion: function(x) { return x * 3.6; },      precision: 1},
                            {label: "kn",   conversion: function(x) { return x * 1.943844; }, precision: 1},
                            {label: "mph",  conversion: function(x) { return x * 2.236936; }, precision: 1}
                        ],
                        scale: {
                            bounds: [0, 1.5],
                            gradient: µ.segmentedColorScale([
                                [0, [10, 25, 68]],
                                [0.15, [10, 25, 250]],
                                [0.4, [24, 255, 93]],
                                [0.65, [255, 233, 102]],
                                [1.0, [255, 233, 15]],
                                [1.5, [255, 15, 15]]
                            ])
                        },
                        particles: {velocityScale: 1/4400, maxIntensity: 0.7}
                    });
                });
            }
        },

        "off": {
            matches: _.matches({overlayType: "off"}),
            create: function() {
                return null;
            }
        }
    };

    /**
     * Returns the file name for the most recent OSCAR data layer to the specified date. If offset is non-zero,
     * the file name that many entries from the most recent is returned.
     *
     * The result is undefined if there is no entry for the specified date and offset can be found.
     *
     * UNDONE: the catalog object itself should encapsulate this logic. GFS can also be a "virtual" catalog, and
     *         provide a mechanism for eliminating the need for /data/weather/current/* files.
     *
     * @param {Array} catalog array of file names, sorted and prefixed with yyyyMMdd. Last item is most recent.
     * @param {String} date string with format yyyy/MM/dd or "current"
     * @param {Number?} offset
     * @returns {String} file name
     */
    function lookupOscar(catalog, date, offset) {
        offset = +offset || 0;
        if (date === "current") {
            return catalog[catalog.length - 1 + offset];
        }
        var prefix = µ.ymdRedelimit(date, "/", ""), i = _.sortedIndex(catalog, prefix);
        i = (catalog[i] || "").indexOf(prefix) === 0 ? i : i - 1;
        return catalog[i + offset];
    }

    function oscar0p33Path(catalog, attr) {
        var file = lookupOscar(catalog, attr.date);
        return file ? [OSCAR_PATH, file].join("/") : null;
    }

    function oscarDate(catalog, attr) {
        var file = lookupOscar(catalog, attr.date);
        var parts = file ? µ.ymdRedelimit(file, "", "/").split("/") : null;
        return parts ? new Date(Date.UTC(+parts[0], parts[1] - 1, +parts[2], 0)) : null;
    }

    /**
     * @returns {Date} the chronologically next or previous OSCAR data layer. How far forward or backward in
     * time to jump is determined by the step and the catalog of available layers. A step of ±1 moves to the
     * next/previous entry in the catalog (about 5 days), and a step of ±10 moves to the entry six positions away
     * (about 30 days).
     */
    function oscarStep(catalog, date, step) {
        var file = lookupOscar(catalog, µ.dateToUTCymd(date, "/"), step > 1 ? 6 : step < -1 ? -6 : step);
        var parts = file ? µ.ymdRedelimit(file, "", "/").split("/") : null;
        return parts ? new Date(Date.UTC(+parts[0], parts[1] - 1, +parts[2], 0)) : null;
    }

    function dataSource(header) {
        // noinspection FallthroughInSwitchStatementJS
        switch (header.center || header.centerName) {
            case -3:
                return "OSCAR / Earth & Space Research";
            case 7:
            case "US National Weather Service, National Centres for Environmental Prediction (NCEP)":
                return "GFS / NCEP / US National Weather Service";
            default:
                return header.centerName;
        }
    }

    function bilinearInterpolateScalar(x, y, g00, g10, g01, g11) {
        var rx = (1 - x);
        var ry = (1 - y);
        return g00 * rx * ry + g10 * x * ry + g01 * rx * y + g11 * x * y;
    }

    function bilinearInterpolateVector(x, y, g00, g10, g01, g11) {
        var rx = (1 - x);
        var ry = (1 - y);
        var a = rx * ry,  b = x * ry,  c = rx * y,  d = x * y;
        var u = g00[0] * a + g10[0] * b + g01[0] * c + g11[0] * d;
        var v = g00[1] * a + g10[1] * b + g01[1] * c + g11[1] * d;
        return [u, v, Math.sqrt(u * u + v * v)];
    }

    /**
     * Builds an interpolator for the specified data in the form of JSON-ified GRIB files. Example:
     *
     *     [
     *       {
     *         "header": {
     *           "refTime": "2013-11-30T18:00:00.000Z",
     *           "parameterCategory": 2,
     *           "parameterNumber": 2,
     *           "surface1Type": 100,
     *           "surface1Value": 100000.0,
     *           "forecastTime": 6,
     *           "scanMode": 0,
     *           "nx": 360,
     *           "ny": 181,
     *           "lo1": 0,
     *           "la1": 90,
     *           "lo2": 359,
     *           "la2": -90,
     *           "dx": 1,
     *           "dy": 1
     *         },
     *         "data": [3.42, 3.31, 3.19, 3.08, 2.96, 2.84, 2.72, 2.6, 2.47, ...]
     *       }
     *     ]
     *
     */
    function buildGrid(builder) {
        // var builder = createBuilder(data);

        var header = builder.header;
        var λ0 = header.lo1, φ0 = header.la1;  // the grid's origin (e.g., 0.0E, 90.0N)
        var Δλ = header.dx, Δφ = header.dy;    // distance between grid points (e.g., 2.5 deg lon, 2.5 deg lat)
        var ni = header.nx, nj = header.ny;    // number of grid points W-E and N-S (e.g., 144 x 73)
        var date = new Date(header.refTime);
        date.setHours(date.getHours() + header.forecastTime);

        // Scan mode 0 assumed. Longitude increases from λ0, and latitude decreases from φ0.
        // http://www.nco.ncep.noaa.gov/pmb/docs/grib2/grib2_table3-4.shtml
        var grid = [], p = 0;
        var isContinuous = Math.floor(ni * Δλ) >= 360;
        for (var j = 0; j < nj; j++) {
            var row = [];
            for (var i = 0; i < ni; i++, p++) {
                row[i] = builder.data(p);
            }
            if (isContinuous) {
                // For wrapped grids, duplicate first column as last column to simplify interpolation logic
                row.push(row[0]);
            }
            grid[j] = row;
        }

        function interpolate(λ, φ) {
            var i = µ.floorMod(λ - λ0, 360) / Δλ;  // calculate longitude index in wrapped range [0, 360)
            var j = (φ0 - φ) / Δφ;                 // calculate latitude index in direction +90 to -90

            //         1      2           After converting λ and φ to fractional grid indexes i and j, we find the
            //        fi  i   ci          four points "G" that enclose point (i, j). These points are at the four
            //         | =1.4 |           corners specified by the floor and ceiling of i and j. For example, given
            //      ---G--|---G--- fj 8   i = 1.4 and j = 8.3, the four surrounding grid points are (1, 8), (2, 8),
            //    j ___|_ .   |           (1, 9) and (2, 9).
            //  =8.3   |      |
            //      ---G------G--- cj 9   Note that for wrapped grids, the first column is duplicated as the last
            //         |      |           column, so the index ci can be used without taking a modulo.

            var fi = Math.floor(i), ci = fi + 1;
            var fj = Math.floor(j), cj = fj + 1;

            var row;
            if ((row = grid[fj])) {
                var g00 = row[fi];
                var g10 = row[ci];
                if (µ.isValue(g00) && µ.isValue(g10) && (row = grid[cj])) {
                    var g01 = row[fi];
                    var g11 = row[ci];
                    if (µ.isValue(g01) && µ.isValue(g11)) {
                        // All four points found, so interpolate the value.
                        return builder.interpolate(i - fi, j - fj, g00, g10, g01, g11);
                    }
                }
            }
            // console.log("cannot interpolate: " + λ + "," + φ + ": " + fi + " " + ci + " " + fj + " " + cj);
            return null;
        }

        return {
            source: dataSource(header),
            date: date,
            interpolate: interpolate,
            forEachPoint: function(cb) {
                for (var j = 0; j < nj; j++) {
                    var row = grid[j] || [];
                    for (var i = 0; i < ni; i++) {
                        cb(µ.floorMod(180 + λ0 + i * Δλ, 360) - 180, φ0 - j * Δφ, row[i]);
                    }
                }
            }
        };
    }

    function productsFor(attributes) {
        var attr = _.clone(attributes), results = [];
        _.values(FACTORIES).forEach(function(factory) {
            if (factory.matches(attr)) {
                results.push(factory.create(attr));
            }
        });
        return results.filter(µ.isValue);
    }

    return {
        overlayTypes: d3.set(_.keys(FACTORIES)),
        productsFor: productsFor
    };

}();
