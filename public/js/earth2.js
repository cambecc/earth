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
            var msg = e.error ? e.error == 404 ? "No Data" : e.error + " " + e.message : e;
            report.progress(msg).classed("bad", true);
        }
    };
    var configuration = µ.buildConfiguration(d3.set(globes.keys()));
    configuration.on("change", function event_logger() {
        log.debug("changed: " + JSON.stringify(configuration.changedAttributes()));
    });

    var inputController = function buildInputController() {
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
                    }, 1000);  // UNDONE: use debounce here
                }
            });

        d3.select("#foreground").call(zoom);

        function reorient() {
            if (globe) {
                globe.orientation(configuration.get("orientation"));
                zoom.scale(globe.projection.scale());
                dispatch.trigger("end");  // a little odd here, but need to force redraw with hi-res boundary
                dispatch.trigger("redraw");  // a little odd here, but need to force redraw with hi-res boundary
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
        var handle = {
            value: function() { return value; },
            submit: _.debounce(submit, 0),
            cancel: function() {}  // initially a nop
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
            handle.cancel();  // cancel the current task--no effect if already completed
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
        return µ.loadJson(resource).then(function(topo) {
            if (cancel.requested) return null;
            report.progress("building meshes...");
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

    function buildGrid(layer, cancel) {
        return µ.loadJson(layer).then(function(data) {
            if (cancel.requested) return null;
            report.progress("building grid...");
            log.time("build grid");
            var result = layers.buildGrid(data);
            log.timeEnd("build grid");
            return result;
        });
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

    function buildGlobeController(mesh, globe) {
        if (!mesh || !globe) return null;

        report.progress("Building globe...");
        log.time("rendering map");

        // UNDONE: better way to do the following?
        var dispatch = _.clone(Backbone.Events);
        if (activeGlobeController._previous) {
            activeGlobeController._previous.stopListening();
        }
        activeGlobeController._previous = dispatch;

        // First clear map and foreground svg contents.
        µ.removeChildren(d3.select("#map").node());
        µ.removeChildren(d3.select("#foreground").node());
        // Create new map svg elements.
        globe.defineMap(d3.select("#map"), d3.select("#foreground"));

        var path = d3.geo.path().projection(globe.projection).pointRadius(7);
        var coastline = d3.select(".coastline");

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

        // Finally, inject the globe model into the input controller.
        inputController.globe(globe);

        log.timeEnd("rendering map");
    }

    /**
     * The page's current globe controller. There can be only one.
     */
    var activeGlobeController = debouncedValue();
    activeGlobeController.listenTo(activeMesh, "update", function(mesh) {
        activeGlobeController.submit(buildGlobeController, mesh, activeGlobe.value());
    });
    activeGlobeController.listenTo(activeGlobe, "update", function(globe) {
        activeGlobeController.submit(buildGlobeController, activeMesh.value(), globe);
    });

    function createMask(globe) {
        if (!globe) return null;

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
    activeMask.listenTo(activeGlobe, "update", function(globe) {
        activeMask.submit(createMask, globe);
    });
    activeMask.listenTo(inputController, "end", function() {  // UNDONE: better name for this event -- reorientation?
        activeMask.submit(createMask, activeGlobe.value());
    });

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

    function interpolateField(globe, grid, mask, cancel) {
        if (!globe || !grid || !mask) return null;

        log.time("interpolating field");
        var d = when.defer();

        var projection = globe.projection;
        var distortion = µ.distortion(projection);
        var bounds = globe.bounds();
        var velocityScale = bounds.height / 39000;  // particle speed as number of pixels per unit vector
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

        var columns = [];
        var point = [];
        var x = bounds.x;
        var interpolate = grid.interpolate;
        function interpolateColumn(x) {
            var column = [];
            for (var y = bounds.y; y <= bounds.yMax; y += 2) {
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
                                mask.set(x+1, y, c[0], c[1], c[2], c[3]);
                                mask.set(x+1, y+1, c[0], c[1], c[2], c[3]);
                                mask.set(x, y+1, c[0], c[1], c[2], c[3]);
                                continue;
                            }
                        }
                    }
                    mask.set(x, y, 0, 0, 0, 0);
                    mask.set(x+1, y, 0, 0, 0, 0);
                    mask.set(x, y+1, 0, 0, 0, 0);
                    mask.set(x+1, y+1, 0, 0, 0, 0);
                }
            }
            columns[x] = column;
            columns[x+1] = column;
        }

        (function batchInterpolate() {
            try {
                if (!cancel.requested) {
                    var start = +new Date();
                    while (x < bounds.xMax) {
                        interpolateColumn(x);
                        x += 2;
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

    function drawOverlay(field) {
        if (!field) return null;
        log.time("overlay");
        var canvas = d3.select("#overlay").node();
        var context = canvas.getContext("2d");
        var imageData = context.getImageData(0, 0, canvas.width, canvas.height);
        imageData.data.set(field.overlay);
        context.putImageData(imageData, 0, 0);
        log.timeEnd("overlay");
    }

    var activeOverlay = debouncedValue();
    activeOverlay.listenTo(activeField, "update", function(field) {
        activeOverlay.submit(drawOverlay, field);
    });

    function cleanDisplay() {
        console.log("cleaning");
        activeField.cancel();
        activeOverlay.cancel();
        µ.clearCanvas(d3.select("#overlay").node());
    }

    var displayCleaner = debouncedValue();
    activeOverlay.listenTo(inputController, "start", function() {
        displayCleaner.submit(cleanDisplay);
    });
    activeOverlay.listenTo(configuration, "change:projection change:orientation", function() {
        displayCleaner.submit(cleanDisplay);
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
            // d3.select("#data-layer").text(grid.recipe.description);
            d3.select("#data-center").text("US National Weather Service");
        });
    }());

    configuration.fetch();  // everything is now set up, so kick off the events

})();
