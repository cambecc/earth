
var globes = function() {
    "use strict";

    var view = µ.view();
    var VIEW_CENTER = [view.width / 2, view.height / 2];

    function sphereBounds() {
        return µ.clampedBounds(
            d3.geo.path().projection(this.projection).bounds({type: "Sphere"}),
            view);
    }

    function standardScaleExtent() {
        return [25, 3000];
    }

    function sphereMask(context) {
        d3.geo.path().projection(this.projection).context(context)({type: "Sphere"});
        return context;
    }

    function standardOrientation(o) {
        var projection = this.projection;
        if (µ.isValue(o)) {
            // UNDONE: when empty string, use default rotation
            var parts = o.split(",");
            var λ = +parts[0], φ = +parts[1], scale = +parts[2];
            if (_.isFinite(λ) && µ.within(φ, [-90, +90])) {
                projection.rotate([-λ, -φ]);
            }
            else {
                projection.rotate([0, 0]);
            }
            // UNDONE: when empty string, use default scale
            if (µ.within(scale, this.scaleExtent())) {
                projection.scale(scale);
            }
            else {
                projection.scale(100);
            }
            return this;
        }
        var rotate = projection.rotate();
        return [-(rotate[0].toFixed(2)), -(rotate[1].toFixed(2)), Math.round(projection.scale())].join(",");
    }

    function standardMapElements(mapSvg, foregroundSvg) {
        var path = d3.geo.path().projection(this.projection);
        var defs = mapSvg.append("defs");
        defs.append("path")
            .attr("id", "sphere")
            .datum({type: "Sphere"})
            .attr("d", path);
        mapSvg.append("use")
            .attr("xlink:href", "#sphere")
            .attr("class", "sphere-fill");
        mapSvg.append("path")
            .attr("class", "graticule")
            .datum(d3.geo.graticule())
            .attr("d", path);
        mapSvg.append("path")
            .attr("class", "coastline");
        foregroundSvg.append("use")
            .attr("xlink:href", "#sphere")
            .attr("class", "sphere-stroke");
    }

    function standardManipulator(startMouse, startScale) {
        var projection = this.projection;
        var sensitivity = 60 / startScale;  // seems to provide a good drag scaling factor
        var rotation = [projection.rotate()[0] / sensitivity, -projection.rotate()[1] / sensitivity];
        return {
            move: function(mouse, scale) {
                var xd = mouse[0] - startMouse[0] + rotation[0];
                var yd = mouse[1] - startMouse[1] + rotation[1];
                projection.rotate([xd * sensitivity, -yd * sensitivity, projection.rotate()[2]]);
                projection.scale(scale);
            }
        };
    }

    function standardBuilder(methods) {
        return {
            projection:  methods.projection,
            bounds:      methods.bounds      || sphereBounds,
            scaleExtent: methods.scaleExtent || standardScaleExtent,
            orientation: methods.orientation || standardOrientation,
            manipulator: methods.manipulator || standardManipulator,
            defineMask:  methods.defineMask  || sphereMask,
            defineMap:   methods.defineMap   || standardMapElements
        };
    }

    function orthographic() {
        return standardBuilder({
            projection: d3.geo.orthographic()
                .translate(VIEW_CENTER)
                .scale(200)
                .precision(0.1)
                .clipAngle(90),  // hides occluded side
            defineMap: function(mapSvg, foregroundSvg) {
                var path = d3.geo.path().projection(this.projection);
                var defs = mapSvg.append("defs");
                var gradientFill = defs.append("radialGradient")
                    .attr("id", "orthographic-fill")
                    .attr("gradientUnits", "objectBoundingBox")
                    .attr("cx", "50%").attr("cy", "49%").attr("r", "50%");
                gradientFill.append("stop").attr("stop-color", "#303030").attr("offset", "69%");
                gradientFill.append("stop").attr("stop-color", "#202020").attr("offset", "91%");
                gradientFill.append("stop").attr("stop-color", "#000000").attr("offset", "96%");
                defs.append("path")
                    .attr("id", "sphere")
                    .datum({type: "Sphere"})
                    .attr("d", path);
                mapSvg.append("use")
                    .attr("xlink:href", "#sphere")
                    .attr("fill", "url(#orthographic-fill)");
                mapSvg.append("path")
                    .attr("class", "graticule")
                    .datum(d3.geo.graticule())
                    .attr("d", path);
                mapSvg.append("path")
                    .attr("class", "coastline");
                foregroundSvg.append("use")
                    .attr("xlink:href", "#sphere")
                    .attr("class", "sphere-stroke");
            }
        });
    }

    function waterman() {
        return standardBuilder({
            projection: d3.geo.polyhedron.waterman()
                .rotate([20, 0])
                .translate(VIEW_CENTER)
                .scale(118)  // UNDONE: proper sizing
                .precision(0.1),
            defineMap: function(mapSvg, foregroundSvg) {
                var path = d3.geo.path().projection(this.projection);
                var defs = mapSvg.append("defs");
                defs.append("path")
                    .attr("id", "sphere")
                    .datum({type: "Sphere"})
                    .attr("d", path);
                defs.append("clipPath")
                    .attr("id", "clip")
                    .append("use")
                        .attr("xlink:href", "#sphere");
                mapSvg.append("use")
                    .attr("xlink:href", "#sphere")
                    .attr("class", "sphere-fill");
                mapSvg.append("path")
                    .attr("class", "graticule")
                    .attr("clip-path", "url(#clip)")
                    .datum(d3.geo.graticule())
                    .attr("d", path);
                mapSvg.append("path")
                    .attr("class", "coastline")
                    .attr("clip-path", "url(#clip)");
                foregroundSvg.append("use")
                    .attr("xlink:href", "#sphere")
                    .attr("class", "sphere-stroke");
            }
        });
    }

    function stereographic() {
        return standardBuilder({
            projection: d3.geo.stereographic()
                .rotate([-43, -20])
                .translate(VIEW_CENTER)
                .scale(140)
                .precision(1.0)
                .clipAngle(180 - 0.0001)
                .clipExtent([[0, 0], [view.width, view.height]])
        });
    }

    function conicEquidistant() {
        return standardBuilder({
            projection: d3.geo.conicEquidistant()
                .translate(VIEW_CENTER)
                .scale(140)
                .precision(0.1)
        });
    }

    function winkel3() {
        return standardBuilder({
            projection: d3.geo.winkel3()
                .translate(VIEW_CENTER)
                .scale(140)
                .precision(0.1)
        });
    }

    return d3.map({
        conicEquidistant: conicEquidistant,
        orthographic: orthographic,
        stereographic: stereographic,
        waterman: waterman,
        winkel3: winkel3
    });

}();
