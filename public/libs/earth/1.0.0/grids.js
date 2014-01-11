/**
 * grids - defines the behavior of weather data grids, including grid construction, interpolation, and color scales.
 *
 * Copyright (c) 2014 Cameron Beccario
 * The MIT License - http://opensource.org/licenses/MIT
 *
 * https://github.com/cambecc/earth
 */
var grids = function() {
    "use strict";

    function windRecipe(key, description) {
        return {
            type: "wind",
            key: key,
            description: description,
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
            }
        };
    }

    function tempRecipe(key, description) {
        return {
            type: "temp",
            key: key,
            description: description,
            units: [
                {label: "ºC", conversion: function(x) { return x - 273.15; },       precision: 1},
                {label: "ºF", conversion: function(x) { return x * 9/5 - 459.67; }, precision: 1},
                {label: "K",  conversion: function(x) { return x; },                precision: 1}
            ],
            scale: {
                bounds: [193, 328],
                gradient: µ.segmentedColorScale([
                    // 193
                    // 206
                    // 219
                    [233.15,  [180, 40, 130]],  // -40 C/F
                    [255.372, [30, 30, 215]],   // 0 F
                    [271.15,  [70, 255, 255]],  // just below 0 C
                    [273.15,  [255, 255, 255]], // 0 C
                    [275.15,  [0, 255, 0]],     // just above 0 C
                    [294,     [255, 168, 0]],   // room temp
                    [311,     [255, 0, 0]]      // 100 F
                    // 328
                ])
            }
        };
    }

    function totalCloudWaterRecipe() {
        return {
            type: "total_cloud_water",
            key: "6,6,200,0",
            description: "Total Cloud Water",
            units: [
                {label: "kg/m²", conversion: function(x) { return x; }, precision: 3}
            ],
            scale: {
                bounds: [0, 1],
                gradient: function(v, a) {
                    return µ.grayScale(µ.proportion(v, 0, 1), a);
                }
            }
        };
    }

    function totalPrecipitableWaterRecipe() {
        return {
            type: "total_precipitable_water",
            key: "1,3,200,0",
            description: "Total Precipitable Water",
            units: [
                {label: "kg/m²", conversion: function(x) { return x; }, precision: 3}
            ],
            scale: {
                bounds: [0, 70],
                gradient: function(v, a) {
                    return µ.extendedSinebowColor(µ.proportion(v, 0, 70), a);
                }
            }
        };
    }

    function meanSeaLevelPressureRecipe() {
        return {
            type: "mean_sea_level_pressure",
            key: "3,1,101,0",
            description: "Mean Sea Level Pressure",
            units: [
                {label: "hPa", conversion: function(x) { return x / 100; }, precision: 0}
            ],
            scale: {
                bounds: [92000, 105000],
                gradient: µ.segmentedColorScale([
                    [92000, [40, 0, 0]],
                    [95000, [120, 60, 201]],
                    [98000, [90, 32, 237]],
                    [100000, [36, 1, 93]],
                    [101300, [241, 254, 18]],
                    [103000, [228, 246, 223]],
                    [105000, [255, 255, 255]]
                ])
            }
        };
    }

    var PRESSURE_LEVELS = [10, 70, 250, 500, 700, 850, 1000];

    var LAYER_RECIPES = function() {
        var recipes = [];
        recipes.push(windRecipe("wind,103,10", "Wind @ Surface"));
        recipes.push(tempRecipe("0,0,1,0", "Temp @ Surface"));
        PRESSURE_LEVELS.forEach(function(pressure) {
            recipes.push(windRecipe("wind,100," + pressure * 100, "Wind @ " + pressure + " hPa"));
            recipes.push(tempRecipe("0,0,100," + pressure * 100, "Temp @ " + pressure + " hPa"));
        });
        recipes.push(totalCloudWaterRecipe());
        recipes.push(totalPrecipitableWaterRecipe());
        recipes.push(meanSeaLevelPressureRecipe());
        return recipes;
    }();

    var OVERLAY_TYPES = d3.set(_.union(_.pluck(LAYER_RECIPES, "type"), "off"));

    function recipeFor(key) {
        return _.findWhere(_.values(LAYER_RECIPES), {key: key});
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

    function createScalarBuilder(record) {
        var data = record.data, header = record.header;
        return {
            header: header,
            recipe: recipeFor([
                header.parameterCategory,
                header.parameterNumber,
                header.surface1Type,
                header.surface1Value].join(",")),
            data: function(i) {
                return data[i];
            },
            interpolate: bilinearInterpolateScalar
        };
    }

    function createWindBuilder(uComp, vComp) {
        var uData = uComp.data, vData = vComp.data;
        return {
            header: uComp.header,
            recipe: recipeFor("wind," + uComp.header.surface1Type + "," + uComp.header.surface1Value),
            data: function(i) {
                return [uData[i], vData[i]];
            },
            interpolate: bilinearInterpolateVector
        };
    }

    function createBuilder(data) {
        var uComp = null, vComp = null, scalar = null;

        data.forEach(function(record) {
            switch (record.header.parameterCategory + "," + record.header.parameterNumber) {
                case "2,2": uComp = record; break;
                case "2,3": vComp = record; break;
                default:
                    scalar = record;
            }
        });

        return uComp ? createWindBuilder(uComp, vComp) : createScalarBuilder(scalar);
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
    function buildGrid(data) {
        var builder = createBuilder(data);

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
            date: date,
            recipe: builder.recipe,
            interpolate: interpolate
        };
    }

    /**
     * @returns {String} the path to the weather data JSON file implied by the specified configuration.
     */
    function toPath(configuration) {
        var attr = configuration.attributes;
        var dir = attr.date;
        var stamp = dir === "current" ? "current" : attr.hour;
        var file = [stamp, attr.param, attr.surface, attr.level, "gfs", "1.0"].join("-") + ".json";
        return ["/data/weather", dir, file].join("/");
    }

    function toOverlayPath(configuration) {
        var attr = configuration.attributes;
        var dir = attr.date;
        var stamp = dir === "current" ? "current" : attr.hour;
        var file;
        switch (attr.overlayType) {
            case "off":
                return null;
            case "wind":
            case "temp":
                file = [stamp, attr.overlayType, attr.surface, attr.level, "gfs", "1.0"].join("-") + ".json";
                break;
            default:
                file = [stamp, attr.overlayType, "gfs", "1.0"].join("-") + ".json";
        }
        return ["/data/weather", dir, file].join("/");
    }

    return {
        pressureLevels: PRESSURE_LEVELS,
        overlayTypes: OVERLAY_TYPES,
        buildGrid: buildGrid,
        toPath: toPath,
        toOverlayPath: toOverlayPath
    };

}();
