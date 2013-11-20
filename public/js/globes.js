
var globes = function() {
    "use strict";

    var SCALE_EXTENT = [25, 3000];
    var view = µ.view();

    function sphereBounds() {
        return µ.clampedBounds(
            d3.geo.path().projection(this.projection).bounds({type: "Sphere"}),
            view);
    }

    function sphereMask(context) {
        d3.geo.path().projection(this.projection).context(context)({type: "Sphere"});
        return context;
    }

    function standardOrientation(o) {
        var projection = this.projection;
        if (µ.isValue(o)) {
            var parts = o.split(",");
            var λ = +parts[0], φ = +parts[1], scale = +parts[2];
            if (Number.isFinite(λ) && µ.within(φ, [-90, +90])) {
                projection.rotate([-λ, -φ]);
            }
            if (µ.within(scale, SCALE_EXTENT)) {
                projection.scale(scale);
            }
            return this;
        }
        var rotate = projection.rotate();
        return [-(rotate[0].toFixed(2)), -(rotate[1].toFixed(2)), Math.round(projection.scale())].join(",");
    }

    function orthographic() {
        return {
            projection: d3.geo.orthographic()
                .scale(200)
                .translate([view.width / 2, view.height / 2])
                .precision(0.1)  // hides occluded side
                .clipAngle(90),
            bounds: sphereBounds,
            orientation: standardOrientation,
            defineMask: sphereMask,
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
                    .datum({type: "Sphere"});
                mapSvg.append("use")
                    .attr("xlink:href", "#sphere")
                    .attr("fill", "url(#orthographic-fill)");
                mapSvg.append("path")
                    .attr("class", "graticule")
                    .datum(d3.geo.graticule());
                mapSvg.append("path")
                    .attr("class", "coastline");
                foregroundSvg.append("use")
                    .attr("xlink:href", "#sphere")
                    .attr("class", "sphere-stroke");
            }
        };
    }

    function waterman() {
        console.log("view", view);
        return {
            projection: d3.geo.polyhedron.waterman()
                .rotate([20, 0])
                .scale(118)  // UNDONE: proper sizing
                .translate([view.width / 2, view.height / 2])
                .precision(0.1),
            bounds: sphereBounds,
            orientation: standardOrientation,
            defineMask: sphereMask,
            defineMap: function(mapSvg, foregroundSvg) {
                var path = d3.geo.path().projection(this.projection);
                var defs = mapSvg.append("defs");
                defs.append("path")
                    .attr("id", "sphere")
                    .datum({type: "Sphere"});
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
                    .datum(d3.geo.graticule());
                mapSvg.append("path")
                    .attr("class", "coastline")
                    .attr("clip-path", "url(#clip)");
                foregroundSvg.append("use")
                    .attr("xlink:href", "#sphere")
                    .attr("class", "sphere-stroke");
            }
        };
    }

    return {
        SCALE_EXTENT: SCALE_EXTENT,
        builders: d3.map({
            orthographic: orthographic,
            waterman: waterman
        })
    };
}();
