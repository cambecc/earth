///**
// * grids - defines the behavior of weather data grids, including grid construction, interpolation, and color scales.
// *
// * Copyright (c) 2014 Cameron Beccario
// * The MIT License - http://opensource.org/licenses/MIT
// *
// * https://github.com/cambecc/earth
// */
//var grids = function() {
//    "use strict";
//
////    var WEATHER_PATH = "/data/weather";
////    var OSCAR_PATH = "/data/oscar";
////
////    function windRecipe(key, description) {
////        return {
////            type: "wind",
////            key: key
////        };
////    }
////
////    function oceanCurrentsRecipe() {
////        return {
////            type: "currents",
////            key: "ocean,160,15"
////        };
////    }
////
////    function tempRecipe(key, description) {
////        return {
////            type: "temp",
////            key: key
////        };
////    }
////
////    function totalCloudWaterRecipe() {
////        return {
////            type: "total_cloud_water",
////            key: "6,6,200,0"
////        };
////    }
////
////    function totalPrecipitableWaterRecipe() {
////        return {
////            type: "total_precipitable_water",
////            key: "1,3,200,0"
////        };
////    }
////
////    function meanSeaLevelPressureRecipe() {
////        return {
////            type: "mean_sea_level_pressure",
////            key: "3,1,101,0",
////            description: "Mean Sea Level Pressure"
////        };
////    }
//
////    function random() {
////        return [
////            Math.round(_.random(0, 255)),
////            Math.round(_.random(0, 255)),
////            Math.round(_.random(0, 255))
////        ];
////    }
////
////    function windPowerDensityRecipe(key, description) {
////        return {
////            type: "wind_power_density",
////            key: key
//////            description: description,
//////            units: [
//////                {label: "kW/m2", conversion: function(x) { return x / 1000; }, precision: 1},
//////                {label: "W/m2",  conversion: function(x) { return x; },        precision: 0}
//////            ],
//////            scale: {
//////                bounds: [0, 75000],
//////                gradient: function(v, a) {
//////                    return µ.extendedSinebowColor(Math.min(v, 75000) / 75000, a);
//////                }
//////            }
////        };
////    }
//
////    var PRESSURE_LEVELS = [10, 70, 250, 500, 700, 850, 1000];
////
////    var LAYER_RECIPES = function() {
////        var recipes = [];
////        recipes.push(windRecipe("wind,103,10", "Wind @ Surface"));
////        recipes.push(tempRecipe("0,0,103,2", "Temp @ Surface"));
////        PRESSURE_LEVELS.forEach(function(pressure) {
////            recipes.push(windRecipe("wind,100," + pressure * 100, "Wind @ " + pressure + " hPa"));
////            recipes.push(tempRecipe("0,0,100," + pressure * 100, "Temp @ " + pressure + " hPa"));
////            recipes.push(windPowerDensityRecipe("2,254,100," + pressure * 100, "Wind Power Density @ " + pressure + " hPa"));
////        });
////        recipes.push(totalCloudWaterRecipe());
////        recipes.push(totalPrecipitableWaterRecipe());
////        recipes.push(meanSeaLevelPressureRecipe());
////        recipes.push(oceanCurrentsRecipe());
////        return recipes;
////    }();
////
////    var OVERLAY_TYPES = d3.set(_.union(_.pluck(LAYER_RECIPES, "type"), "off"));
////
////    function recipeFor(key) {
////        return _.findWhere(_.values(LAYER_RECIPES), {key: key});
////    }
////
////    function bilinearInterpolateScalar(x, y, g00, g10, g01, g11) {
////        var rx = (1 - x);
////        var ry = (1 - y);
////        return g00 * rx * ry + g10 * x * ry + g01 * rx * y + g11 * x * y;
////    }
////
////    function bilinearInterpolateVector(x, y, g00, g10, g01, g11) {
////        var rx = (1 - x);
////        var ry = (1 - y);
////        var a = rx * ry,  b = x * ry,  c = rx * y,  d = x * y;
////        var u = g00[0] * a + g10[0] * b + g01[0] * c + g11[0] * d;
////        var v = g00[1] * a + g10[1] * b + g01[1] * c + g11[1] * d;
////        return [u, v, Math.sqrt(u * u + v * v)];
////    }
////
////    function createScalarBuilder(record) {
////        var data = record.data, header = record.header;
////        return {
////            header: header,
////            recipe: recipeFor([
////                header.parameterCategory,
////                header.parameterNumber,
////                header.surface1Type,
////                header.surface1Value].join(",")),
////            data: function(i) {
////                return data[i];
////            },
////            interpolate: bilinearInterpolateScalar
////        };
////    }
////
////    function createWindBuilder(uComp, vComp) {
////        var uData = uComp.data, vData = vComp.data;
////        return {
////            header: uComp.header,
////            recipe: recipeFor("wind," + uComp.header.surface1Type + "," + uComp.header.surface1Value),
////            data: function(i) {
////                return [uData[i], vData[i]];
////            },
////            interpolate: bilinearInterpolateVector
////        };
////    }
////
////    function createWindBuilder2(data) {
////        var uComp = data.variables["u-component_of_wind_isobaric"], vComp = data.variables["v-component_of_wind_isobaric"];
////        var time = data.variables.time, lon = data.variables.lon, lat = data.variables.lat, isobaric = data.variables.isobaric;
////        var uData = uComp.data, vData = vComp.data;
////        var header = {
////            lo1: lon.sequence.start,
////            la1: lat.sequence.start,
////            dx: lon.sequence.delta,
////            dy: -lat.sequence.delta,
////            nx: lon.sequence.size,
////            ny: lat.sequence.size,
////            refTime: time.data[0],
////            forecastTime: 0,
////            centerName: data.Originating_or_generating_Center
////        };
////        console.log(header);
////        return {
////            header: header,
////            recipe: recipeFor("wind," + isobaric.Grib2_level_type + "," + isobaric.data[0]),
////            data: function(i) {
////                return [uData[i], vData[i]];
////            },
////            interpolate: bilinearInterpolateVector
////        };
////    }
////
////    function createOceanBuilder(uComp, vComp) {
////        var uData = uComp.data, vData = vComp.data;
////        return {
////            header: uComp.header,
////            recipe: recipeFor("ocean," + uComp.header.surface1Type + "," + uComp.header.surface1Value),
////            data: function(i) {
////                var u = uData[i], v = vData[i];
////                return µ.isValue(u) && µ.isValue(v) ? [u, v] : null;
////            },
////            interpolate: bilinearInterpolateVector
////        };
////    }
////
////    function createBuilder2(data) {
////        if (data.variables["u-component_of_wind_isobaric"] && data.variables["v-component_of_wind_isobaric"]) {
////            return createWindBuilder2(data);
////        }
////        throw new Error("NYI");
////    }
////
////    function createBuilder(data) {
////        if (data.variables) {
////            return createBuilder2(data);
////        }
////
////        var uComp = null, vComp = null, scalar = null, discipline = null;
////
////        data.forEach(function(record) {
////            discipline = record.header.discipline;
////            switch ([discipline, record.header.parameterCategory, record.header.parameterNumber].join(",")) {
////                case "10,1,2":
////                case "0,2,2":
////                    uComp = record; break;
////                case "10,1,3":
////                case "0,2,3":
////                    vComp = record; break;
////                default:
////                    scalar = record;
////            }
////        });
////
////        return uComp ?
////            discipline === 10 ? createOceanBuilder(uComp, vComp) : createWindBuilder(uComp, vComp) :
////            createScalarBuilder(scalar);
////    }
//
////    function dataSource(header) {
////        switch (header.center) {
////            case -3:
////                return "OSCAR / Earth & Space Research";
////            case 7:
////                return "GFS / NCEP / US National Weather Service";
////            default:
////                return header.centerName;
////        }
////    }
//
////    /**
////     * Builds an interpolator for the specified data in the form of JSON-ified GRIB files. Example:
////     *
////     *     [
////     *       {
////     *         "header": {
////     *           "refTime": "2013-11-30T18:00:00.000Z",
////     *           "parameterCategory": 2,
////     *           "parameterNumber": 2,
////     *           "surface1Type": 100,
////     *           "surface1Value": 100000.0,
////     *           "forecastTime": 6,
////     *           "scanMode": 0,
////     *           "nx": 360,
////     *           "ny": 181,
////     *           "lo1": 0,
////     *           "la1": 90,
////     *           "lo2": 359,
////     *           "la2": -90,
////     *           "dx": 1,
////     *           "dy": 1
////     *         },
////     *         "data": [3.42, 3.31, 3.19, 3.08, 2.96, 2.84, 2.72, 2.6, 2.47, ...]
////     *       }
////     *     ]
////     *
////     */
////    function buildGrid(data) {
////        var builder = createBuilder(data);
////
////        var header = builder.header;
////        var λ0 = header.lo1, φ0 = header.la1;  // the grid's origin (e.g., 0.0E, 90.0N)
////        var Δλ = header.dx, Δφ = header.dy;    // distance between grid points (e.g., 2.5 deg lon, 2.5 deg lat)
////        var ni = header.nx, nj = header.ny;    // number of grid points W-E and N-S (e.g., 144 x 73)
////        var date = new Date(header.refTime);
////        date.setHours(date.getHours() + header.forecastTime);
////
////        // Scan mode 0 assumed. Longitude increases from λ0, and latitude decreases from φ0.
////        // http://www.nco.ncep.noaa.gov/pmb/docs/grib2/grib2_table3-4.shtml
////        var grid = [], p = 0;
////        var isContinuous = Math.floor(ni * Δλ) >= 360;
////        for (var j = 0; j < nj; j++) {
////            var row = [];
////            for (var i = 0; i < ni; i++, p++) {
////                row[i] = builder.data(p);
////            }
////            if (isContinuous) {
////                // For wrapped grids, duplicate first column as last column to simplify interpolation logic
////                row.push(row[0]);
////            }
////            grid[j] = row;
////        }
////
////        function interpolate(λ, φ) {
////            var i = µ.floorMod(λ - λ0, 360) / Δλ;  // calculate longitude index in wrapped range [0, 360)
////            var j = (φ0 - φ) / Δφ;                 // calculate latitude index in direction +90 to -90
////
////            //         1      2           After converting λ and φ to fractional grid indexes i and j, we find the
////            //        fi  i   ci          four points "G" that enclose point (i, j). These points are at the four
////            //         | =1.4 |           corners specified by the floor and ceiling of i and j. For example, given
////            //      ---G--|---G--- fj 8   i = 1.4 and j = 8.3, the four surrounding grid points are (1, 8), (2, 8),
////            //    j ___|_ .   |           (1, 9) and (2, 9).
////            //  =8.3   |      |
////            //      ---G------G--- cj 9   Note that for wrapped grids, the first column is duplicated as the last
////            //         |      |           column, so the index ci can be used without taking a modulo.
////
////            var fi = Math.floor(i), ci = fi + 1;
////            var fj = Math.floor(j), cj = fj + 1;
////
////            var row;
////            if ((row = grid[fj])) {
////                var g00 = row[fi];
////                var g10 = row[ci];
////                if (µ.isValue(g00) && µ.isValue(g10) && (row = grid[cj])) {
////                    var g01 = row[fi];
////                    var g11 = row[ci];
////                    if (µ.isValue(g01) && µ.isValue(g11)) {
////                        // All four points found, so interpolate the value.
////                        return builder.interpolate(i - fi, j - fj, g00, g10, g01, g11);
////                    }
////                }
////            }
////            // console.log("cannot interpolate: " + λ + "," + φ + ": " + fi + " " + ci + " " + fj + " " + cj);
////            return null;
////        }
////
////        return {
////            source: dataSource(header),
////            date: date,
////            recipe: builder.recipe,
////            interpolate: interpolate,
////            forEachPoint: function(cb) {
////                for (var j = 0; j < nj; j++) {
////                    var row = grid[j] || [];
////                    for (var i = 0; i < ni; i++) {
////                        cb(µ.floorMod(180 + λ0 + i * Δλ, 360) - 180, φ0 - j * Δφ, row[i]);
////                    }
////                }
////            }
////        };
////    }
////
////    function windPaths(attr) {
////        return {
////            /**
////             * @returns {String} the path to the weather data JSON file implied by the specified configuration.
////             */
////            primary: function() {
////                var dir = attr.date, stamp = dir === "current" ? "current" : attr.hour;
////                var file = [stamp, attr.param, attr.surface, attr.level, "gfs", "1.0"].join("-") + ".json";
////                return [WEATHER_PATH, dir, file].join("/");
////            },
////            overlay: function() {
////                var dir = attr.date, stamp = dir === "current" ? "current" : attr.hour;
////                var file, overlayType = attr.overlayType;
////                switch (overlayType) {
////                    case "off":
////                        return null;
////                    case "default":
////                        overlayType = "wind";
////                        // fall-through
////                    case "wind":
////                    case "temp":
////                    case "wind_power_density":
////                        file = [stamp, overlayType, attr.surface, attr.level, "gfs", "1.0"].join("-") + ".json";
////                        break;
////                    default:
////                        file = [stamp, overlayType, "gfs", "1.0"].join("-") + ".json";
////                }
////                return [WEATHER_PATH, dir, file].join("/");
////            }
////        };
////    }
////
////    function oceanPaths(attr) {
////        return {
////            primary: function(catalogs) {
////                if (attr.date === "current") {
////                    return [OSCAR_PATH, _.last(catalogs.oscar)].join("/");  // last entry is the most recent
////                }
////                var stamp = µ.ymdRedelimit(attr.date, "/", "");
////                var file = [stamp, attr.surface, attr.level, "oscar", "0.33"].join("-") + ".json";
////                return [OSCAR_PATH, file].join("/");
////            },
////            overlay: function(catalogs) {
////                return attr.overlayType === "off" ? null : this.primary(catalogs);
////            }
////        };
////    }
////
////    /**
////     * @returns an object that constructs paths to weather data files using the specified configuration.
////     *          For example, the path for the primary data file corresponding to "current/wind/surface/level" is
////     *          "/data/weather/current/current-wind-surface-level-gfs-1.0.json".
////     *
////     *          The returned object has the form: {primary: function(catalogs), overlay: function(catalogs)}
////     */
////    function paths(configuration) {
////        var attr = configuration.attributes;
////        switch (attr.param) {
////            case "ocean":
////                return oceanPaths(attr);
////            default:
////                return windPaths(attr);
////        }
////    }
//
//    return {
//        pressureLevels: PRESSURE_LEVELS,
//        overlayTypes: OVERLAY_TYPES
//        // buildGrid: buildGrid
//        // paths: paths,
//        // OSCAR_CATALOG: [OSCAR_PATH, "catalog.json"].join("/")
//    };
//
//}();
