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

    var SCALE_EXTENT = [25, 3000];
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
    var hashController = µ.buildHashController(d3.set(globes.builders.keys()));

    /**
     * @param resource the GeoJSON resource's URL
     * @returns {Object} a promise for GeoJSON topology features: {boundingBox:, boundaryLo:, boundaryHi:}
     */
    function buildMesh(resource) {
        return µ.loadJson(resource).then(function(topo) {
            report.progress("building meshes...");
            log.time("building meshes");
            var bbox = topo.bbox;
            var boundaryLo = topojson.feature(topo, topo.objects.coastline_110m);  // UNDONE: mesh vs. feature?
            var boundaryHi = topojson.feature(topo, topo.objects.coastline_50m);
            log.timeEnd("building meshes");
            return {
                boundingBox: bbox ? [[bbox[0], bbox[1]], [bbox[2], bbox[3]]] : null,
                boundaryLo: boundaryLo,
                boundaryHi: boundaryHi
            };
        });
    }

    /**
     * The page's current topology mesh. There can be only one.
     */
    var meshTask;
    hashController.on("change:topology", function() {
        meshTask = buildMesh(hashController.get("topology"));
    });

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

    /**
     * The page's current globe model. There can be only one.
     */
    var globeTask;
    hashController.on("change:projection", function() {
        globeTask = buildGlobe(hashController.get("projection"), hashController.get("orientation"));
    });

    function createMapController() {
        var projection;
        var dispatch = d3.dispatch("start", "redraw", "end", "click");
        var moveCount = 0, isClick = false;
        var startMouse, startScale, sensitivity, rot;

        var zoom = d3.behavior.zoom()
            .scaleExtent(SCALE_EXTENT)
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

    function buildGlobeController() {
        return when.all([globeControllerTask, meshTask, globeTask]).then(µ.apply(function(previous, mesh, globe) {

            report.progress("Building globe...");
            log.time("rendering map");

            // First clear map and foreground svg contents, and old hash change event handlers.
            µ.removeChildren(d3.select("#map").node());
            µ.removeChildren(d3.select("#foreground").node());
            if (previous) {
                hashController.off(null, previous.handler);
            }

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
                    hashController.save({orientation: globe.orientation()});
                });
                // .on("click", show);
            d3.select("#foreground").call(mapController.zoom);

            function reorient() {
                log.debug("orientation change...");
                globe.orientation(hashController.get("orientation"));
                d3.select("#display").selectAll("path").attr("d", path);
            }

            hashController.on("change:orientation", reorient);

            // Finally, inject mesh data into the elements to draw the map.
            var coastline = d3.select(".coastline").datum(mesh.boundaryHi);
            d3.select("#display").selectAll("path").attr("d", path);

            log.timeEnd("rendering map");

            return {handler: reorient};
        })).then(null, report.error);  // UNDONE: where is the correct place to put error catch?
    }

    /**
     * The page's current globe controller. There can be only one.
     */
    var globeControllerTask;
    hashController.on("change:topology change:projection", function() {
        setTimeout(function() {
            globeControllerTask = buildGlobeController();
        }, 500);
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

        // Bind hash controller to URL bar changes.
        d3.select(window).on("hashchange", function() {
            log.debug("hashchange");
            hashController.fetch({trigger: "hashchange"});
        });
    }());

    meshTask = buildMesh(hashController.get("topology"));
    hashController.fetch();  // everything is now set up, so kick off the events

})();
