/**
 * earth - a project to visualize global air data.
 *
 * Copyright (c) 2014 Cameron Beccario
 * The MIT License - http://opensource.org/licenses/MIT
 *
 * https://github.com/cambecc/earth
 */
(function() {
    "use strict";

    var MAX_TASK_TIME = 100;                  // amount of time before a task yields control (milliseconds)
    var MIN_SLEEP_TIME = 25;                  // amount of time a task waits before resuming (milliseconds)
    var NULL_WIND_VECTOR = [NaN, NaN, null];  // singleton for no wind in the form: [u, v, magnitude]
    var TRANSPARENT_BLACK = [0, 0, 0, 0];     // singleton 0 rgba
    var REMAINING = "▫▫▫▫▫▫▫▫▫▫▫▫▫▫▫▫▫▫▫▫▫▫";   // glyphs for remaining progress bar
    var COMPLETED = "▪▪▪▪▪▪▪▪▪▪▪▪▪▪▪▪▪▪▪▪▪▪";   // glyphs for completed progress bar

    var view = µ.view();
    var log = µ.log();

    /**
     * An object to display various types of messages to the user.
     */
    var report = function() {
        var s = d3.select("#status"), p = d3.select("#progress"), total = REMAINING.length;
        return {
            status: function(msg) {
                return s.classed("bad") ? s : s.text(msg);  // errors are sticky until reset
            },
            error: function(err) {
                var msg = err.status ? err.status + " " + err.message : err;
                switch (err.status) {
                    case -1: msg = "Server Down"; break;
                    case 404: msg = "No Data"; break;
                }
                log.error(err);
                return s.classed("bad", true).text(msg);
            },
            reset: function() {
                return s.classed("bad", false).text("");
            },
            progress: function(amount) {  // amount of progress to report in the range [0, 1]
                if (0 <= amount && amount < 1) {
                    var i = Math.ceil(amount * total);
                    var bar = COMPLETED.substr(0, i) + REMAINING.substr(0, total - i);
                    return p.classed("invisible", false).text(bar);
                }
                return p.classed("invisible", true).text("");  // progress complete
            }
        }
    }();

    function debouncedField() {

        var value = null;
        var _submit = _.debounce(doSubmit, 0);
        var handle = {
            value: function() { return value; },
            cancel: function() {},  // initially a nop.
            submit: function() {
                handle.cancel();  // immediately cancel any pending task
                _submit.apply(this, arguments);
            }
        };
        handle.cancel.requested = true;

        function doSubmit(callback) {
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
                return report.error(error);
//                report.error(error);
//                return cancel.requested ? null : handle.trigger("update", value = null);
            }
            var args = _.rest(arguments).concat(handle.cancel = cancel);
            when.all(args).then(run).done(accept, reject);
            handle.trigger("submit");
        }

        return _.extend(handle, Backbone.Events);
    }

    var configuration = µ.buildConfiguration(d3.set(globes.keys()));
    configuration.on("change", function event_logger() {
        log.debug("changed: " + JSON.stringify(configuration.changedAttributes()));
        report.reset();
    });

    var inputController = function buildInputController() {
        log.debug("building input controller");
        var globe;
        var dispatch = _.clone(Backbone.Events);
        var op = null;

        function newOp(startMouse, startScale) {
            return {
                type: "click",
                startMouse: startMouse,
                startScale: startScale,
                manipulator: globe.manipulator(startMouse, startScale)
            };
        }

        var zoom = d3.behavior.zoom()
            .on("zoomstart", function() {
                op = op || newOp(d3.mouse(this), zoom.scale());
            })
            .on("zoom", function() {
                var currentMouse = d3.mouse(this), currentScale = d3.event.scale;
                op = op || newOp(currentMouse, 1);  // Fix bug on some browsers where zoomstart fires out of order.
                if (op.type === "click" || op.type === "spurious") {
                    if (currentScale === op.startScale && µ.distance(currentMouse, op.startMouse) < 4) {
                        op.type = "spurious";
                        return;  // to reduce annoyance, ignore op if mouse has barely moved and no zoom is occurring
                    }
                    dispatch.trigger("moveStart");
                    op.type = "drag";
                }
                if (currentScale != op.startScale) {
                    op.type = "zoom";  // whenever a scale change is detected, (stickily) switch to a zoom operation
                }

                // when zooming, we ignore whatever the mouse is doing--really cleans up behavior on touch devices
                op.manipulator.move(op.type === "zoom" ? null : currentMouse, currentScale);
                dispatch.trigger("move");
            })
            .on("zoomend", function() {
                op.manipulator.end();
                if (op.type === "click") {
                    dispatch.trigger("click", op.startMouse, globe.projection.invert(op.startMouse));
                }
                else if (op.type !== "spurious") {
                    signalEnd();
                }
                op = null;
            });

        var signalEnd = _.debounce(function() {
            if (!op || op.type !== "drag" && op.type !== "zoom") {
                configuration.save({orientation: globe.orientation()}, {source: "moveEnd"});
                dispatch.trigger("moveEnd");
            }
        }, 1000);

        d3.select("#display").call(zoom);

        function locate() {
            if (navigator.geolocation) {
                report.status("Finding current position...");
                navigator.geolocation.getCurrentPosition(
                    function(position) {
                        report.status("");
                        var coord = [position.coords.longitude, position.coords.latitude];
                        var rotate = globe.locate(coord);
                        if (rotate) {
                            globe.projection.rotate(rotate);
                            configuration.save({orientation: globe.orientation()});  // triggers reorientation
                        }
                        dispatch.trigger("click", globe.projection(coord), coord);
                    },
                    log.error);
            }
        }

        d3.select("#show-location").on("click", locate);

        function reorient(source, value, options) {
            options = options || {};
            if (globe && options.source !== "moveEnd") {
                dispatch.trigger("moveStart");
                globe.orientation(configuration.get("orientation"), view);
                zoom.scale(globe.projection.scale());
                dispatch.trigger("moveEnd");
            }
        }

        dispatch.listenTo(configuration, "change:orientation", reorient);

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

    /**
     * @param resource the GeoJSON resource's URL
     * @param cancel
     * @returns {Object} a promise for GeoJSON topology features: {boundaryLo:, boundaryHi:}
     */
    function buildMesh(resource, cancel) {
        report.status("Downloading...");
        return µ.loadJson(resource).then(function(topo) {
            if (cancel.requested) return null;
            log.time("building meshes");
            var lo = topojson.feature(topo, µ.isMobile() ? topo.objects.coastline_tiny : topo.objects.coastline_110m);
            var hi = topojson.feature(topo, µ.isMobile() ? topo.objects.coastline_110m : topo.objects.coastline_50m);
            log.timeEnd("building meshes");
            return {
                boundaryLo: lo,
                boundaryHi: hi
            };
        });
    }

    /**
     * The page's current topology mesh. There can be only one.
     */
    var activeMesh = debouncedField();
    activeMesh.listenTo(configuration, "change:topology", function(context, attr) {
        activeMesh.submit(buildMesh, attr);
    });

    /**
     * @param {String} projectionName the desired projection's name.
     * @returns {Object} a promise for a globe object.
     */
    function buildGlobe(projectionName) {
        var builder = globes.get(projectionName);
        if (!builder) {
            return when.reject("Unknown projection: " + projectionName);
        }
        var globe = builder();
        globe.projection = globe.newProjection(view);  // augment globe with the shared projection instance we'll use.
        return when(globe);
    }

    /**
     * The page's current globe model. There can be only one.
     */
    var activeGlobe = debouncedField();
    activeGlobe.listenTo(configuration, "change:projection", function(source, attr) {
        activeGlobe.submit(buildGlobe, attr);
    });

    var nextId = 0;
    var downloadsInProgress = {};

    function buildGrid(layer, cancel) {
        report.status("Downloading...");
        var id = nextId++;
        var task = µ.loadJson(layer).then(function(data) {
            if (cancel.requested) return null;
            log.time("build grid");
            var result = layers.buildGrid(data);
            log.timeEnd("build grid");
            return result;
        }).ensure(function() { delete downloadsInProgress[id]; });

        downloadsInProgress[id] = task;
        return task;
    }

    /**
     * The page's current grid. There can be only one.
     */
    var activeGrid = debouncedField();
    activeGrid.listenTo(configuration, "change", function() {
        var layerAttributes = ["date", "hour", "param", "surface", "level"];
        if (_.intersection(_.keys(configuration.changedAttributes()), layerAttributes).length > 0) {
            activeGrid.submit(buildGrid, configuration.toPath());
        }
    });

    function buildRenderer(mesh, globe) {
        if (!mesh || !globe) return null;

        report.status("Rendering Globe...");
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
        d3.selectAll("path").attr("d", path);  // do an initial draw -- fixes issue with safari

        function doDraw() {
            d3.selectAll("path").attr("d", path);
            activeRenderer.trigger("redraw");
            doDraw_throttled = _.throttle(doDraw, 5, {leading: false});
        }
        var doDraw_throttled = _.throttle(doDraw, 5, {leading: false});

        // Attach to map rendering events on input controller.
        dispatch.listenTo(
            inputController, {
                moveStart: function() {
                    coastline.datum(mesh.boundaryLo);
                    activeRenderer.trigger("start");
                },
                move: function() {
                    doDraw_throttled();
                },
                moveEnd: function() {
                    coastline.datum(mesh.boundaryHi);
                    d3.selectAll("path").attr("d", path);
                    activeRenderer.trigger("render");
                },
                click: function(point, coord) {
                    // show the point on the map
                    if (coord && _.isFinite(coord[0]) && _.isFinite(coord[1])) {
                        var mark = d3.select(".location-mark");
                        if (!mark.node()) {
                            mark = d3.select("#foreground").append("path").attr("class", "location-mark");
                        }
                        mark.datum({type: "Point", coordinates: coord}).attr("d", path);
                    }
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
    var activeRenderer = debouncedField();
    activeRenderer.listenTo(activeMesh, "update", function(mesh) {
        activeRenderer.submit(buildRenderer, mesh, activeGlobe.value());
    });
    activeRenderer.listenTo(activeGlobe, "update", function(globe) {
        activeRenderer.submit(buildRenderer, activeMesh.value(), globe);
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

        var imageData = context.getImageData(0, 0, width, height);
        var data = imageData.data;  // layout: [r, g, b, a, r, g, b, a, ...]
        log.timeEnd("render mask");
        return {
            imageData: imageData,
            isVisible: function(x, y) {
                var i = (y * width + x) * 4;
                return data[i + 3] > 0;  // non-zero alpha means pixel is visible
            },
            set: function(x, y, rgba) {
                var i = (y * width + x) * 4;
                data[i    ] = rgba[0];
                data[i + 1] = rgba[1];
                data[i + 2] = rgba[2];
                data[i + 3] = rgba[3];
                return this;
            }
        };
    }

    function createField(columns, bounds, mask) {

        /**
         * @returns {Array} wind vector [u, v, magnitude] at the point (x, y), or [NaN, NaN, null] if wind
         *          is undefined at that point.
         */
        function field(x, y) {
            var column = columns[Math.round(x)];
            return column && column[Math.round(y)] || NULL_WIND_VECTOR;
        }

        // Frees the massive "columns" array for GC. Without this, the array is leaked (in Chrome) each time a new
        // field is interpolated because the field closure's context is leaked, for reasons that defy explanation.
        field.release = function() {
            columns = null;
        };

        field.randomize = function(o) {  // UNDONE: this method is terrible
            var x, y;
            var net = 0;
            do {
                x = Math.round(_.random(bounds.x, bounds.xMax));
                y = Math.round(_.random(bounds.y, bounds.yMax));
            } while (field(x, y)[2] === null && net++ < 30);
            o.x = x;
            o.y = y;
            return o;
        };

        field.overlay = mask.imageData;

        return field;
    }

    function distortionFor(globe) {

        var velocityScale = globe.bounds(view).height / 39000;  // particle speed as number of pixels per unit vector
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

    function interpolateField(globe, grid, cancel) {
        if (!globe || !grid) return null;

        var mask = createMask(globe);

        log.time("interpolating field");
        var d = when.defer();

        var projection = globe.projection;
        var bounds = globe.bounds(view);
        var distort = distortionFor(globe);

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
                    var color = TRANSPARENT_BLACK;
                    if (coord) {
                        var λ = coord[0], φ = coord[1];
                        if (isFinite(λ)) {
                            var wind = interpolate(λ, φ);
                            if (wind) {
                                column[y+1] = column[y] = distort(x, y, λ, φ, wind);
                                color = µ.asRainbowColorStyle(Math.min(wind[2], 25) / 25, Math.floor(255 * 0.4));
                            }
                        }
                    }
                    mask.set(x, y, color).set(x+1, y, color).set(x, y+1, color).set(x+1, y+1, color);
                }
            }
            columns[x+1] = columns[x] = column;
        }

        report.status("");

        (function batchInterpolate() {
            try {
                if (!cancel.requested) {
                    var start = Date.now();
                    while (x < bounds.xMax) {
                        interpolateColumn(x);
                        x += 2;
                        if ((Date.now() - start) > MAX_TASK_TIME) {
                            // Interpolation is taking too long. Schedule the next batch for later and yield.
                            report.progress((x - bounds.x) / (bounds.xMax - bounds.x));
                            setTimeout(batchInterpolate, MIN_SLEEP_TIME);
                            return;
                        }
                    }
                }
                d.resolve(createField(columns, bounds, mask));
            }
            catch (e) {
                d.reject(e);
            }
            report.progress(1);  // 100% complete
            log.timeEnd("interpolating field");
        })();

        return d.promise;
    }

    var activeField = debouncedField();
    activeField.listenTo(activeRenderer, "start", function() {
        activeField.cancel();
    });
    activeField.listenTo(activeRenderer, "redraw", function() {
        // forcefully cancel active field on every redraw because sometimes field interpolation sneaks through.
        activeField.cancel();
    });
    activeField.listenTo(activeRenderer, "render", function() {
        activeField.submit(interpolateField, activeGlobe.value(), activeGrid.value());
    });
    activeField.listenTo(activeGrid, "update", function(grid) {
        activeField.submit(interpolateField, activeGlobe.value(), grid);
    });

    function animate(globe, field, cancel) {
        if (!globe || !field) return null;

        var bounds = globe.bounds(view);
        var colorStyles = µ.colorStyles();
        var buckets = colorStyles.map(function() { return []; });
        var multiplier = µ.isMobile() ? 5.5 : 7;  // reduce particle count for mobile devices
        var particleCount = Math.round(bounds.width * multiplier);
        var maxParticleAge = 40;  // max number of frames a particle is drawn before regeneration
        var fadeFillStyle = µ.isFF() ? "rgba(0, 0, 0, 0.95)" : "rgba(0, 0, 0, 0.97)";  // FF Mac alpha behaves oddly

        log.debug("particle count: " + particleCount);
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
                if (m === null) {
                    particle.age = maxParticleAge;  // particle has escaped the grid, never to return...
                }
                else {
                    var xt = x + v[0];
                    var yt = y + v[1];
                    if (field(xt, yt)[2] !== null) {
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
            try {
                if (cancel.requested) {
                    field.release();
                    return;
                }
                evolve();
                draw();
                setTimeout(frame, 40);  // desired milliseconds per frame
            }
            catch (e) {
                report.error(e);
            }
        })();
    }

    var activeAnimation = debouncedField();
    activeAnimation.listenTo(activeRenderer, "start", function() {
        activeAnimation.cancel();
        µ.clearCanvas(d3.select("#animation").node());
    });
    activeAnimation.listenTo(activeGrid, "submit", function() {
        activeAnimation.cancel();
    });
    activeAnimation.listenTo(activeField, "submit", function() {
        activeAnimation.cancel();
    });
    activeAnimation.listenTo(activeField, "update", function(field) {
        activeAnimation.submit(animate, activeGlobe.value(), field);
    });

    function drawOverlay(field, flag) {
        if (!field) return null;
        µ.clearCanvas(d3.select("#overlay").node());
        if (flag !== "off") {
            d3.select("#overlay").node().getContext("2d").putImageData(field.overlay, 0, 0);
        }
    }

    var activeOverlay = debouncedField();
    activeOverlay.listenTo(activeField, "update", function(field) {
        activeOverlay.submit(drawOverlay, field, configuration.get("overlay"));
    });
    activeOverlay.listenTo(activeRenderer, "start", function() {
        activeOverlay.submit(drawOverlay, activeField.value(), "off");
    });
    activeOverlay.listenTo(configuration, "change:overlay", function(source, overlayFlag) {
        // if only the overlay flag has changed...
        if (_.keys(configuration.changedAttributes()).length === 1) {
            activeOverlay.submit(drawOverlay, activeField.value(), overlayFlag);
        }
    });

    function init() {
        report.status("Initializing...");
        d3.selectAll(".fill-screen").attr("width", view.width).attr("height", view.height);
        d3.select("#show-menu").on("click", function() {
            d3.select("#menu").classed("invisible", !d3.select("#menu").classed("invisible"));
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

        var THREE_HOURS = 3 * 60 * 60 * 1000;

        function activeDate(grid) {
            // When the active layer is considered "current", use its time as now, otherwise use current time as
            // now (but rounded down to the nearest three-hour block).
            var now = grid ? grid.date.getTime() : Math.floor(Date.now() / THREE_HOURS) * THREE_HOURS;
            var parts = configuration.get("date").split("/");  // yyyy/mm/dd or "current"
            var hhmm = configuration.get("hour");
            return parts.length > 1 ?
                Date.UTC(+parts[0], parts[1] - 1, +parts[2], +hhmm.substring(0, 2)) :
                parts[0] === "current" ? now : null;
        }

        function showDate(grid) {
            var date = new Date(activeDate(grid)), isLocal = d3.select("#data-date").classed("local");
            var formatted = isLocal ? µ.toLocalISO(date) : µ.toUTCISO(date);
            d3.select("#data-date").text(formatted + " " + (isLocal ? "Local" : "UTC"));
            d3.select("#toggle-zone").text("⇄ " + (isLocal ? "UTC" : "Local"));
        }

        function showGridDetails(grid) {
            showDate(grid);
            var recipe = layers.recipeFor(configuration.pick("param", "surface", "level"));
            d3.select("#data-layer").text(recipe.description);
        }

        activeGrid.on("submit", function() {
            showGridDetails(null);
        });
        activeGrid.on("update", function(grid) {
            showGridDetails(grid);
        });
        d3.select("#toggle-zone").on("click", function() {
            d3.select("#data-date").classed("local", !d3.select("#data-date").classed("local"));
            showDate(activeGrid.cancel.requested ? null : activeGrid.value());
        });

        // Add event handlers for showing and removing location details.
        inputController.on("click", function(point, coord) {
            var grid = activeGrid.value();
            if (!grid) return;
            var λ = coord[0], φ = coord[1], wind = grid.interpolate(λ, φ);
            if (µ.isValue(wind)) {
                d3.select("#location-coord").text(µ.formatCoordinates(λ, φ));
                d3.select("#location-value").text(µ.formatVector(wind[0], wind[1]));
                d3.select("#location-close").classed("invisible", false);
            }
        });

        function clearDetails() {
            d3.select("#location-coord").text("");
            d3.select("#location-value").text("");
            d3.select("#location-close").classed("invisible", true);
            d3.select(".location-mark").remove();
        }

        d3.select("#location-close").on("click", clearDetails);
        activeGrid.on("update", clearDetails);
        activeRenderer.on("update", clearDetails);

        // Add event handlers for the time navigation buttons.
        function navToHours(offset) {
            if (_.size(downloadsInProgress) > 0) {
                log.debug("Download in progress--ignoring nav request.");
                return;
            }

            var timestamp = activeDate(activeGrid.value());
            if (isFinite(timestamp)) {
                timestamp += offset * (60 * 60 * 1000);
                var parts = new Date(timestamp).toISOString().split(/[- T:]/);
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

        function navToProjection(projection) {
            configuration.save({projection: projection, orientation: ""});
        }
        globes.keys().forEach(function(key) {
            d3.select("#" + key).on("click", navToProjection.bind(null, key));
        });

        d3.select(window).on("orientationchange", function() {
            // Rebuild globe using the new orientation and view size.
            view = µ.view();
            activeGlobe.submit(buildGlobe, configuration.get("projection"));
        });

        configuration.fetch();  // everything is now set up, so kick off the events
    }

    when(true).then(init).otherwise(report.error);

})();
