(function() {
    "use strict";

    var τ = 2 * Math.PI;
    var NIL = -2;  // non-existent vector
    var MAX_TASK_TIME = 100;  // amount of time before a task yields control (milliseconds)
    var MIN_SLEEP_TIME = 25;  // amount of time a task waits before resuming (milliseconds)

    var DISPLAY_ID = "#display";
    var MAP_SVG_ID = "#map";
    var FOREGROUND_SVG_ID = "#foreground";
    var FIELD_CANVAS_ID = "#field";
    var OVERLAY_CANVAS_ID = "#overlay";
    var STATUS_ID = "#status";
    var LOCATION_ID = "#location";
    var POINT_DETAILS_ID = "#point-details";
    var POSITION_ID = "#position";
    var SHOW_LOCATION_ID = "#show-location";
    var DATA_DATE = "#data-date";
    var DATA_LAYER = "#data-layer";
    var DATA_CENTER = "#data-center";
    var PREVIOUS_DAY_ID = "#previous-day";
    var PREVIOUS_FORECAST_ID = "#previous-forecast";
    var NEXT_FORECAST_ID = "#next-forecast";
    var NEXT_DAY_ID = "#next-day";
    var CURRENT_CONDITIONS_ID = "#current-conditions";

    var DEFAULT_HASH_ARGS = "current/wind/isobaric/1000hPa";

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
    var ALL_RECIPES = d3.values(LAYER_RECIPES);

    var log = util.log;
    var apply = util.apply;
    var view = util.view;
    var args = doParseHashArguments();

    function isNullOrUndefined(x) {
        return x === null || x === undefined;
    }

    function coalesce(a, b) {
        return isNullOrUndefined(a) ? b : a;
    }

    function floorDiv(a, n) {
        // floored division: http://en.wikipedia.org/wiki/Modulo_operation
        return a - n * Math.floor(a / n);
    }

    function parseHashArguments(s) {
        //               1        2      3    4    5         6        7       8         9
        //                       int    int  int  int     AZaz09_  AZaz09_  AZaz09_   any char
        //         ( "current" | yyyy / mm / dd / hhhhZ ) / param / surface / level [ / rest ]

        var match = /^(current|(\d{4})\/(\d{2})\/(\d{2})\/(\d{4})Z)\/(\w+)\/(\w+)\/(\w+)([\/].+)?/.exec(s);
        return !match ? null : {
            date: match[1],    // "current" or "yyyy/mm/dd/hhhhZ"  // CONSIDER: can remove hhhhZ from this capture. how?
            year: match[2],    // "yyyy"  // CONSIDER: can probably eliminate year, month, and day fields. used?
            month: match[3],   // "mm"
            day: match[4],     // "dd"
            hour: match[5],    // "hhhh"
            param: match[6],   // alphanumeric_
            surface: match[7], // alphanumeric_
            level: match[8]    // alphanumeric_
            // rest: match[9]  // ignored for now
        };
    }

    function toPath(t) {
        var dir = t.date.substr(0, 10);
        var stamp = dir === "current" ? "current" : t.hour;
        return "/data/weather/" + dir + "/" + [stamp, t.param, t.surface, t.level, "gfs", "1.0"].join("-") + ".json";
    }

    function recipeFor(t) {
        var name = [t.param, t.surface, t.level].join("-");
        for (var i = 0; i < ALL_RECIPES.length; i++) {
            if (ALL_RECIPES[i].name === name) {
                return ALL_RECIPES[i];
            }
        }
        return null;
    }

    function interpret(tokens) {
        // UNDONE wrap in a task to do proper error handling.
        if (!tokens) {
            throw new Error("cannot parse hash arguments");
        }
        // UNDONE: detect empty samples path here?
        return {
            topography: "/data/earth-topo.json",
            recipe: recipeFor(tokens),
            samples: toPath(tokens)
        };
    }

    function decode(x) {
        return decodeURIComponent(coalesce(x, ""));
    }

    function doParseHashArguments() {
// Useful for later:
//        var pairs = window.location.hash.substr(1).split("&").map(function(term) { return term.split("="); });
//        var args = {};
//        pairs.forEach(function(pair) { args[decode(pair[0])] = decode(pair[1]); });
        var hash = window.location.hash.substr(1);
        var args = parseHashArguments(hash !== "" ? hash : DEFAULT_HASH_ARGS);
        log.debug(JSON.stringify(args));
        return interpret(args);
    }

    /**
     * Returns a human readable string for the provided coordinates.
     */
    function formatCoordinates(λ, φ) {
        return Math.abs(φ).toFixed(6) + "º " + (φ >= 0 ? "N" : "S") + ", " +
            Math.abs(λ).toFixed(6) + "º " + (λ >= 0 ? "E" : "W");
    }

    /**
     * Returns a human readable string for the provided rectangular wind vector.
     */
    function formatVector(u, v) {
        var d = Math.atan2(-u, -v) / τ * 360;  // calculate into-the-wind cardinal degrees
        var wd = Math.round((d + 360) % 360 / 5) * 5;  // shift [-180, 180] to [0, 360], and round to nearest 5.
        var m = Math.sqrt(u * u + v * v);
        return wd.toFixed(0) + "º @ " + m.toFixed(1) + " m/s";
    }

    function init() {
        // Tweak document to distinguish CSS styling between touch and non-touch environments. Hacky hack.
        if ("ontouchstart" in document.documentElement) {
            document.addEventListener("touchstart", function() {}, false);  // this hack enables :active pseudoclass
        }
        else {
            document.documentElement.className += " no-touch";  // to filter styles problematic for touch
        }
        // Modify the display elements to fill the screen.
        d3.select(MAP_SVG_ID).attr("width", view.width).attr("height", view.height);
        d3.select(FIELD_CANVAS_ID).attr("width", view.width).attr("height", view.height);
        d3.select(OVERLAY_CANVAS_ID).attr("width", view.width).attr("height", view.height);
        d3.select(FOREGROUND_SVG_ID).attr("width", view.width).attr("height", view.height);

        d3.select(window).on("hashchange", function() {
            log.debug("hashchange! " + window.location.hash);
        });
    }

    function createSettings(topo) {
        var isFF = /firefox/i.test(navigator.userAgent);
        var projection = util.createOrthographicProjection(topo.bbox[0], topo.bbox[1], topo.bbox[2], topo.bbox[3], view);
        var bounds = util.createDisplayBounds(projection);
        var styles = [];
        var settings = {
            projection: projection,
            displayBounds: bounds,
            particleCount: Math.round(bounds.width / 0.14),
            maxParticleAge: 40,  // max number of frames a particle is drawn before regeneration
            velocityScale: bounds.height / 39000,  // particle speed as number of pixels per unit vector
            fadeFillStyle: isFF ? "rgba(0, 0, 0, 0.95)" : "rgba(0, 0, 0, 0.97)",  // FF Mac alpha behaves differently
            frameRate: 40,  // desired milliseconds per frame
            animate: true,
            styles: styles,
            styleIndex: function(m) {  // map wind speed to a style
                return Math.floor(Math.min(m, 17) / 17 * (styles.length - 1));
            }
        };
        log.debug(JSON.stringify(view) + " " + JSON.stringify(settings));
        for (var j = 85; j <= 255; j += 5) {
            styles.push(util.asColorStyle(j, j, j, 1));
        }
        return settings;
    }

    var bad = false;
    function displayStatus(status, isError) {
        if (isError || !bad) {
            d3.select(STATUS_ID).node().textContent = status ? "⁂ " + status : "";
            bad = isError;  // errors are sticky--let's not overwrite error information if it occurs
        }
    }

    function buildMeshes(topo) {
        // UNDONE: Probably don't need this function anymore. Just need settings that will initialize the features...
        displayStatus("building meshes...");
        log.time("building meshes");
        var bbox = topo.bbox;
        var boundaryLo = topojson.feature(topo, topo.objects.coastline_110m);  // UNDONE: mesh vs. feature?
        var boundaryHi = topojson.feature(topo, topo.objects.coastline_50m);
        log.timeEnd("building meshes");
        return {
            boundingBox: [[bbox[0], bbox[1]], [bbox[2], bbox[3]]],
            boundaryLo: boundaryLo,
            boundaryHi: boundaryHi
        };
    }

    function distance(a, b) {
        return mvi.dist(a[0], a[1], b[0], b[1]);
    }

    function createMapController() {
        var projection;
        var dispatch = d3.dispatch("start", "redraw", "end", "click");
        var moveCount = 0, isClick = false;
        var startMouse, startScale, sensitivity, rot;

        var zoom = d3.behavior.zoom()
            .scaleExtent([25, view.width * 2])
            .on("zoomstart", function() {
                startMouse = d3.mouse(this);
                startScale = zoom.scale();
                sensitivity = 60 / startScale;  // seems to provide a good drag scaling factor
                rot = [projection.rotate()[0] / sensitivity, -projection.rotate()[1] / sensitivity];
                isClick = true;
            })
            .on("zoom", function() {
                var currentMouse = d3.mouse(this);
                var currentScale = d3.event.scale;
                // some hysteresis to avoid spurious 1-pixel rotations
                if (moveCount === 0 && startScale === currentScale && distance(startMouse, currentMouse) < 2) {
                    return;
                }
                isClick = false;
                if (moveCount === 0) {
                    dispatch.start();
                }
                var xd = currentMouse[0] - startMouse[0] + rot[0];
                var yd = currentMouse[1] - startMouse[1] + rot[1];
                projection.rotate([xd * sensitivity, -yd * sensitivity, projection.rotate()[2]]);
                projection.scale(d3.event.scale);
                dispatch.redraw();
                moveCount++;
            })
            .on("zoomend", function() {
                if (isClick) {
                    isClick = false;
                    var coord = projection.invert(startMouse);
                    if (coord && isFinite(coord[0]) && isFinite(coord[1])) {
                        dispatch.click(startMouse, coord);
                    }
                }
                else {
                    var expected = moveCount;
                    setTimeout(function() {
                        if (moveCount === expected) {
                            moveCount = 0;
                            dispatch.end();
                        }
                    }, 1000);
                }
            });

        dispatch.projection = function(_) {
            return _ ? (zoom.scale((projection = _).scale()), this) : projection;
        };
        dispatch.zoom = zoom;
        return dispatch;
    }

    var handler = null;

    function renderMap(settings, mesh) {
        displayStatus("Rendering map...");
        log.time("rendering map");

        var projection = settings.projection;
        var path = d3.geo.path().projection(projection);
        var mapSvg = d3.select(MAP_SVG_ID);
        var foregroundSvg = d3.select(FOREGROUND_SVG_ID);
        var defs = mapSvg.append("defs");

        var gradientFill = defs.append("radialGradient")
            .attr("id", "orthographic-fill")
            .attr("gradientUnits", "objectBoundingBox")
            .attr("cx", "50%").attr("cy", "49%").attr("r", "50%");
        gradientFill.append("stop").attr("stop-color", "#303030").attr("offset", "69%");
        gradientFill.append("stop").attr("stop-color", "#202020").attr("offset", "91%");
        gradientFill.append("stop").attr("stop-color", "#000000").attr("offset", "96%");

        defs.append("path")
            .datum({type: "Sphere"})
            .attr("id", "sphere")
            .attr("d", path);
        defs.append("clipPath")
            .attr("id", "clip")
            .append("use")
            .attr("xlink:href", "#sphere");

        if (projection.isOrthographic) {
            mapSvg.append("use")
                .attr("fill", "url(#orthographic-fill)")
                .attr("xlink:href", "#sphere");
        }
        else {
            mapSvg.append("use")
                .attr("class", "sphere-fill")
                .attr("xlink:href", "#sphere");
        }
        mapSvg.append("path")
            .datum(d3.geo.graticule())
            .attr("class", "graticule")
            .attr("clip-path", "url(#clip)")
            .attr("d", path);

        var world = mapSvg.append("path")
            .datum(mesh.boundaryHi)
            .attr("class", "coastline")
            .attr("clip-path", "url(#clip)")
            .attr("d", path);

        foregroundSvg.append("use")
            .attr("class", "sphere-stroke")
            .attr("xlink:href", "#sphere");

        handler = {
            grid: null,  // filled in later. yuck?
            field: null  // filled in later
        };

        function show(point, coord) {
            var x = point[0], y = point[1], λ = coord[0], φ = coord[1];
            // show the point on the map
            var position = d3.select(POSITION_ID);
            if (!position.node()) {
                position = foregroundSvg.append("path").attr("id", POSITION_ID.substr(1));
            }
            position.datum({type: "Point", coordinates: [λ, φ]}).attr("d", path.pointRadius(7));

            // show details at that point, if any
            if (handler.field && (handler.field(x, y)[2] != NIL)) {
                var wind;
                if (handler.grid && !isNullOrUndefined(wind = handler.grid(λ, φ))) {
                    d3.select(LOCATION_ID).node().textContent = "⁂ " + formatCoordinates(λ, φ);
                    var pointDetails = "⁂ " + formatVector(wind[0], wind[1]);
                    d3.select(POINT_DETAILS_ID).node().innerHTML = pointDetails;
                }
            }
        }

        var controller = createMapController()
            .projection(projection)
            .on("start", function() {
                resetDisplay(settings);
                world.datum(mesh.boundaryLo);
            })
            .on("redraw", function() {
                d3.select(DISPLAY_ID).selectAll("path").attr("d", path);
            })
            .on("end", function() {
                world.datum(mesh.boundaryHi).attr("d", path);
                prepareDisplay(settings);
            })
            .on("click", show);

        foregroundSvg.call(controller.zoom);

        function locate() {
            if (navigator.geolocation) {
                navigator.geolocation.getCurrentPosition(
                    function(position) {
                        var coord = [position.coords.longitude, position.coords.latitude];
                        show(controller.projection()(coord), coord);
                    },
                    log.error);
            }
        }

        d3.select(SHOW_LOCATION_ID).on("click", locate);

        log.timeEnd("rendering map");
    }

    function createMask(model) {
        log.time("render mask");

        // Create a detached canvas, ask the model to define the mask polygon, then fill with an opaque color.
        var width = view.width, height = view.height;
        var canvas = d3.select(document.createElement("canvas")).attr("width", width).attr("height", height).node();
        var context = model.defineMask(canvas.getContext("2d"));
        context.fillStyle = util.asColorStyle(255, 0, 0, 1);
        context.fill();
        // d3.select(DISPLAY_ID).node().appendChild(canvas);  // make mask visible for debugging

        var data = context.getImageData(0, 0, width, height).data;  // layout: [r, g, b, a, r, g, b, a, ...]
        log.timeEnd("render mask");
        return {
            data: data,
            isVisible: function(x, y) {
                var i = (y * width + x) * 4;
                return data[i + 3] > 0;  // non-zero alpha means pixel is visible
            },
            set: function(x, y, r, g, b, a) {
                var i = (y * width + x) * 4;
                data[i    ] = r;
                data[i + 1] = g;
                data[i + 2] = b;
                data[i + 3] = a;
            }
        };
    }

    function toLocalISO(date) {
        return date.getFullYear() + "-" +
            (date.getMonth() + 101).toString().substr(1) + "-" +
            (date.getDate() + 100).toString().substr(1) + " " +
            (date.getHours() + 100).toString().substr(1) + ":00";
    }

    function displayLayerMetadata(meta, recipe) {
        d3.select(DATA_DATE).node().textContent = toLocalISO(new Date(meta.date)) + " (local)";
        d3.select(DATA_LAYER).node().textContent = recipe.description;
        d3.select(DATA_CENTER).node().textContent = "US National Weather Service";
    }

    function buildGrid(data) {
        log.time("build grid");

        // http://www.nco.ncep.noaa.gov/pmb/docs/grib2/
        // http://mst.nerc.ac.uk/wind_vect_convs.html

        // UNDONE: surface types and values:
        // "surface1Type":103,
        // "surface1TypeName":"Specified height level above ground",
        // "surface1Value":10.0,

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

        displayLayerMetadata(uRecord.meta, args.recipe);

        var header = uRecord.header;
        var λ0 = header.lo1, φ0 = header.la1;  // the grid's origin (e.g., 0.0E, 90.0N)
        var Δλ = header.dx, Δφ = header.dy;    // distance between grid points (e.g., 2.5 deg lon, 2.5 deg lat)
        var ni = header.nx, nj = header.ny;    // number of grid points W-E and N-S (e.g., 144 x 73)
        var uData = uRecord.data, vData = vRecord.data;
        if (uData.length != vData.length) {
            return d.reject("Mismatched data point lengths");
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

        log.timeEnd("build grid");

        return function(λ, φ) {
            var i = floorDiv(λ - λ0, 360) / Δλ;  // calculate longitude index in wrapped range [0, 360)
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
                        return mvi.bilinear(i - fi, j - fj, g00, g10, g01, g11);
                    }
                }
            }
            // log.debug("cannot interpolate: " + λ + "," + φ + ": " + fi + " " + ci + " " + fj + " " + cj);
            return null;
        };
    }

    function createField(columns, bounds, mask) {
        var nilVector = [NaN, NaN, NIL];
        var field = function(x, y) {
            var column = columns[Math.round(x)];
            if (column) {
                var v = column[Math.round(y)];
                if (v) {
                    return v;
                }
            }
            return nilVector;
        };

        field.randomize = function(o) {
            var x, y;
            var net = 0;  // UNDONE: fix
            do {
                x = Math.round(util.rand(bounds.x, bounds.xBound + 1));
                y = Math.round(util.rand(bounds.y, bounds.yBound + 1));
            } while (field(x, y)[2] == NIL && net++ < 30);
            o.x = x;
            o.y = y;
            return o;
        };

        field.overlay = mask.data;

        return field;
    }

    function interpolateField(settings, grid, mask) {
        log.time("interpolating field");
        var d = when.defer();

        var projection = settings.projection;
        var distortion = util.distortion(projection);
        var dv = [];
        var velocityScale = settings.velocityScale;

        /**
         * Calculate distortion of the wind vector caused by the shape of the projection at point (x, y). The wind
         * vector is modified in place and returned by this function.
         */
        function distort(x, y, λ, φ, wind) {
            var u = wind[0], us = u * velocityScale;
            var v = wind[1], vs = v * velocityScale;
            var du = wind;

            if (!distortion(λ, φ, x, y, du, dv)) {
                throw new Error("whoops");
            }

            // Scale distortion vectors by u and v, then add.
            wind[0] = du[0] * us + dv[0] * vs;
            wind[1] = -(du[1] * us + dv[1] * vs);  // Reverse v component because y-axis grows down.
            wind[2] = Math.sqrt(u * u + v * v);  // calculate the original wind magnitude

            return wind;
        }

        var bounds = settings.displayBounds;
        var columns = [];
        var point = [];
        var x = bounds.x;
        function interpolateColumn(x) {
            var column = [];
            for (var y = bounds.y; y <= bounds.yBound; y += 1) {
                if (mask.isVisible(x, y)) {
                    point[0] = x; point[1] = y;
                    var coord = projection.invert(point);
                    if (coord) {
                        var λ = coord[0], φ = coord[1];
                        if (isFinite(λ)) {
                            var wind = grid(λ, φ);
                            if (wind) {
                                column[y] = distort(x, y, λ, φ, wind);
                                var c = util.asRainbowColorStyle2(Math.min(wind[2], 25) / 25, Math.floor(255 * 0.4));
                                mask.set(x, y, c[0], c[1], c[2], c[3]);
                                continue;
                            }
                        }
                    }
                    mask.set(x, y, 0, 0, 0, 0);
                }
            }
            columns[x] = column;
        }

        (function batchInterpolate() {
            try {
                if (settings.animate) {
                    var start = +new Date();
                    while (x < bounds.xBound) {
                        interpolateColumn(x);
                        x += 1;
                        if ((+new Date() - start) > MAX_TASK_TIME) {
                            // Interpolation is taking too long. Schedule the next batch for later and yield.
                            displayStatus("Interpolating: " + x + "/" + bounds.xBound);
                            setTimeout(batchInterpolate, MIN_SLEEP_TIME);
                            return;
                        }
                    }
                    // var date = data[0].date.replace(":00+09:00", "");
                    // d3.select(DISPLAY_ID).attr("data-date", displayData.date = date);
                    // displayStatus(date + " JST");
                    displayStatus("");
                    d.resolve(createField(columns, bounds, mask));
                    log.timeEnd("interpolating field");
                }
            }
            catch (e) {
                d.reject(e);
            }
        })();

        return d.promise;
    }

    function overlay(settings, field) {
        log.time("overlay");
        if (settings.animate) {
            var canvas = d3.select(OVERLAY_CANVAS_ID).node();
            var context = canvas.getContext("2d");
            var imageData = context.getImageData(0, 0, canvas.width, canvas.height);
            imageData.data.set(field.overlay);
            context.putImageData(imageData, 0, 0);
        }
        log.timeEnd("overlay");
    }

    function animate(settings, field) {

        var bounds = settings.displayBounds;
        var buckets = settings.styles.map(function() { return []; });
        var particles = [];

        for (var i = 0; i < settings.particleCount; i++) {
            particles.push(field.randomize({age: util.rand(0, settings.maxParticleAge)}));
        }

        function evolve() {
            buckets.forEach(function(bucket) { bucket.length = 0; });
            particles.forEach(function(particle) {
                if (particle.age > settings.maxParticleAge) {
                    field.randomize(particle).age = 0;
                }
                var x = particle.x;
                var y = particle.y;
                var v = field(x, y);  // vector at current position
                var m = v[2];
                if (m === NIL) {
                    particle.age = settings.maxParticleAge;  // particle has escaped the grid, never to return...
                }
                else {
                    var xt = x + v[0];
                    var yt = y + v[1];
                    if (field(xt, yt)[2] !== NIL) {
                        // Path from (x,y) to (xt,yt) is visible, so add this particle to the appropriate draw bucket.
                        particle.xt = xt;
                        particle.yt = yt;
                        buckets[settings.styleIndex(m)].push(particle);
                    }
                    else {
                        // Particle isn't visible, but it still moves through the field.
                        particle.x = xt;
                        particle.y = yt;
                    }
                }
                particle.age += 1;
            });
        }

        var g = d3.select(FIELD_CANVAS_ID).node().getContext("2d");
        g.lineWidth = 0.75;
        g.fillStyle = settings.fadeFillStyle;

        function draw() {
            // Fade existing particle trails.
            var prev = g.globalCompositeOperation;
            g.globalCompositeOperation = "destination-in";
            g.fillRect(bounds.x, bounds.y, bounds.width, bounds.height);
            g.globalCompositeOperation = prev;

            // Draw new particle trails.
            buckets.forEach(function(bucket, i) {
                if (bucket.length > 0) {
                    g.beginPath();
                    g.strokeStyle = settings.styles[i];
                    bucket.forEach(function(particle) {
                        g.moveTo(particle.x, particle.y);
                        g.lineTo(particle.xt, particle.yt);
                        particle.x = particle.xt;
                        particle.y = particle.yt;
                    });
                    g.stroke();
                }
            });
        }

        (function frame() {
            // log.debug("frame");
            try {
                if (settings.animate) {
                    // var start = +new Date;
                    evolve();
                    draw();
                    // var duration = (+new Date - start);
                    setTimeout(frame, settings.frameRate /* - duration*/);
                }
            }
            catch (e) {
                report(e);
            }
        })();
    }

    function postInit(grid, field) {
        handler.grid = grid;
        handler.field = field;

//        // Add event handlers for the time navigation buttons.
//        function navToHours(offset) {
//            var parts = args.date.split(/[- :]/);
//            var date = parts.length >= 4 ?
//                new Date(parts[0], parts[1] - 1, parts[2], parts[3]) :
//                args.samples.indexOf("current") > 0 ? new Date() : null;
//
//            if (isFinite(+date)) {
//                date.setHours(date.getHours() + offset);
//                window.location.href = "/map/" +
//                    args.type + "/" +
//                    date.getFullYear() + "/" +
//                    (date.getMonth() + 1) + "/" +
//                    date.getDate() + "/" +
//                    date.getHours();
//            }
//        }
//        d3.select(PREVIOUS_DAY_ID).on("click", navToHours.bind(null, -24));
//        d3.select(PREVIOUS_FORECAST_ID).on("click", navToHours.bind(null, -3));
//        d3.select(NEXT_FORECAST_ID).on("click", navToHours.bind(null, +3));
//        d3.select(NEXT_DAY_ID).on("click", navToHours.bind(null, +24));
//        d3.select(CURRENT_CONDITIONS_ID).on("click", function() {
//
//            window.location.href = "/map/" + args.type + "/current";
//        });
    }

    function clearCanvas(canvas) {
        canvas.getContext("2d").clearRect(0, 0, canvas.width, canvas.height);
    }

    function resetDisplay(settings) {
        settings.animate = false;
        clearCanvas(d3.select(FIELD_CANVAS_ID).node());
        clearCanvas(d3.select(OVERLAY_CANVAS_ID).node());
    }

    function prepareDisplay(settings) {
        // UNDONE: make this better -- don't like the "settings" object...
        settings.animate = true;
        settings.displayBounds = util.createDisplayBounds(settings.projection);

        var model = {
            defineMask: function(context) {
                d3.geo.path().projection(settings.projection).context(context)({type: "Sphere"});
                return context;
            }
        };

        var maskTask        = when.all([model                                 ]).then(apply(createMask));
        var fieldTask       = when.all([settingsTask, buildGridTask, maskTask ]).then(apply(interpolateField));
        var postInitTask    = when.all([buildGridTask, fieldTask              ]).then(apply(postInit));
        var overlayTask     = when.all([settingsTask, fieldTask               ]).then(apply(overlay));
        var animateTask     = when.all([settingsTask, fieldTask               ]).then(apply(animate));

        when.all([
            maskTask,
            fieldTask,
            postInitTask,
            overlayTask,
            animateTask
        ]).then(null, report);
    }

    function report(e) {
        log.error(e);
        displayStatus(e.error ? e.error == 404 ? "No Data" : e.error + " " + e.message : e, true);
    }

    var topoTask        = util.loadJson(args.topography);
    var dataTask        = util.loadJson(args.samples);
    var initTask        = when.all([true                                ]).then(apply(init));
    var settingsTask    = when.all([topoTask                            ]).then(apply(createSettings));
    var meshTask        = when.all([topoTask                            ]).then(apply(buildMeshes));
    var renderMapTask   = when.all([settingsTask, meshTask              ]).then(apply(renderMap));
    var buildGridTask   = when.all([dataTask                            ]).then(apply(buildGrid));
    var prepareTask     = when.all([settingsTask                        ]).then(apply(prepareDisplay));

    // Register a catch-all error handler to log errors rather then let them slip away into the ether.... Cleaner way?
    when.all([
        topoTask,
        initTask,
        settingsTask,
        meshTask,
        renderMapTask,
        buildGridTask,
        prepareTask
    ]).then(null, report);

})();
