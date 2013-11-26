/**
 * earth - a project to visualize global air data.
 *
 * Copyright (c) 2013 Cameron Beccario
 * The MIT License - http://opensource.org/licenses/MIT
 *
 * https://github.com/cambecc/earth
 */
(function() {
    "use strict";

    var NIL = -2;             // non-existent vector
    var MAX_TASK_TIME = 100;  // amount of time before a task yields control (milliseconds)
    var MIN_SLEEP_TIME = 25;  // amount of time a task waits before resuming (milliseconds)

    var view = µ.view();
    var log = µ.log();
    var report = {
        progress: function(msg) {
            var s = d3.select("#progress");
            return s.classed("bad") ? s : s.text(msg ? "⁂ " + msg : "");  // don't overwrite errors
        },
        error: function(e) {
            log.error(e);
            var msg = e.status ? e.status == 404 ? "No Data" : e.status + " " + e.message : e;
            report.progress(msg).classed("bad", true);
        },
        reset: function() {
            d3.select("#progress").classed("bad", false);
            report.progress("");
        }
    };
    var configuration = µ.buildConfiguration(d3.set(globes.keys()));
    configuration.on("change", function event_logger() {
        log.debug("changed: " + JSON.stringify(configuration.changedAttributes()));
        report.reset();
    });

    var inputController = function buildInputController() {
        log.debug("building input controller");
        var globe;
        var dispatch = _.clone(Backbone.Events);
        var moveCount = 0, isClick = false;
        var startMouse, startScale, manipulator;

        var zoom = d3.behavior.zoom()
            .on("zoomstart", function() {
                startMouse = d3.mouse(this);
                startScale = zoom.scale();
                manipulator = globe.manipulator(startMouse, startScale);
                isClick = true;
            })
            .on("zoom", function() {
                var currentMouse = d3.mouse(this);
                var currentScale = d3.event.scale;
                // some hysteresis to avoid spurious 1-pixel rotations -- UNDONE: and one/zero level zooms
                if (moveCount === 0 && startScale === currentScale && µ.distance(startMouse, currentMouse) < 2) {
                    return;
                }
                isClick = false;
                if (moveCount === 0) {
                    dispatch.trigger("start");
                }
                manipulator.move(currentMouse, currentScale);
                dispatch.trigger("redraw");
                moveCount++;
            })
            .on("zoomend", function() {
                if (isClick) {
                    isClick = false;
                    var coord = globe.projection.invert(startMouse);
                    if (coord && _.isFinite(coord[0]) && _.isFinite(coord[1])) {
                        dispatch.trigger("click", startMouse, coord);
                    }
                }
                else {
                    var expected = moveCount;
                    setTimeout(function() {
                        if (moveCount === expected) {
                            moveCount = 0;
                            configuration.save({orientation: globe.orientation()});
                            dispatch.trigger("end");
                        }
                    }, 1000);
                }
            });

        d3.select("#foreground").call(zoom);

        function locate() {
            if (navigator.geolocation) {
                navigator.geolocation.getCurrentPosition(
                    function(position) {
                        var coord = [position.coords.longitude, position.coords.latitude], rotate;
                        if (rotate = globe.locate(coord)) {
                            dispatch.trigger("start");
                            globe.projection.rotate(rotate);
                            dispatch.trigger("redraw");
                            configuration.save({orientation: globe.orientation()});
                            dispatch.trigger("end");
                        }
                        dispatch.trigger("click", globe.projection(coord), coord);
                    },
                    log.error);
            }
        }

        d3.select("#show-location").on("click", locate);

        function reorient() {
            if (globe) {
                dispatch.trigger("start");
                globe.orientation(configuration.get("orientation"));
                zoom.scale(globe.projection.scale());
                dispatch.trigger("redraw");
                dispatch.trigger("end");
            }
        }

        dispatch.listenTo(configuration, {
            "change:orientation": reorient
        });

        dispatch.globe = function(_) {
            if (!_) {
                return globe;
            }
            globe = _;
            zoom.scaleExtent(globe.scaleExtent());
            reorient();
            return this;
        };

        return dispatch;
    }();

    function debouncedValue() {

        var value = null;
        var debouncedSubmit = _.debounce(submit, 0);
        var handle = {
            value: function() { return value; },
            submit: function() {
                handle.cancel();
                debouncedSubmit.apply(this, arguments);
            },
            cancel: function() {}  // initially a nop. CONSIDER: if requested=true too, then flag signifies validity
        };

        function submit(callback) {
            function cancel() {
                cancel.requested = true;
            }
            function run(args) {
                return cancel.requested ? null : callback.apply(null, args);
            }
            function accept(newValue) {
                return cancel.requested ? null : handle.trigger("update", value = newValue);
            }
            function reject(error) {
                return cancel.requested ? null : report.error(error);
            }
            // handle.cancel();  // cancel the current task--no effect if already completed
            var args = _.rest(arguments).concat(handle.cancel = cancel);
            when.all(args).then(run).done(accept, reject);
        }

        return _.extend(handle, Backbone.Events);
    }

    /**
     * @param resource the GeoJSON resource's URL
     * @param cancel
     * @returns {Object} a promise for GeoJSON topology features: {boundaryLo:, boundaryHi:}
     */
    function buildMesh(resource, cancel) {
        report.progress("Downloading...");
        return µ.loadJson(resource).then(function(topo) {
            if (cancel.requested) return null;
            log.time("building meshes");
            var boundaryLo = topojson.feature(topo, topo.objects.coastline_110m);
            var boundaryHi = topojson.feature(topo, topo.objects.coastline_50m);
            log.timeEnd("building meshes");
            return {
                boundaryLo: boundaryLo,
                boundaryHi: boundaryHi
            };
        });
    }

    /**
     * The page's current topology mesh. There can be only one.
     */
    var activeMesh = debouncedValue();
    activeMesh.listenTo(configuration, "change:topology", function(context, attr) {
        activeMesh.submit(buildMesh, attr);
    });


    /**
     * @param {String} projectionName the desired projection's name.
     * @returns {Object} a promise for a globe object.
     */
    function buildGlobe(projectionName) {
        var builder = globes.get(projectionName);
        return builder ?
            when(builder()) :
            when.reject("Unknown projection: " + projectionName);
    }

    /**
     * The page's current globe model. There can be only one.
     */
    var activeGlobe = debouncedValue();
    activeGlobe.listenTo(configuration, "change:projection", function(source, attr) {
        activeGlobe.submit(buildGlobe, attr);
    });

    var nextId = 0;
    var downloadsInProgress = {};

    function buildGrid(layer, cancel) {
        report.progress("Downloading...");
        var id = nextId++;
        var task = µ.loadJson(layer).then(function(data) {
            if (cancel.requested) return null;
            log.time("build grid");
            var result = layers.buildGrid(data, configuration.pick("param", "surface", "level"));
            log.timeEnd("build grid");
            return result;
        }).ensure(function() { delete downloadsInProgress[id]; });

        downloadsInProgress[id] = task;
        return task;
    }

    /**
     * The page's current grid. There can be only one.
     */
    var activeGrid = debouncedValue();
    activeGrid.listenTo(configuration, "change", function() {
        var layerAttributes = ["date", "hour", "param", "surface", "level"];
        if (_.intersection(_.keys(configuration.changedAttributes()), layerAttributes).length > 0) {
            activeGrid.submit(buildGrid, configuration.toPath());
        }
    });

    function buildRenderer(mesh, globe) {
        if (!mesh || !globe) return null;

        report.progress("Rendering Globe...");
        log.time("rendering map");

        // UNDONE: better way to do the following?
        var dispatch = _.clone(Backbone.Events);
        if (activeRenderer._previous) {
            activeRenderer._previous.stopListening();
        }
        activeRenderer._previous = dispatch;

        // First clear map and foreground svg contents.
        µ.removeChildren(d3.select("#map").node());
        µ.removeChildren(d3.select("#foreground").node());
        // Create new map svg elements.
        globe.defineMap(d3.select("#map"), d3.select("#foreground"));

        var path = d3.geo.path().projection(globe.projection).pointRadius(7);
        var coastline = d3.select(".coastline");
        d3.select("#display").selectAll("path").attr("d", path);  // do an initial draw -- fixes issue with safari

        // Attach to map rendering events on input controller.
        dispatch.listenTo(
            inputController, {
                start: function() {
                    coastline.datum(mesh.boundaryLo);
                },
                redraw: function() {
                    d3.select("#display").selectAll("path").attr("d", path);
                },
                end: function() {  // UNDONE: need a better name for this event
                    coastline.datum(mesh.boundaryHi);
                    d3.select("#display").selectAll("path").attr("d", path);
                },
                click: function(point, coord) {
                    // show the point on the map
                    var position = d3.select("#position");
                    if (!position.node()) {
                        position = d3.select("#foreground").append("path").attr("id", "position");
                    }
                    position.datum({type: "Point", coordinates: coord}).attr("d", path);
                }
            });

        // Finally, inject the globe model into the input controller. Do it on the next event turn to ensure
        // renderer is fully set up before events start flowing.
        when(true).then(function() {
            inputController.globe(globe);
        });

        log.timeEnd("rendering map");
        return "ready";
    }

    /**
     * The page's current globe renderer. There can be only one.
     */
    var activeRenderer = debouncedValue();
    activeRenderer.listenTo(activeMesh, "update", function(mesh) {
        activeRenderer.submit(buildRenderer, mesh, activeGlobe.value());
    });
    activeRenderer.listenTo(activeGlobe, "update", function(globe) {
        activeRenderer.submit(buildRenderer, activeMesh.value(), globe);
    });

    function createMask(globe, renderer) {
        if (!globe || !renderer) return null;

        log.time("render mask");

        // Create a detached canvas, ask the model to define the mask polygon, then fill with an opaque color.
        var width = view.width, height = view.height;
        var canvas = d3.select(document.createElement("canvas")).attr("width", width).attr("height", height).node();
        var context = globe.defineMask(canvas.getContext("2d"));
        context.fillStyle = µ.asColorStyle(255, 0, 0, 1);
        context.fill();
        // d3.select("#display").node().appendChild(canvas);  // make mask visible for debugging

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

    var activeMask = debouncedValue();
    activeMask.listenTo(inputController, "end", function() {  // UNDONE: better name for this event -- reorientation?
        activeMask.submit(createMask, activeGlobe.value(), activeRenderer.value());
    });

    function createField(columns, bounds, mask) {
        var nilVector = [NaN, NaN, NIL];

        function field(x, y) {
            var column = columns[Math.round(x)];
            if (column) {
                var v = column[Math.round(y)];
                if (v) {
                    return v;
                }
            }
            return nilVector;
        }

        // Frees the massive "columns" array for GC. Without this, the array is leaked (in Chrome) each time a new
        // field is interpolated because the field closure's context is leaked, for reasons that defy explanation.
        field.release = function() {
            columns = null;
        };

        field.randomize = function(o) {
            var x, y;
            var net = 0;  // UNDONE: fix
            do {
                x = Math.round(_.random(bounds.x, bounds.xMax));
                y = Math.round(_.random(bounds.y, bounds.yMax));
            } while (field(x, y)[2] == NIL && net++ < 30);
            o.x = x;
            o.y = y;
            return o;
        };

        field.overlay = mask.data;

        return field;
    }

    function distortionFor(globe) {

        var velocityScale = globe.bounds().height / 39000;  // particle speed as number of pixels per unit vector
        var distortion = µ.distortion(globe.projection);
        var dv = [];

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

        return distort;
    }

    function interpolateField(globe, grid, mask, cancel) {
        if (!globe || !grid || !mask) return null;

        log.time("interpolating field");
        var d = when.defer();

        var projection = globe.projection;
        var bounds = globe.bounds();
        var distort = distortionFor(globe);

        var columns = [];
        var point = [];
        var x = bounds.x;
        var interpolate = grid.interpolate;
        function interpolateColumn(x) {
            var column = [];
            for (var y = bounds.y; y <= bounds.yMax; y += 1) {
                if (mask.isVisible(x, y)) {
                    point[0] = x; point[1] = y;
                    var coord = projection.invert(point);
                    if (coord) {
                        var λ = coord[0], φ = coord[1];
                        if (isFinite(λ)) {
                            var wind = interpolate(λ, φ);
                            if (wind) {
                                column[y] = distort(x, y, λ, φ, wind);
                                var c = µ.asRainbowColorStyle(Math.min(wind[2], 25) / 25, Math.floor(255 * 0.4));
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
                if (!cancel.requested) {
                    var start = +new Date();
                    while (x < bounds.xMax) {
                        interpolateColumn(x);
                        x += 1;
                        if ((+new Date() - start) > MAX_TASK_TIME) {
                            // Interpolation is taking too long. Schedule the next batch for later and yield.
                            report.progress("Interpolating: " + x + "/" + bounds.xMax);
                            setTimeout(batchInterpolate, MIN_SLEEP_TIME);
                            return;
                        }
                    }
                }
                report.progress("");
                d.resolve(createField(columns, bounds, mask));
                log.timeEnd("interpolating field");
            }
            catch (e) {
                d.reject(e);
            }
        })();

        return d.promise;
    }

    var activeField = debouncedValue();
    activeField.listenTo(activeMask, "update", function(mask) {
        activeField.submit(interpolateField, activeGlobe.value(), activeGrid.value(), mask);
    });
    activeField.listenTo(activeGrid, "update", function(grid) {
        activeField.submit(interpolateField, activeGlobe.value(), grid, activeMask.value());
    });

    function animate(globe, field, cancel) {
        if (!globe || !field) return null;

        var bounds = globe.bounds();
        var colorStyles = µ.colorStyles();
        var buckets = colorStyles.map(function() { return []; });
        var particleCount = Math.round(bounds.width / 0.14);
        var maxParticleAge = 40;  // max number of frames a particle is drawn before regeneration
        var particles = [];

        for (var i = 0; i < particleCount; i++) {
            particles.push(field.randomize({age: _.random(0, maxParticleAge)}));
        }

        function evolve() {
            buckets.forEach(function(bucket) { bucket.length = 0; });
            particles.forEach(function(particle) {
                if (particle.age > maxParticleAge) {
                    field.randomize(particle).age = 0;
                }
                var x = particle.x;
                var y = particle.y;
                var v = field(x, y);  // vector at current position
                var m = v[2];
                if (m === NIL) {
                    particle.age = maxParticleAge;  // particle has escaped the grid, never to return...
                }
                else {
                    var xt = x + v[0];
                    var yt = y + v[1];
                    if (field(xt, yt)[2] !== NIL) {
                        // Path from (x,y) to (xt,yt) is visible, so add this particle to the appropriate draw bucket.
                        particle.xt = xt;
                        particle.yt = yt;
                        buckets[colorStyles.indexFor(m)].push(particle);
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

        var isFF = /firefox/i.test(navigator.userAgent);
        var fadeFillStyle = isFF ? "rgba(0, 0, 0, 0.95)" : "rgba(0, 0, 0, 0.97)";  // FF Mac alpha behaves differently

        var g = d3.select("#animation").node().getContext("2d");
        g.lineWidth = 0.75;
        g.fillStyle = fadeFillStyle;

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
                    g.strokeStyle = colorStyles[i];
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
                if (cancel.requested) {
                    field.release();
                    return;
                }

                // var start = Date.now();
                evolve();
                draw();
                // var duration = (Date.now() - start);
                setTimeout(frame, 40 /*- duration*/);  // desired milliseconds per frame
            }
            catch (e) {
                report.error(e);
            }
        })();
    }

    var activeAnimation = debouncedValue();
    activeAnimation.listenTo(activeField, "update", function(field) {
        activeAnimation.submit(animate, activeGlobe.value(), field);
    });

    function drawOverlay(field, overlayFlag) {
        if (!field) return null;
        log.time("overlay");
        if (overlayFlag === "off") {
            µ.clearCanvas(d3.select("#overlay").node());
        }
        else {
            var canvas = d3.select("#overlay").node();
            var context = canvas.getContext("2d");
            var imageData = context.getImageData(0, 0, canvas.width, canvas.height);
            imageData.data.set(field.overlay);
            context.putImageData(imageData, 0, 0);
        }
        log.timeEnd("overlay");
    }

    var activeOverlay = debouncedValue();
    activeOverlay.listenTo(activeField, "update", function(field) {
        activeOverlay.submit(drawOverlay, field, configuration.get("overlay"));
    });
    activeOverlay.listenTo(configuration, "change:overlay", function(source, overlayFlag) {
        // if only the overlay flag has changed...
        if (_.keys(configuration.changedAttributes()).length === 1) {
            activeOverlay.submit(drawOverlay, activeField.value(), overlayFlag);
        }
    });

    /**
     * Wipes the display to prepare for new projection and/or orientation, and stops all currently
     * active display tasks.
     * @param clear true if the canvases must be cleared. Otherwise only active display tasks, like
     *        animation, are stopped.
     */
    function cleanDisplay(clear) {
        log.time("clean display");
        activeField.cancel();
        activeAnimation.cancel();
        activeOverlay.cancel();
        if (clear) {
            µ.clearCanvas(d3.select("#animation").node());
            µ.clearCanvas(d3.select("#overlay").node());
        }
        log.timeEnd("clean display");
    }

    var displayCleaner = debouncedValue();
    displayCleaner.listenTo(inputController, "start", function() {
        displayCleaner.submit(cleanDisplay, true);  // orientation is beginning to change, so clear the display
    });
    displayCleaner.listenTo(configuration, "change", function() {
        // if anything except the overlay flag has changed...
        if (!_.has(configuration.changedAttributes(), "overlay") ||
                _.keys(configuration.changedAttributes()).length > 1) {
            // HACK: if only the layer changes, don't immediately wipe the canvases. We will wait for the download
            //       to finish, which will then kick off a new field->animation->overlay flow to overwrite the
            //       currently visible display.
            var clear = _.keys(_.pick(configuration.changedAttributes(), "projection", "orientation")).length > 0;
            displayCleaner.submit(cleanDisplay, clear);
        }
    });

    (function init() {
        report.progress("Initializing...");

        d3.selectAll(".full-view").attr("width", view.width).attr("height", view.height);
        d3.select("#show-menu").on("click", function() {
            d3.select("#menu").classed("visible", !d3.select("#menu").classed("visible"));
        });

        // Tweak document to distinguish CSS styling between touch and non-touch environments. Hacky hack.
        if ("ontouchstart" in document.documentElement) {
            d3.select(document).on("touchstart", function() {});  // this hack enables :active pseudoclass
        }
        else {
            d3.select(document.documentElement).classed("no-touch", true);  // to filter styles problematic for touch
        }

        // Bind configuration to URL bar changes.
        d3.select(window).on("hashchange", function() {
            log.debug("hashchange");
            configuration.fetch({trigger: "hashchange"});
        });

        activeGrid.on("update", function(grid) {
            d3.select("#data-date").text(µ.toLocalISO(new Date(grid.meta.date)) + " (local)");
            d3.select("#data-layer").text(grid.recipe.description);
            d3.select("#data-center").text("US National Weather Service");
        });

        // Add event handlers for showing and removing location details.
        inputController.on("click", function(point, coord) {
            var grid = activeGrid.value();
            if (!grid) return;
            var λ = coord[0], φ = coord[1], wind = grid.interpolate(λ, φ);
            if (µ.isValue(wind)) {
                d3.select("#location").text("⁂ " + µ.formatCoordinates(λ, φ));
                d3.select("#location-details").text("⁂ " + µ.formatVector(wind[0], wind[1]));
                d3.select("#location-close").classed("invisible", false);
            }
        });

        function clearDetails() {
            d3.select("#location").text("");
            d3.select("#location-details").text("");
            d3.select("#location-close").classed("invisible", true);
            d3.select("#position").remove();
        }

        d3.select("#location-close").on("click", clearDetails);
        activeGrid.on("update", clearDetails);
        activeRenderer.on("update", clearDetails);

        var THREE_HOURS = 3 * 60 * 60 * 1000;

        // Add event handlers for the time navigation buttons.
        function navToHours(offset) {
            if (_.size(downloadsInProgress) > 0) {
                log.debug("Download in progress--ignoring nav request.");
                return;
            }

            // When the active layer is considered "current", use its time as now, otherwise use current time as
            // now (but rounded down to the nearest three-hour block).
            var grid = activeGrid.value();
            var now = grid ? new Date(grid.meta.date).getTime() : Math.floor(Date.now() / THREE_HOURS) * THREE_HOURS;

            var parts = configuration.get("date").split("/");  // yyyy/mm/dd or "current"
            var hhmm = configuration.get("hour");
            var timestamp = parts.length > 1 ?
                Date.UTC(+parts[0], parts[1] - 1, +parts[2], +hhmm.substring(0, 2)) :
                parts[0] === "current" ? now : null;

            if (isFinite(timestamp)) {
                timestamp += offset * (60 * 60 * 1000);
                parts = new Date(timestamp).toISOString().split(/[- T:]/);
                configuration.save({
                    date: [parts[0], parts[1], parts[2]].join("/"),
                    hour: [parts[3], "00"].join("")});
            }
        }
        d3.select("#nav-prev-day"     ).on("click", navToHours.bind(null, -24));
        d3.select("#nav-next-day"     ).on("click", navToHours.bind(null, +24));
        d3.select("#nav-prev-forecast").on("click", navToHours.bind(null, -3));
        d3.select("#nav-next-forecast").on("click", navToHours.bind(null, +3));
        d3.select("#nav-now").on("click", function() { configuration.save({date: "current", hour: ""}); });

        d3.select("#none").on("click", function() { configuration.save({overlay: "off"}); });
        d3.select("#wind").on("click", function() { configuration.save({overlay: "wv"}); });

        d3.select("#iso-1000").on("click", function() { configuration.save({level: "1000hPa"}); });
        d3.select("#iso-850" ).on("click", function() { configuration.save({level: "850hPa"}); });
        d3.select("#iso-700" ).on("click", function() { configuration.save({level: "700hPa"}); });
        d3.select("#iso-500" ).on("click", function() { configuration.save({level: "500hPa"}); });
        d3.select("#iso-250" ).on("click", function() { configuration.save({level: "250hPa"}); });
        d3.select("#iso-70"  ).on("click", function() { configuration.save({level: "70hPa"}); });
        d3.select("#iso-10"  ).on("click", function() { configuration.save({level: "10hPa"}); });

    }());

    configuration.fetch();  // everything is now set up, so kick off the events

})();
