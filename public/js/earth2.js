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
    var configuration = µ.buildConfiguration(d3.set(globes.builders.keys()));
    configuration.on("change", function event_logger() {
        log.debug("changed: " + JSON.stringify(configuration.changedAttributes()));
    });

    var Node = Backbone.Model.extend({
        defaults: {
            promise: when.reject("node has no value yet")
        }
    });

    /**
     * @param resource the GeoJSON resource's URL
     * @returns {Object} a promise for GeoJSON topology features: {boundaryLo:, boundaryHi:}
     */
    function buildMesh(resource) {
        return µ.loadJson(resource).then(function(topo) {
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
     * @param {String} projectionName the desired projection's name.
     * @param {String} orientation the projection's initial orientation
     * @returns {Object} a promise for a globe object.
     */
    function buildGlobe(projectionName, orientation) {
        var builder = globes.builders.get(projectionName);
        return builder ?
            when(builder().orientation(orientation)) :
            when.reject("Unknown projection: " + projectionName);
    }

    function createMapController() {
        var projection, originalPrecision;
        var dispatch = d3.dispatch("start", "redraw", "end", "click");
        var moveCount = 0, isClick = false;
        var startMouse, startScale, sensitivity, rot;

        var zoom = d3.behavior.zoom()
            .scaleExtent(globes.SCALE_EXTENT)
            .on("zoomstart", function() {
                startMouse = d3.mouse(this);
                startScale = zoom.scale();
                sensitivity = 60 / startScale;  // seems to provide a good drag scaling factor
                // log.debug(projection.rotate());
                // log.debug(startScale);
                rot = [projection.rotate()[0] / sensitivity, -projection.rotate()[1] / sensitivity];
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
                    originalPrecision = projection.precision();
                    projection.precision(1);
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
                    if (coord && _.isFinite(coord[0]) && _.isFinite(coord[1])) {
                        dispatch.click(startMouse, coord);
                    }
                }
                else {
                    var expected = moveCount;
                    setTimeout(function() {
                        if (moveCount === expected) {
                            moveCount = 0;
                            projection.precision(originalPrecision);
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

    function buildGlobeController() {
        return when.all([meshNode.get("promise"), globeNode.get("promise")]).then(µ.apply(function(mesh, globe) {

            report.progress("Building globe...");
            log.time("rendering map");

            // First clear map and foreground svg contents, and old hash change event handlers.
            µ.removeChildren(d3.select("#map").node());
            µ.removeChildren(d3.select("#foreground").node());
            if (globeControllerNode._previous) {
                log.debug("doing off");
                configuration.off(null, globeControllerNode._previous.handler);
            }
            globeControllerNode._previous = {handler: reorient};  // UNDONE: terrible

            // Define the map elements.
            globe.defineMap(d3.select("#map"), d3.select("#foreground"));

            // Bind the input controller to the map.
            var path = d3.geo.path().projection(globe.projection);
            var mapController = createMapController()
                .projection(globe.projection)
                .on("start", function() {
                    coastline.datum(mesh.boundaryLo);
                })
                .on("redraw", function() {
                    d3.select("#display").selectAll("path").attr("d", path);
                })
                .on("end", function() {
                    coastline.datum(mesh.boundaryHi).attr("d", path);
                    configuration.save({orientation: globe.orientation()});
                });
                // .on("click", show);
            d3.select("#foreground").call(mapController.zoom);

            function reorient() {
                log.debug("orientation change...");
                globe.orientation(configuration.get("orientation"));
                d3.select("#display").selectAll("path").attr("d", path);
            }

            configuration.on("change:orientation", reorient);

            // Finally, inject mesh data into the elements to draw the map.
            var coastline = d3.select(".coastline").datum(mesh.boundaryHi);
            d3.select("#display").selectAll("path").attr("d", path);

            log.timeEnd("rendering map");

        })).then(null, report.error);  // UNDONE: where is the correct place to put error catch?
    }

    /**
     * The page's current topology mesh. There can be only one.
     */
    var meshNode = new Node();
    meshNode.listenTo(configuration, "change:topology", function() {
        meshNode.set({promise: buildMesh(configuration.get("topology"))});
    });

    /**
     * The page's current globe model. There can be only one.
     */
    var globeNode = new Node();
    globeNode.listenTo(configuration, "change:projection", function() {
        globeNode.set({promise: buildGlobe(configuration.get("projection"), configuration.get("orientation"))});
    });

    /**
     * The page's current globe controller. There can be only one.
     */
    var globeControllerNode = new Node();
    var eventJoin = _.debounce(function() {
        log.debug("HEY!");
        globeControllerNode.set({promise: buildGlobeController()});
    }, 0);

    globeControllerNode.listenTo(meshNode, "change:promise", eventJoin);
    globeControllerNode.listenTo(globeNode, "change:promise", eventJoin);

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

        // Bind hash controller to URL bar changes.
        d3.select(window).on("hashchange", function() {
            log.debug("hashchange");
            configuration.fetch({trigger: "hashchange"});
        });
    }());

    configuration.fetch();  // everything is now set up, so kick off the events

})();
