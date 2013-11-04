

util = function() {
    "use strict";

    var τ = 2 * Math.PI;
    var MIN_SLEEP_TIME = 25;  // amount of time a task waits before resuming (milliseconds)

    /**
     * Returns a random number between min (inclusive) and max (exclusive).
     */
    function rand(min, max) {
        return min + Math.random() * (max - min);
    }

    /**
     * Returns the index of v in array a. The array must be sorted in ascending order. (Adapted from Java and
     * darkskyapp/binary-search).
     *
     * @param a {Array} the array
     * @param v {number} the number to search for
     * @returns {number} the index of the value if found, otherwise a negative value x such that x == -i - 1,
     *          where i represents the insertion point of v into the array while maintaining sorted order.
     */
    function binarySearch(a, v) {
        var low = 0;
        var high = a.length - 1;

        while (low <= high) {
            var mid = low + ((high - low) >> 1)
            var p = a[mid];

            if (p < v) {
                low = mid + 1;
            }
            else if (p === v) {
                return mid;
            }
            else {
                high = mid - 1;
            }
        }
        return -(low + 1);
    }

    /**
     * Returns a function that takes an array and applies it as arguments to the specified function. Yup. Basically
     * the same as when.js/apply.
     */
    function apply(f) {
        return function(args) {
            return f.apply(null, args);
        }
    }

    /**
     * Returns a promise that resolves to the specified value after a short nap.
     */
    function nap(value) {
        var d = when.defer();
        setTimeout(function() { d.resolve(value); }, MIN_SLEEP_TIME);
        return d.promise;
    }

    /**
     * An object to perform logging when the browser supports it.
     */
    var log = {
        debug:   function(s) { if (console && console.log) console.log(s); },
        info:    function(s) { if (console && console.info) console.info(s); },
        error:   function(e) { if (console && console.error) console.error(e.stack ? e + "\n" + e.stack : e); },
        time:    function(s) { if (console && console.time) console.time(s); },
        timeEnd: function(s) { if (console && console.timeEnd) console.timeEnd(s); }
    };

    /**
     * An object {width:, height:} that describes the extent of the browser's view in pixels.
     */
    var view = function() {
        var w = window, d = document.documentElement, b = document.getElementsByTagName("body")[0];
        var x = w.innerWidth || d.clientWidth || b.clientWidth;
        var y = w.innerHeight || d.clientHeight || b.clientHeight;
        return {width: x, height: y};
    }();

    /**
     * Returns a color style string for the specified RGBA values.
     */
    function asColorStyle(r, g, b, a) {
        return "rgba(" + r + ", " + g + ", " + b + ", " + a + ")";
    }

    /**
     * Produces a color style in a rainbow-like trefoil color space. Not quite HSV, but produces a nice
     * spectrum. See http://krazydad.com/tutorials/makecolors.php.
     *
     * @param hue the hue rotation in the range [0, 1]
     * @param a the alpha value in the range [0, 1]
     * @returns {String} rgba style string
     */
    function asRainbowColorStyle(hue, a) {
        // Map hue [0, 1] to radians [0, 5/6τ]. Don't allow a full rotation because that keeps hue == 0 and
        // hue == 1 from mapping to the same color.
        var rad = hue * τ * 5/6;
        rad *= 0.75;  // increase frequency to 2/3 cycle per rad

        var s = Math.sin(rad);
        var c = Math.cos(rad);
        var r = Math.floor(Math.max(0, -c) * 255);
        var g = Math.floor(Math.max(s, 0) * 255);
        var b = Math.floor(Math.max(c, 0, -s) * 255);
        return asColorStyle(r, g, b, a);
    }

    /**
     * Returns a promise for a JSON resource (URL) fetched via XHR. If the load fails, the promise rejects with an
     * object describing the reason: {error: http-status-code, message: http-status-text, resource:}.
     */
    function loadJson(resource) {
        var d = when.defer();
        d3.json(resource, function(error, result) {
            return error ?
                !error.status ?
                    d.reject({error: -1, message: "Cannot load resource: " + resource, resource: resource}) :
                    d.reject({error: error.status, message: error.statusText, resource: resource}) :
                d.resolve(result);
        });
        return d.promise;
    }

    /**
     * Returns a d3 Albers conical projection (en.wikipedia.org/wiki/Albers_projection) that maps the bounding box
     * defined by the lower left geographic coordinates (lng0, lat0) and upper right coordinates (lng1, lat1) onto
     * the view port having (0, 0) as the upper left point and (width, height) as the lower right point.
     */
    function createAlbersProjection(lng0, lat0, lng1, lat1, view) {
        // Construct a unit projection centered on the bounding box. NOTE: center calculation will not be correct
        // when the bounding box crosses the 180th meridian. Don't expect that to happen to Tokyo for a while...
        var projection = d3.geo.albers()
            .rotate([-((lng0 + lng1) / 2), 0]) // rotate the globe from the prime meridian to the bounding box's center
            .center([0, (lat0 + lat1) / 2])    // set the globe vertically on the bounding box's center
            .scale(1)
            .translate([0, 0]);

        // Project the two longitude/latitude points into pixel space. These will be tiny because scale is 1.
        var p0 = projection([lng0, lat0]);
        var p1 = projection([lng1, lat1]);
        // The actual scale is the ratio between the size of the bounding box in pixels and the size of the view port.
        // Reduce by 5% for a nice border.
        var s = 1 / Math.max((p1[0] - p0[0]) / view.width, (p0[1] - p1[1]) / view.height) * 0.95;
        // Move the center to (0, 0) in pixel space.
        var t = [view.width / 2, view.height / 2];

        return projection.scale(s).translate(t);
    }

    /**
     * UNDONE
     */
    function createOrthographicProjection(lng0, lat0, lng1, lat1, view) {
        // Construct a unit projection centered on the bounding box. NOTE: center calculation will not be correct
        // when the bounding box crosses the 180th meridian.
        var projection = d3.geo.orthographic()
            .rotate([-((lng0 + lng1) / 2), 0]) // rotate the globe from the prime meridian to the bounding box's center
            .center([0, (lat0 + lat1) / 2])    // set the globe vertically on the bounding box's center
            .scale(1)
            .translate([0, 0]);

        // Project the two longitude/latitude points into pixel space. These will be tiny because scale is 1.
        var p0 = projection([lng0, lat0]);
        var p1 = projection([lng1, lat1]);
        // The actual scale is the ratio between the size of the bounding box in pixels and the size of the view port.
        // Reduce by 5% for a nice border.
        var s = 1 / Math.max((p1[0] - p0[0]) / view.width, (p0[1] - p1[1]) / view.height) * 0.95;
        // Move the center to (0, 0) in pixel space.
        var t = [view.width / 2, view.height / 2];

        return projection.scale(s).translate(t)
            .precision(0.1)  // smooths the sphere
            .clipAngle(90)   // hides occluded side
            .rotate([-130, -20]);
    }

    /**
     * UNDONE
     *
     * Returns an object that describes the location and size of the projection on screen:
     * {x:, y:, xBound:, yBound:, width:, height:, function contains(x, y)}
     */
    function createDisplayBounds(projection) {
        // UNDONE: bounds are crazy for conicConformal projection: [[-95669, -7850], [97109, 139]]
        var bounds = d3.geo.path().projection(projection).bounds({type: "Sphere"});
        var upperLeft = bounds[0];
        var lowerRight = bounds[1];
        var x = Math.floor(Math.max(upperLeft[0], 0)), xBound = Math.ceil(Math.min(lowerRight[0], view.width - 1));
        var y = Math.floor(Math.max(upperLeft[1], 0)), yBound = Math.ceil(Math.min(lowerRight[1], view.height - 1));
        return {
            x: x,
            y: y,
            xBound: xBound,
            yBound: yBound,
            width: xBound - x + 1,
            height: yBound - y + 1,
            contains: function(px, py) {
                return x <= px && px <= xBound && y <= py && py <= yBound;
            }
        }
    }

    // UNDONE
    function distortion(projection) {
        // gis.stackexchange.com/questions/5068/how-to-create-an-accurate-tissot-indicatrix
        // www.jasondavies.com/maps/tissot

        var r = Math.pow(10, -5.2);
        // CONSIDER: potentially useful for avoiding array allocations??
        // var px, py;
        // var stream = projection.stream({ point: function(x, y) { px = x; py = y; } });

        return function(λ, φ, x, y, du, dv) {
            var λ0 = λ > 0 ? λ - r : λ + r;
            var φ0 = φ > 0 ? φ - r : φ + r;

            var pλ = projection([λ0, φ]);
            var pφ = projection([λ, φ0]);

            if (!pλ || !pφ) {
                return false;
            }

            var Δλ = λ - λ0;
            var Δφ = φ - φ0;
            du[0] = (x - pλ[0]) / Δλ;
            du[1] = (pλ[1] - y) / Δλ;  // lat increases downward in pixel space
            dv[0] = (x - pφ[0]) / Δφ;
            dv[1] = (pφ[1] - y) / Δφ;  // lat increases downward in pixel space
            return true;
        }
    }

    /**
     * Return exported members.
     */
    return {
        rand: rand,
        binarySearch: binarySearch,
        apply: apply,
        nap: nap,
        log: log,
        view: view,
        asColorStyle: asColorStyle,
        asRainbowColorStyle: asRainbowColorStyle,
        loadJson: loadJson,
        createAlbersProjection: createAlbersProjection,
        createOrthographicProjection: createOrthographicProjection,
        createDisplayBounds: createDisplayBounds,
        distortion: distortion
    };

}();
