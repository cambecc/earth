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

    var SECOND = 1000;
    var MINUTE = 60 * SECOND;
    var HOUR = 60 * MINUTE;
    var MAX_TASK_TIME = 100;                  // amount of time before a task yields control (millis)
    var MIN_SLEEP_TIME = 25;                  // amount of time a task waits before resuming (millis)
    var MIN_MOVE = 4;                         // slack before a drag operation beings (pixels)
    var MOVE_END_WAIT = 1000;                 // time to wait for a move operation to be considered done (millis)

    var VELOCITY_SCALE = 1/60000;             // scale for wind velocity (completely arbitrary--this value looks nice)
    var OVERLAY_ALPHA = Math.floor(0.4*255);  // overlay transparency (on scale [0, 255])
    var INTENSITY_SCALE_STEP = 10;            // step size of particle intensity color scale
    var MAX_WIND_INTENSITY = 17;              // wind velocity at which particle intensity is maximum (m/s)
    var MAX_PARTICLE_AGE = 100;               // max number of frames a particle is drawn before regeneration
    var PARTICLE_LINE_WIDTH = 1.0;            // line width of a drawn particle
    var PARTICLE_MULTIPLIER = 7;              // particle count scalar (completely arbitrary--this values looks nice)
    var PARTICLE_REDUCTION = 0.75;            // reduce particle count to this much of normal for mobile devices
    var FRAME_RATE = 40;                      // desired milliseconds per frame

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
        };
    }();

    function newAgent() {
        return µ.newAgent().on("reject", report.error);
    }

    // Construct the page's main internal components:

    var configuration = µ.buildConfiguration(globes);  // holds the page's current configuration settings
    var inputController = buildInputController();      // interprets drag/zoom operations
    var meshAgent = newAgent();      // map data for the earth
    var globeAgent = newAgent();     // the model of the globe
    var gridAgent = newAgent();      // the grid of weather data
    var rendererAgent = newAgent();  // the globe SVG renderer
    var fieldAgent = newAgent();     // the interpolated wind vector field
    var animatorAgent = newAgent();  // the wind animator
    var overlayAgent = newAgent();   // color overlay over the animation

    /**
     * The input controller is an object that translates move operations (drag and/or zoom) into mutations of the
     * current globe's projection, and emits events so other page components can react to these move operations.
     *
     * D3's built-in Zoom behavior is used to bind to the document's drag/zoom events, and the input controller
     * interprets D3's events as move operations on the globe. This method is complicated due to the complex
     * event behavior that occurs during drag and zoom.
     *
     * D3 move operations usually occur as "zoomstart" -> ("zoom")* -> "zoomend" event chain. During "zoom" events
     * the scale and mouse may change, implying a zoom or drag operation accordingly. These operations are quite
     * noisy. What should otherwise be one smooth continuous zoom is usually comprised of several "zoomstart" ->
     * "zoom" -> "zoomend" event chains. A debouncer is used to eliminate the noise by waiting a short period of
     * time to ensure the user has finished the move operation.
     *
     * The "zoom" events may not occur; a simple click operation occurs as: "zoomstart" -> "zoomend". There is
     * additional logic for other corner cases, such as spurious drags which move the globe just a few pixels
     * (most likely unintentional), and the tendency for some touch devices to issue events out of order:
     * "zoom" -> "zoomstart" -> "zoomend".
     *
     * This object emits clean "moveStart" -> ("move")* -> "moveEnd" events for move operations, and "click" events
     * for normal clicks. Spurious moves emit no events.
     */
    function buildInputController() {
        var globe, op = null;

        /**
         * @returns {Object} an object to represent the state for one move operation.
         */
        function newOp(startMouse, startScale) {
            return {
                type: "click",  // initially assumed to be a click operation
                startMouse: startMouse,
                startScale: startScale,
                manipulator: globe.manipulator(startMouse, startScale)
            };
        }

        var zoom = d3.behavior.zoom()
            .on("zoomstart", function() {
                op = op || newOp(d3.mouse(this), zoom.scale());  // a new operation begins
            })
            .on("zoom", function() {
                var currentMouse = d3.mouse(this), currentScale = d3.event.scale;
                op = op || newOp(currentMouse, 1);  // Fix bug on some browsers where zoomstart fires out of order.
                if (op.type === "click" || op.type === "spurious") {
                    if (currentScale === op.startScale && µ.distance(currentMouse, op.startMouse) < MIN_MOVE) {
                        // to reduce annoyance, ignore op if mouse has barely moved and no zoom is occurring
                        op.type = "spurious";
                        return;
                    }
                    dispatch.trigger("moveStart");
                    op.type = "drag";
                }
                if (currentScale != op.startScale) {
                    op.type = "zoom";  // whenever a scale change is detected, (stickily) switch to a zoom operation
                }

                // when zooming, ignore whatever the mouse is doing--really cleans up behavior on touch devices
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
                op = null;  // the drag/zoom/click operation is over
            });

        var signalEnd = _.debounce(function() {
            if (!op || op.type !== "drag" && op.type !== "zoom") {
                configuration.save({orientation: globe.orientation()}, {source: "moveEnd"});
                dispatch.trigger("moveEnd");
            }
        }, MOVE_END_WAIT);  // wait for a bit to decide if user has stopped moving the globe

        d3.select("#display").call(zoom);
        d3.select("#show-location").on("click", function() {
            if (navigator.geolocation) {
                report.status("Finding current position...");
                navigator.geolocation.getCurrentPosition(function(pos) {
                        report.status("");
                        var coord = [pos.coords.longitude, pos.coords.latitude], rotate = globe.locate(coord);
                        if (rotate) {
                            globe.projection.rotate(rotate);
                            configuration.save({orientation: globe.orientation()});  // triggers reorientation
                        }
                        dispatch.trigger("click", globe.projection(coord), coord);
                }, log.error);
            }
        });

        function reorient() {
            var options = arguments[3] || {};
            if (!globe || options.source === "moveEnd") {
                // reorientation occurred because the user just finished a move operation, so globe is already
                // oriented correctly.
                return;
            }
            dispatch.trigger("moveStart");
            globe.orientation(configuration.get("orientation"), view);
            zoom.scale(globe.projection.scale());
            dispatch.trigger("moveEnd");
        }

        var dispatch = _.extend({
            globe: function(_) {
                if (_) {
                    globe = _;
                    zoom.scaleExtent(globe.scaleExtent());
                    reorient();
                }
                return _ ? this : globe;
            }
        }, Backbone.Events);
        return dispatch.listenTo(configuration, "change:orientation", reorient);
    }

    /**
     * @param resource the GeoJSON resource's URL
     * @returns {Object} a promise for GeoJSON topology features: {boundaryLo:, boundaryHi:}
     */
    function buildMesh(resource) {
        var cancel = this.cancel;
        report.status("Downloading...");
        return µ.loadJson(resource).then(function(topo) {
            if (cancel.requested) return null;
            log.time("building meshes");
            var o = topo.objects;
            var coastLo = topojson.feature(topo, µ.isMobile() ? o.coastline_tiny : o.coastline_110m);
            var coastHi = topojson.feature(topo, µ.isMobile() ? o.coastline_110m : o.coastline_50m);
            var lakesLo = topojson.feature(topo, µ.isMobile() ? o.lakes_tiny : o.lakes_110m);
            var lakesHi = topojson.feature(topo, µ.isMobile() ? o.lakes_110m : o.lakes_50m);
            log.timeEnd("building meshes");
            return {
                coastLo: coastLo,
                coastHi: coastHi,
                lakesLo: lakesLo,
                lakesHi: lakesHi
            };
        });
    }

    /**
     * @param {String} projectionName the desired projection's name.
     * @returns {Object} a promise for a globe object.
     */
    function buildGlobe(projectionName) {
        var builder = globes.get(projectionName);
        if (!builder) {
            return when.reject("Unknown projection: " + projectionName);
        }
        return when(builder(view));
    }

    // Some hacky stuff to ensure only one layer can be downloaded at a time.
    var nextId = 0;
    var downloadsInProgress = {};

    function buildGrid(layer) {
        report.status("Downloading...");
        var cancel = this.cancel, id = nextId++;
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

    function navToHours(offset) {
        if (_.size(downloadsInProgress) > 0) {
            log.debug("Download in progress--ignoring nav request.");
            return;
        }

        var timestamp = activeDate(gridAgent.value());
        if (isFinite(timestamp)) {
            timestamp += offset * HOUR;
            var parts = new Date(timestamp).toISOString().split(/[- T:]/);
            configuration.save({
                date: [parts[0], parts[1], parts[2]].join("/"),
                hour: [parts[3], "00"].join("")});
        }
    }

    function buildRenderer(mesh, globe) {
        if (!mesh || !globe) return null;

        report.status("Rendering Globe...");
        log.time("rendering map");

        // UNDONE: better way to do the following?
        var dispatch = _.clone(Backbone.Events);
        if (rendererAgent._previous) {
            rendererAgent._previous.stopListening();
        }
        rendererAgent._previous = dispatch;

        // First clear map and foreground svg contents.
        µ.removeChildren(d3.select("#map").node());
        µ.removeChildren(d3.select("#foreground").node());
        // Create new map svg elements.
        globe.defineMap(d3.select("#map"), d3.select("#foreground"));

        var path = d3.geo.path().projection(globe.projection).pointRadius(7);
        var coastline = d3.select(".coastline");
        var lakes = d3.select(".lakes");
        d3.selectAll("path").attr("d", path);  // do an initial draw -- fixes issue with safari

        // Throttled draw method helps with slow devices that would get overwhelmed by too many redraw events.
        var REDRAW_WAIT = 5;  // milliseconds
        var doDraw_throttled = _.throttle(doDraw, REDRAW_WAIT, {leading: false});

        function doDraw() {
            d3.selectAll("path").attr("d", path);
            rendererAgent.trigger("redraw");
            doDraw_throttled = _.throttle(doDraw, REDRAW_WAIT, {leading: false});
        }

        // Attach to map rendering events on input controller.
        dispatch.listenTo(
            inputController, {
                moveStart: function() {
                    coastline.datum(mesh.coastLo);
                    lakes.datum(mesh.lakesLo);
                    rendererAgent.trigger("start");
                },
                move: function() {
                    doDraw_throttled();
                },
                moveEnd: function() {
                    coastline.datum(mesh.coastHi);
                    lakes.datum(mesh.lakesHi);
                    d3.selectAll("path").attr("d", path);
                    rendererAgent.trigger("render");
                },
                click: function(point, coord) {
                    // show the point on the map if defined
                    if (fieldAgent.value() && fieldAgent.value()(point[0], point[1])[2] === null) {
                        return;  // no wind vector at this point, so ignore.
                    }
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

    function createMask(globe) {
        if (!globe) return null;

        log.time("render mask");

        // Create a detached canvas, ask the model to define the mask polygon, then fill with an opaque color.
        var width = view.width, height = view.height;
        var canvas = d3.select(document.createElement("canvas")).attr("width", width).attr("height", height).node();
        var context = globe.defineMask(canvas.getContext("2d"));
        context.fillStyle = "rgba(255, 0, 0, 1)";
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
            var safetyNet = 0;
            do {
                x = Math.round(_.random(bounds.x, bounds.xMax));
                y = Math.round(_.random(bounds.y, bounds.yMax));
            } while (field(x, y)[2] === null && safetyNet++ < 30);
            o.x = x;
            o.y = y;
            return o;
        };

        field.overlay = mask.imageData;

        return field;
    }

    /**
     * Calculate distortion of the wind vector caused by the shape of the projection at point (x, y). The wind
     * vector is modified in place and returned by this function.
     */
    function distort(projection, λ, φ, x, y, scale, wind) {
        var u = wind[0] * scale;
        var v = wind[1] * scale;
        var d = µ.distortion(projection, λ, φ, x, y);

        // Scale distortion vectors by u and v, then add.
        wind[0] = d[0] * u + d[2] * v;
        wind[1] = d[1] * u + d[3] * v;
        return wind;
    }

    function proportion(i, bounds) {
        return (µ.clamp(i, bounds) - bounds[0]) / (bounds[1] - bounds[0]);
    }

    function interpolateField(globe, grid) {
        if (!globe || !grid) return null;

        var mask = createMask(globe);

        log.time("interpolating field");
        var d = when.defer(), cancel = this.cancel;

        var projection = globe.projection;
        var bounds = globe.bounds(view);
        var velocityScale = bounds.height * VELOCITY_SCALE;

        var columns = [];
        var point = [];
        var x = bounds.x;
        var interpolate = grid.interpolate;
        var scale = grid.recipe.scale, gradient = scale.gradient;
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
                                wind = distort(projection, λ, φ, x, y, velocityScale, wind);
                                column[y+1] = column[y] = wind;
                                color = gradient(proportion(wind[2], scale.bounds), OVERLAY_ALPHA);
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

    function animate(globe, field) {
        if (!globe || !field) return;

        var cancel = this.cancel;
        var bounds = globe.bounds(view);
        var colorStyles = µ.windIntensityColorScale(INTENSITY_SCALE_STEP, MAX_WIND_INTENSITY);
        var buckets = colorStyles.map(function() { return []; });
        var particleCount = Math.round(bounds.width * PARTICLE_MULTIPLIER);
        if (µ.isMobile()) {
            particleCount *= PARTICLE_REDUCTION;
        }
        var fadeFillStyle = µ.isFF() ? "rgba(0, 0, 0, 0.95)" : "rgba(0, 0, 0, 0.97)";  // FF Mac alpha behaves oddly

        log.debug("particle count: " + particleCount);
        var particles = [];
        for (var i = 0; i < particleCount; i++) {
            particles.push(field.randomize({age: _.random(0, MAX_PARTICLE_AGE)}));
        }

        function evolve() {
            buckets.forEach(function(bucket) { bucket.length = 0; });
            particles.forEach(function(particle) {
                if (particle.age > MAX_PARTICLE_AGE) {
                    field.randomize(particle).age = 0;
                }
                var x = particle.x;
                var y = particle.y;
                var v = field(x, y);  // vector at current position
                var m = v[2];
                if (m === null) {
                    particle.age = MAX_PARTICLE_AGE;  // particle has escaped the grid, never to return...
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
        g.lineWidth = PARTICLE_LINE_WIDTH;
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
                setTimeout(frame, FRAME_RATE);
            }
            catch (e) {
                report.error(e);
            }
        })();
    }

    function drawOverlay(field, flag) {
        if (!field) return;

        µ.clearCanvas(d3.select("#overlay").node());
        µ.clearCanvas(d3.select("#scale").node());
        if (flag !== "off") {
            d3.select("#overlay").node().getContext("2d").putImageData(field.overlay, 0, 0);
        }

        var grid = gridAgent.value();
        if (grid) {
            // Draw color scale for reference.
            var scale = d3.select("#scale");
            var c = scale.node(), g = c.getContext("2d"), n = c.width - 1;
            for (var i = 0; i <= n; i++) {
                var rgb = grid.recipe.scale.gradient(i / n, 1);
                g.fillStyle = "rgb(" + rgb[0] + "," + rgb[1] + "," + rgb[2] + ")";
                g.fillRect(i, 0, 1, c.height);
            }

            // Show tooltip on hover.
            scale.on("mousemove", function() {
                var bounds = grid.recipe.scale.bounds, x = d3.mouse(this)[0];
                var pct = µ.clamp((Math.round(x) - 2) / (n - 2), [0, 1]);
                var value = (bounds[1] - bounds[0]) * pct + bounds[0];
                scale.attr("title", µ.formatScalar(value, createUnitToggle().value()));
            });
        }
    }

    function activeDate(grid) {
        // When the active layer is considered "current", use its time as now, otherwise use current time as
        // now (but rounded down to the nearest three-hour block).
        var THREE_HOURS = 3 * HOUR;
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
        d3.select("#data-layer").text(grid ? grid.recipe.description : "");
    }

    function createUnitToggle() {
        var langUnits = {
            "ja": ["m/s", "kn"],
            "en": ["km/h", "kn"]
        };
        var units = langUnits[d3.select("body").attr("data-lang") || "en"];
        var flag = d3.select("#toggle-units").classed("on");
        return {
            value: function() { return units[+flag]; },
            other: function() { return units[+!flag]; },
            next: function() { d3.select("#toggle-units").classed("on", flag = !flag); }
        };
    }

    function showLocationValue(wind) {
        var unitToggle = createUnitToggle();
        d3.select("#location-value").text(µ.formatVector(wind, unitToggle.value()));
        d3.select("#toggle-units").classed("invisible", false).text("⇄ " + (unitToggle.other()));
        d3.select("#toggle-units").on("click", function() {
            unitToggle.next();
            showLocationValue(wind);
        });
    }

    function showLocationDetails(point, coord) {
        var grid = gridAgent.value(), field = fieldAgent.value();
        if (!grid || !field) return;
        var λ = coord[0], φ = coord[1], wind = grid.interpolate(λ, φ);
        if (µ.isValue(wind) && field(point[0], point[1])[2] !== null) {
            d3.select("#location-coord").text(µ.formatCoordinates(λ, φ));
            d3.select("#location-close").classed("invisible", false);
            showLocationValue(wind);
        }
    }

    function clearLocationDetails() {
        d3.select("#location-coord").text("");
        d3.select("#location-close").classed("invisible", true);
        d3.select("#location-value").text("");
        d3.select("#toggle-units").classed("invisible", true);
        d3.select(".location-mark").remove();
    }

    function stopCurrentAnimation() {
        animatorAgent.cancel();
    }

    /**
     * Registers all event handlers to bind components and page elements together. There must be a cleaner
     * way to accomplish this...
     */
    function init() {
        report.status("Initializing...");

        d3.selectAll(".fill-screen").attr("width", view.width).attr("height", view.height);
        // Adjust size of the scale canvas to fill the width of the menu to the right of the label.
        var label = d3.select("#scale-label").node();
        d3.select("#scale")
            .attr("width", (d3.select("#menu").node().offsetWidth - label.offsetWidth) * 0.95)
            .attr("height", label.offsetHeight / 2);

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

        configuration.on("change", report.reset);

        meshAgent.listenTo(configuration, "change:topology", function(context, attr) {
            meshAgent.submit(buildMesh, attr);
        });

        globeAgent.listenTo(configuration, "change:projection", function(source, attr) {
            globeAgent.submit(buildGlobe, attr);
        });

        gridAgent.listenTo(configuration, "change", function() {
            // Build a new grid if any layer-related attributes have changed.
            var changed = _.keys(configuration.changedAttributes());
            if (_.intersection(changed, ["date", "hour", "param", "surface", "level"]).length > 0) {
                gridAgent.submit(buildGrid, configuration.toPath());
            }
        });
        gridAgent.on("submit", function() {
            showGridDetails(null);
        });
        gridAgent.on("update", function(grid) {
            showGridDetails(grid);
        });
        d3.select("#toggle-zone").on("click", function() {
            d3.select("#data-date").classed("local", !d3.select("#data-date").classed("local"));
            showDate(gridAgent.cancel.requested ? null : gridAgent.value());
        });

        function startRendering() {
            rendererAgent.submit(buildRenderer, meshAgent.value(), globeAgent.value());
        }
        rendererAgent.listenTo(meshAgent, "update", startRendering);
        rendererAgent.listenTo(globeAgent, "update", startRendering);

        function startInterpolation() {
            fieldAgent.submit(interpolateField, globeAgent.value(), gridAgent.value());
        }
        function cancelInterpolation() {
            fieldAgent.cancel();
        }
        fieldAgent.listenTo(gridAgent, "update", startInterpolation);
        fieldAgent.listenTo(rendererAgent, "render", startInterpolation);
        fieldAgent.listenTo(rendererAgent, "start", cancelInterpolation);
        fieldAgent.listenTo(rendererAgent, "redraw", cancelInterpolation);

        animatorAgent.listenTo(fieldAgent, "update", function(field) {
            animatorAgent.submit(animate, globeAgent.value(), field);
        });
        animatorAgent.listenTo(rendererAgent, "start", function() {
            stopCurrentAnimation();
            µ.clearCanvas(d3.select("#animation").node());
        });
        animatorAgent.listenTo(gridAgent, "submit", stopCurrentAnimation);
        animatorAgent.listenTo(fieldAgent, "submit", stopCurrentAnimation);

        overlayAgent.listenTo(fieldAgent, "update", function() {
            overlayAgent.submit(drawOverlay, fieldAgent.value(), configuration.get("overlay"));
        });
        overlayAgent.listenTo(rendererAgent, "start", function() {
            overlayAgent.submit(drawOverlay, fieldAgent.value(), "off");
        });
        overlayAgent.listenTo(configuration, "change:overlay", function(source, overlayFlag) {
            // if only the overlay flag has changed...
            if (_.keys(configuration.changedAttributes()).length === 1) {
                overlayAgent.submit(drawOverlay, fieldAgent.value(), overlayFlag);
            }
        });

        // Add event handlers for showing and removing location details.
        inputController.on("click", showLocationDetails);
        gridAgent.on("update", clearLocationDetails);
        rendererAgent.on("update", clearLocationDetails);
        d3.select("#location-close").on("click", clearLocationDetails);

        // Add event handlers for the time navigation buttons.
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

        // Add handlers for all projection buttons.
        function navToProjection(projection) {
            configuration.save({projection: projection, orientation: ""});
        }
        globes.keys().forEach(function(key) {
            d3.select("#" + key).on("click", navToProjection.bind(null, key));
        });

        // When touch device changes between portrait and landscape, rebuild globe using the new view size.
        d3.select(window).on("orientationchange", function() {
            view = µ.view();
            globeAgent.submit(buildGlobe, configuration.get("projection"));
        });
    }

    function start() {
        // Everything is now set up, so load configuration from the hash fragment and kick off change events.
        configuration.fetch();
    }

    when(true).then(init).then(start).otherwise(report.error);

})();
