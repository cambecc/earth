(function() {
    "use strict";

    var NIL = -2;       // non-existent vector
    var MAX_TASK_TIME = 100;  // amount of time before a task yields control (milliseconds)
    var MIN_SLEEP_TIME = 25;  // amount of time a task waits before resuming (milliseconds)

    var DISPLAY_ID = "#display";
    var MAP_SVG_ID = "#map-svg";
    var FIELD_CANVAS_ID = "#field-canvas";
    var OVERLAY_CANVAS_ID = "#overlay-canvas";
    var STATUS_ID = "#status";

    var log = util.log;
    var apply = util.apply;
    var view = util.view;
    var parameters = {
        topography_lo: d3.select(DISPLAY_ID).attr("data-topography-lo"),
        topography_hi: d3.select(DISPLAY_ID).attr("data-topography-hi"),
        samples: d3.select(DISPLAY_ID).attr("data-samples")
    };

    function init() {
        // Modify the display elements to fill the screen.
        d3.select(MAP_SVG_ID).attr("width", view.width).attr("height", view.height);
        d3.select(FIELD_CANVAS_ID).attr("width", view.width).attr("height", view.height);
        d3.select(OVERLAY_CANVAS_ID).attr("width", view.width).attr("height", view.height);
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
    function displayStatus(status, error) {
        if (error) {
            bad = true;  // errors are sticky--let's not overwrite error information if it occurs
            d3.select(STATUS_ID).node().textContent = "⁂ " + error;
        }
        else if (!bad) {
            d3.select(STATUS_ID).node().textContent = status ? "⁂ " + status : "";
        }
    }

    function buildMeshes(topoLo, topoHi, settings) {
        // UNDONE: Probably don't need this function anymore. Just need settings that will initialize the features...
        displayStatus("building meshes...");
        log.time("building meshes");
        var path = d3.geo.path().projection(settings.projection);
        var boundaryLo = topojson.feature(topoLo, topoLo.objects.coastline);  // UNDONE: understand why mesh didn't work here
        var lakesLo = topojson.feature(topoLo, topoLo.objects.lakes);
        var riversLo = topojson.feature(topoLo, topoLo.objects.rivers);
        var boundaryHi = topojson.feature(topoHi, topoHi.objects.coastline);
        var lakesHi = topojson.feature(topoHi, topoHi.objects.lakes);
        var riversHi = topojson.feature(topoHi, topoHi.objects.rivers);
        log.timeEnd("building meshes");
        return {
            path: path,
            boundaryLo: boundaryLo,
            boundaryHi: boundaryHi,
            lakesLo: lakesLo,
            lakesHi: lakesHi,
            riversLo: riversLo,
            riversHi: riversHi
        };
    }

    function renderMap(settings, mesh) {
        displayStatus("Rendering map...");
        log.time("rendering map");

        var projection = settings.projection;

        var path = d3.geo.path().projection(projection);

        var mapSvg = d3.select(MAP_SVG_ID);

        mapSvg.append("defs").append("path")
            .datum({type: "Sphere"})
            .attr("id", "sphere")
            .attr("d", path);
        mapSvg.append("use")
//            .attr("class", "sphere-fill")
            .attr("fill", "url(#g741)")
            .attr("xlink:href", "#sphere");

        var graticule = d3.geo.graticule();
        mapSvg.append("path")
            .datum(graticule)
            .attr("class", "graticule")
            .attr("d", path);

        var world = mapSvg.append("path").attr("class", "coastline").datum(mesh.boundaryHi).attr("d", path);
//        var lakes = mapSvg.append("path").attr("class", "lakes").datum(mesh.lakesHi).attr("d", path);
//        var rivers = mapSvg.append("path").attr("class", "rivers").datum(mesh.riversHi).attr("d", path);

        mapSvg.append("use")
            .attr("class", "sphere-stroke")
            .attr("xlink:href", "#sphere");

        var zoom = d3.behavior.zoom()
            .scale(projection.scale())
            .scaleExtent([0, view.width * 2])
            .on("zoomstart", function() {
                resetDisplay(settings);
                world.datum(mesh.boundaryLo);
//                lakes.datum(mesh.lakesLo);
//                rivers.datum(mesh.riversLo);
            })
            .on("zoom", function() {
                projection.scale(d3.event.scale);
                mapSvg.selectAll("path").attr("d", path);
            })
            .on("zoomend", function() {
                world.datum(mesh.boundaryHi).attr("d", path);
//                lakes.datum(mesh.lakesHi).attr("d", path);
//                rivers.datum(mesh.riversHi).attr("d", path);
                prepareDisplay(settings);
            });

        var m = .25; // drag sensitivity
        d3.select(OVERLAY_CANVAS_ID).call(
            d3.behavior.drag()
                .origin(function() {
                    var r = projection.rotate();
                    return {
                        x: r[0] / m,
                        y: -r[1] / m
                    };
                })
                .on("dragstart", function() {
                    d3.event.sourceEvent.stopPropagation();
                    resetDisplay(settings);
                    world.datum(mesh.boundaryLo);
//                    lakes.datum(mesh.lakesLo);
//                    rivers.datum(mesh.riversLo);
                })
                .on("drag", function() {
                    var rotate = projection.rotate();
                    projection.rotate([d3.event.x * m, -d3.event.y * m, rotate[2]]);
                    mapSvg.selectAll("path").attr("d", path);
                })
                .on("dragend", function() {
                    world.datum(mesh.boundaryHi).attr("d", path);
//                    lakes.datum(mesh.lakesHi).attr("d", path);
//                    rivers.datum(mesh.riversHi).attr("d", path);
                    prepareDisplay(settings);
                }));

        d3.select(DISPLAY_ID).call(zoom);

        log.timeEnd("rendering map");
    }

    function floorDiv(a, n) {
        // floored division: http://en.wikipedia.org/wiki/Modulo_operation
        return a - n * Math.floor(a / n);
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
            if (row = grid[fj]) {
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

    function createField(columns, bounds) {
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
        }

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

        return field;
    }

    var BLOCK = 1;  // block size of field and overlay pixels

    function interpolateField(grid, settings) {
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

            // Scale distortion vectors by u and v, then add. Reverse v component because y-axis grows down.
            wind[0] = du[0] * us + dv[0] * vs;
            wind[1] = -(du[1] * us + dv[1] * vs);
            wind[2] = Math.sqrt(u * u + v * v);  // calculate the original wind magnitude

            return wind;
        }

        var bounds = settings.displayBounds;
        var columns = [];
        var point = [];
        var x = bounds.x;
        function interpolateColumn(x) {
            var column = [];
            for (var y = bounds.y; y <= bounds.yBound; y += BLOCK) {
                point[0] = x, point[1] = y;
                var coord = projection.invert(point);
                var λ = coord[0], φ = coord[1];
                if (!isNaN(λ)) {
                    var wind = grid(λ, φ);
                    if (!wind) {
                        continue;
                    }
                    /*column[y + 1] =*/ column[y] = distort(x, y, λ, φ, wind);
                }
            }
            /*columns[x + 1] =*/ columns[x] = column;
        }

        (function batchInterpolate() {
            try {
                if (settings.animate) {
                    var start = +new Date;
                    while (x < bounds.xBound) {
                        interpolateColumn(x);
                        x += BLOCK;
                        if ((+new Date - start) > MAX_TASK_TIME) {
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
                    d.resolve(createField(columns, bounds));
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

        var d = when.defer();

        var bounds = settings.displayBounds;
        var g = d3.select(OVERLAY_CANVAS_ID).node().getContext("2d");

        log.time("overlay");
        var x = bounds.x;
        function drawColumn(x) {
            for (var y = bounds.y; y <= bounds.yBound; y += BLOCK) {
                var v = field(x, y);
                var m = v[2];
                if (m != NIL) {
                    m = Math.min(m, 25);
                    g.fillStyle = util.asRainbowColorStyle(m / 25, 0.4);
                    g.fillRect(x, y, BLOCK, BLOCK);
                }
            }
        }

        (function batchDraw() {
            try {
                if (settings.animate) {
                    var start = +new Date;
                    while (x < bounds.xBound) {
                        drawColumn(x);
                        x += BLOCK;
                        if ((+new Date - start) > MAX_TASK_TIME * 5) {
                            // Drawing is taking too long. Schedule the next batch for later and yield.
                            setTimeout(batchDraw, MIN_SLEEP_TIME);
                            return;
                        }
                    }
                    d.resolve(true);
                    log.timeEnd("overlay");
                }
            }
            catch (e) {
                d.reject(e);
            }
        })();

        return d.promise;
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

        var fieldTask       = when.all([buildGridTask, settingsTask         ]).then(apply(interpolateField));
        var overlayTask     = when.all([settingsTask, fieldTask              ]).then(apply(overlay));
        var animateTask     = when.all([settingsTask, fieldTask, overlayTask ]).then(apply(animate));

        when.all([
            fieldTask,
            overlayTask,
            animateTask
        ]).then(null, report);
    }

    function report(e) {
        log.error(e);
        displayStatus(null, e.error ? e.error == 404 ? "No Data" : e.error + " " + e.message : e);
    }

    var topoLoTask      = util.loadJson(parameters.topography_lo);
    var topoHiTask      = util.loadJson(parameters.topography_hi);
    var dataTask        = util.loadJson(parameters.samples);
    var initTask        = when.all([true                                ]).then(apply(init));
    var settingsTask    = when.all([topoLoTask                          ]).then(apply(createSettings));
    var meshTask        = when.all([topoLoTask, topoHiTask, settingsTask]).then(apply(buildMeshes));
    var renderMapTask   = when.all([settingsTask, meshTask              ]).then(apply(renderMap));
    var buildGridTask   = when.all([dataTask                            ]).then(apply(buildGrid));
    var prepareTask     = when.all([settingsTask                        ]).then(apply(prepareDisplay));

    // Register a catch-all error handler to log errors rather then let them slip away into the ether.... Cleaner way?
    when.all([
        topoLoTask,
        topoHiTask,
        initTask,
        settingsTask,
        meshTask,
        renderMapTask,
        buildGridTask,
        prepareTask
    ]).then(null, report);

})();
