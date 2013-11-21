
var layers = function() {
    "use strict";

    var LAYER_RECIPES = {
        wi1: {
            name: "wind-isobaric-1hPa",
            filter: "--fc 2 --fp wind --fs 100 --fv 100",
            description: "Wind Velocity @ 1 hPa",
            stack: ["wi1000", "wi100", "wi10", "wi1"],
            cross: ["wi1"]
        },
        wi10: {
            name: "wind-isobaric-10hPa",
            filter: "--fc 2 --fp wind --fs 100 --fv 1000",
            description: "Wind Velocity @ 10 hPa",
            stack: ["wi1000", "wi100", "wi10", "wi1"],
            cross: ["wi10"]
        },
        wi100: {
            name: "wind-isobaric-100hPa",
            filter: "--fc 2 --fp wind --fs 100 --fv 10000",
            description: "Wind Velocity @ 100 hPa",
            stack: ["wi1000", "wi100", "wi10", "wi1"],
            cross: ["wi100"]
        },
        wi1000: {
            name: "wind-isobaric-1000hPa",
            filter: "--fc 2 --fp wind --fs 100 --fv 100000",
            description: "Wind Velocity @ 1000 hPa",
            stack: ["wi1000", "wi100", "wi10", "wi1"],
            cross: ["wi1000", "ti1000"]
        },
        ti1000: {
            name: "temp-isobaric-1000hPa",
            filter: "--fc 0 --fp 0 --fs 100 --fv 100000",
            description: "Temperature @ 1000 hPa",
            stack: [],
            cross: ["wi1000", "ti1000"]
        }
    };

    function bilinear(x, y, g00, g10, g01, g11) {
        // g(0, 0)(1 - x)(1 - y) + g(1, 0)x(1-y) + g(0, 1)(1 - x)y + g(1, 1)xy

        var s = (1 - x) * (1 - y);
        var t = x * (1 - y);
        var u = (1 - x) * y;
        var v = x * y;
        return [
            g00[0] * s + g10[0] * t + g01[0] * u + g11[0] * v,
            g00[1] * s + g10[1] * t + g01[1] * u + g11[1] * v
        ];
    }

    function buildGrid(data) {

        var uRecord = null, vRecord = null;
        data.forEach(function(record) {
            switch (record.header.parameterNumber) {
                case 2: uRecord = record; break; // U-component_of_wind
                case 3: vRecord = record; break; // V-component_of_wind
            }
        });
        if (!uRecord || !vRecord) {
            return when.reject("Failed to find both u,v component records");
        }

        // displayLayerMetadata(uRecord.meta, hashController.recipe);

        var header = uRecord.header;
        var λ0 = header.lo1, φ0 = header.la1;  // the grid's origin (e.g., 0.0E, 90.0N)
        var Δλ = header.dx, Δφ = header.dy;    // distance between grid points (e.g., 2.5 deg lon, 2.5 deg lat)
        var ni = header.nx, nj = header.ny;    // number of grid points W-E and N-S (e.g., 144 x 73)
        var uData = uRecord.data, vData = vRecord.data;
        if (uData.length != vData.length) {
            return when.reject("Mismatched data point lengths");
        }

        // Scan mode 0 assumed. Longitude increases from λ0, and latitude decreases from φ0.
        // http://www.nco.ncep.noaa.gov/pmb/docs/grib2/grib2_table3-4.shtml
        var grid = [], p = 0;
        var isContinuous = Math.floor(ni * Δλ) >= 360;
        for (var j = 0; j < nj; j++) {
            var row = [];
            for (var i = 0; i < ni; i++, p++) {
                row[i] = [uData[p], vData[p]];
            }
            if (isContinuous) {
                // For wrapped grids, duplicate first column as last column to simplify interpolation logic
                row.push(row[0]);
            }
            grid[j] = row;
        }

        function interpolate(λ, φ) {
            var i = µ.floorDiv(λ - λ0, 360) / Δλ;  // calculate longitude index in wrapped range [0, 360)
            var j = (φ0 - φ) / Δφ;              // calculate latitude index in direction +90 to -90

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
                if (g00 && g10 && (row = grid[cj])) {
                    var g01 = row[fi];
                    var g11 = row[ci];
                    if (g01 && g11) {
                        // All four points found, so use bilinear interpolation to calculate the wind vector.
                        return bilinear(i - fi, j - fj, g00, g10, g01, g11);
                    }
                }
            }
            // log.debug("cannot interpolate: " + λ + "," + φ + ": " + fi + " " + ci + " " + fj + " " + cj);
            return null;
        }

        return when.resolve({
            meta: uRecord.meta,
            interpolate: interpolate
        });
    }

    return {
        buildGrid: buildGrid
    };

}();
