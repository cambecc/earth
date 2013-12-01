(function() {

var ε = 1e-6,
    π = Math.PI,
    radians = π / 180,
    degrees = 180 / π;

// Creates a polyhedral projection.
//  * root: a spanning tree of polygon faces.  Nodes are automatically
//    augmented with a transform matrix.
//  * face: a function that returns the appropriate node for a given {λ, φ}
//    point (radians).
//  * r: rotation angle for final polyhedron net.  Defaults to -π / 6 (for
//    butterflies).
d3.geo.polyhedron = function(root, face, r) {

  r = r == null ? -π / 6 : r; // TODO automate

  recurse(root, {transform: [
    Math.cos(r), Math.sin(r), 0,
    -Math.sin(r), Math.cos(r), 0
  ]});

  function recurse(node, parent) {
    node.edges = faceEdges(node.face);
    if (parent) {
      // Find shared edge.
      if (parent.face) {
        var shared = node.shared = sharedEdge(node.face, parent.face),
            m = matrix(shared.map(parent.project), shared.map(node.project));
        node.transform = parent.transform ? multiply(parent.transform, m) : m;
        // Replace shared edge in parent edges array.
        var edges = parent.edges;
        for (var i = 0, n = edges.length; i < n; ++i) {
          if (pointEqual(shared[0], edges[i][1]) && pointEqual(shared[1], edges[i][0])) edges[i] = node;
          if (pointEqual(shared[0], edges[i][0]) && pointEqual(shared[1], edges[i][1])) edges[i] = node;
        }
        var edges = node.edges;
        for (var i = 0, n = edges.length; i < n; ++i) {
          if (pointEqual(shared[0], edges[i][0]) && pointEqual(shared[1], edges[i][1])) edges[i] = parent;
          if (pointEqual(shared[0], edges[i][1]) && pointEqual(shared[1], edges[i][0])) edges[i] = parent;
        }
      } else {
        node.transform = parent.transform;
      }
    }
    if (node.children) {
      node.children.forEach(function(child) {
        recurse(child, node);
      });
    }
    return node;
  }

  function forward(λ, φ) {
    var node = face(λ, φ),
        point = node.project([λ * degrees, φ * degrees]),
        t;
    if (t = node.transform) {
      return [
        t[0] * point[0] + t[1] * point[1] + t[2],
        -(t[3] * point[0] + t[4] * point[1] + t[5])
      ];
    }
    point[1] = -point[1];
    return point;
  }

  // Naive inverse!  A faster solution would use bounding boxes, or even a
  // polygonal quadtree.
  if (hasInverse(root)) forward.invert = function(x, y) {
    var coordinates = faceInvert(root, [x, -y]);
    return coordinates && (coordinates[0] *= radians, coordinates[1] *= radians, coordinates);
  };

  function faceInvert(node, coordinates) {
    var invert = node.project.invert,
        t = node.transform,
        point = coordinates;
    if (t) {
      t = inverseTransform(t);
      point = [
        t[0] * point[0] + t[1] * point[1] + t[2],
        (t[3] * point[0] + t[4] * point[1] + t[5])
      ];
    }
    if (invert && node === faceDegrees(p = invert(point))) return p;
    var p,
        children = node.children;
    for (var i = 0, n = children && children.length; i < n; ++i) {
      if (p = faceInvert(children[i], coordinates)) return p;
    }
  }

  function faceDegrees(coordinates) {
    return face(coordinates[0] * radians, coordinates[1] * radians);
  }

  var projection = d3.geo.projection(forward),
      stream_ = projection.stream;

  projection.stream = function(stream) {
    var rotate = projection.rotate(),
        rotateStream = stream_(stream),
        sphereStream = (projection.rotate([0, 0]), stream_(stream));
    projection.rotate(rotate);
    rotateStream.sphere = function() {
      sphereStream.polygonStart();
      sphereStream.lineStart();
      outline(sphereStream, root);
      sphereStream.lineEnd();
      sphereStream.polygonEnd();
    };
    return rotateStream;
  };

  return projection;
};

d3.geo.polyhedron.butterfly = function(faceProjection) {

  faceProjection = faceProjection || function(face) {
    var centroid = d3.geo.centroid({type: "MultiPoint", coordinates: face});
    return d3.geo.gnomonic().scale(1).translate([0, 0]).rotate([-centroid[0], -centroid[1]]);
  };

  var faces = d3.geo.polyhedron.octahedron.map(function(face) {
    return {face: face, project: faceProjection(face)};
  });

  [-1, 0, 0, 1, 0, 1, 4, 5].forEach(function(d, i) {
    var node = faces[d];
    node && (node.children || (node.children = [])).push(faces[i]);
  });

  return d3.geo.polyhedron(faces[0], function(λ, φ) {
    return faces[
        λ < -π / 2 ? φ < 0 ? 6 : 4
        : λ < 0 ? φ < 0 ? 2 : 0
        : λ < π / 2 ? φ < 0 ? 3 : 1
        : φ < 0 ? 7 : 5];
  });
};

d3.geo.polyhedron.waterman = function(faceProjection) {

  faceProjection = faceProjection || function(face) {
    var centroid = face.length === 6 ? d3.geo.centroid({type: "MultiPoint", coordinates: face}) : face[0];
    return d3.geo.gnomonic().scale(1).translate([0, 0]).rotate([-centroid[0], -centroid[1]]);
  };

  var octahedron = d3.geo.polyhedron.octahedron;

  var w5 = octahedron.map(function(face) {
    var xyz = face.map(cartesian),
        n = xyz.length,
        a = xyz[n - 1],
        b,
        hexagon = [];
    for (var i = 0; i < n; ++i) {
      b = xyz[i];
      hexagon.push(spherical([
        a[0] * 0.9486832980505138 + b[0] * 0.31622776601683794,
        a[1] * 0.9486832980505138 + b[1] * 0.31622776601683794,
        a[2] * 0.9486832980505138 + b[2] * 0.31622776601683794
      ]), spherical([
        b[0] * 0.9486832980505138 + a[0] * 0.31622776601683794,
        b[1] * 0.9486832980505138 + a[1] * 0.31622776601683794,
        b[2] * 0.9486832980505138 + a[2] * 0.31622776601683794
      ]));
      a = b;
    }
    return hexagon;
  });

  var cornerNormals = [];

  var parents = [-1, 0, 0, 1, 0, 1, 4, 5];

  w5.forEach(function(hexagon, j) {
    var face = octahedron[j],
        n = face.length,
        normals = cornerNormals[j] = [];
    for (var i = 0; i < n; ++i) {
      w5.push([
        face[i],
        hexagon[(i * 2 + 2) % (2 * n)],
        hexagon[(i * 2 + 1) % (2 * n)]
      ]);
      parents.push(j);
      normals.push(cross(
        cartesian(hexagon[(i * 2 + 2) % (2 * n)]),
        cartesian(hexagon[(i * 2 + 1) % (2 * n)])
      ));
    }
  });

  var faces = w5.map(function(face) {
    return {
      project: faceProjection(face),
      face: face
    };
  });

  parents.forEach(function(d, i) {
    var parent = faces[d];
    parent && (parent.children || (parent.children = [])).push(faces[i]);
  });

  return d3.geo.polyhedron(faces[0], face).center([0, 45]);

  function face(λ, φ) {
    var cosφ = Math.cos(φ),
        p = [cosφ * Math.cos(λ), cosφ * Math.sin(λ), Math.sin(φ)];

    var hexagon = λ < -π / 2 ? φ < 0 ? 6 : 4
        : λ < 0 ? φ < 0 ? 2 : 0
        : λ < π / 2 ? φ < 0 ? 3 : 1
        : φ < 0 ? 7 : 5;

    var n = cornerNormals[hexagon];

    return faces[
        dot(n[0], p) < 0 ? 8 + 3 * hexagon
      : dot(n[1], p) < 0 ? 8 + 3 * hexagon + 1
      : dot(n[2], p) < 0 ? 8 + 3 * hexagon + 2
      : hexagon];
  }
};

function outline(stream, node, parent) {
  var point,
      edges = node.edges,
      n = edges.length,
      edge,
      multiPoint = {type: "MultiPoint", coordinates: node.face},
      notPoles = node.face.filter(function(d) { return Math.abs(d[1]) !== 90; }),
      bounds = d3.geo.bounds({type: "MultiPoint", coordinates: notPoles}),
      inside = false,
      j = -1,
      dx = bounds[1][0] - bounds[0][0];
  // TODO
  var centroid = dx === 180 || dx === 360
      ? [(bounds[0][0] + bounds[1][0]) / 2, (bounds[0][1] + bounds[1][1]) / 2]
      : d3.geo.centroid(multiPoint);
  // First find the shared edge…
  if (parent) while (++j < n) {
    if (edges[j] === parent) break;
  }
  ++j;
  for (var i = 0; i < n; ++i) {
    edge = edges[(i + j) % n];
    if (Array.isArray(edge)) {
      if (!inside) {
        stream.point((point = d3.geo.interpolate(edge[0], centroid)(ε))[0], point[1]);
        inside = true;
      }
      stream.point((point = d3.geo.interpolate(edge[1], centroid)(ε))[0], point[1]);
    } else {
      inside = false;
      if (edge !== parent) outline(stream, edge, node);
    }
  }
}

// TODO generate on-the-fly to avoid external modification.
var octahedron = [
  [0, 90],
  [-90, 0], [0, 0], [90, 0], [180, 0],
  [0, -90]
];

d3.geo.polyhedron.octahedron = [
  [0, 2, 1],
  [0, 3, 2],
  [5, 1, 2],
  [5, 2, 3],
  [0, 1, 4],
  [0, 4, 3],
  [5, 4, 1],
  [5, 3, 4]
].map(function(face) {
  return face.map(function(i) {
    return octahedron[i];
  });
});

var φ1 = Math.atan(Math.SQRT1_2) * degrees;

var cube = [
  [0, φ1], [90, φ1], [180, φ1], [-90, φ1],
  [0, -φ1], [90, -φ1], [180, -φ1], [-90, -φ1]
];

d3.geo.polyhedron.cube = [
  [0, 3, 2, 1], // N
  [0, 1, 5, 4],
  [1, 2, 6, 5],
  [2, 3, 7, 6],
  [3, 0, 4, 7],
  [4, 5, 6, 7] // S
].map(function(face) {
  return face.map(function(i) {
    return cube[i];
  });
});

// Finds a shared edge given two clockwise polygons.
function sharedEdge(a, b) {
  var x, y, n = a.length, found = null;
  for (var i = 0; i < n; ++i) {
    x = a[i];
    for (var j = b.length; --j >= 0;) {
      y = b[j];
      if (x[0] === y[0] && x[1] === y[1]) {
        if (found) return [found, x];
        found = x;
      }
    }
  }
}

// Note: 6-element arrays are used to denote the 3x3 affine transform matrix:
// [a, b, c,
//  d, e, f,
//  0, 0, 1] - this redundant row is left out.

// Transform matrix for [a0, a1] -> [b0, b1].
function matrix(a, b) {
  var u = subtract(a[1], a[0]),
      v = subtract(b[1], b[0]),
      φ = angle(u, v),
      s = length(u) / length(v);

  return multiply([
    1, 0, a[0][0],
    0, 1, a[0][1]
  ], multiply([
    s, 0, 0,
    0, s, 0
  ], multiply([
    Math.cos(φ), Math.sin(φ), 0,
    -Math.sin(φ), Math.cos(φ), 0
  ], [
    1, 0, -b[0][0],
    0, 1, -b[0][1]
  ])));
}

// Inverts a transform matrix.
function inverseTransform(m) {
  var k = 1 / (m[0] * m[4] - m[1] * m[3]);
  return [
    k * m[4], -k * m[1], k * (m[1] * m[5] - m[2] * m[4]),
    -k * m[3], k * m[0], k * (m[2] * m[3] - m[0] * m[5])
  ];
}

// Multiplies two 3x2 matrices.
function multiply(a, b) {
  return [
    a[0] * b[0] + a[1] * b[3],
    a[0] * b[1] + a[1] * b[4],
    a[0] * b[2] + a[1] * b[5] + a[2],
    a[3] * b[0] + a[4] * b[3],
    a[3] * b[1] + a[4] * b[4],
    a[3] * b[2] + a[4] * b[5] + a[5]
  ];
}

// Subtracts 2D vectors.
function subtract(a, b) {
  return [a[0] - b[0], a[1] - b[1]];
}

// Magnitude of a 2D vector.
function length(v) {
  return Math.sqrt(v[0] * v[0] + v[1] * v[1]);
}

// Angle between two 2D vectors.
function angle(a, b) {
  return Math.atan2(a[0] * b[1] - a[1] * b[0], a[0] * b[0] + a[1] * b[1]);
}

function dot(a, b) {
  for (var i = 0, n = a.length, s = 0; i < n; ++i) s += a[i] * b[i];
  return s;
}

function cross(a, b) {
  return [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0]
  ];
}

// Converts 3D Cartesian to spherical coordinates (degrees).
function spherical(cartesian) {
  return [
    Math.atan2(cartesian[1], cartesian[0]) * degrees,
    Math.asin(Math.max(-1, Math.min(1, cartesian[2]))) * degrees
  ];
}

// Converts spherical coordinates (degrees) to 3D Cartesian.
function cartesian(coordinates) {
  var λ = coordinates[0] * radians,
      φ = coordinates[1] * radians,
      cosφ = Math.cos(φ);
  return [
    cosφ * Math.cos(λ),
    cosφ * Math.sin(λ),
    Math.sin(φ)
  ];
}

// Tests equality of two spherical points.
function pointEqual(a, b) {
  return a && b && a[0] === b[0] && a[1] === b[1];
}

// Converts an array of n face vertices to an array of n + 1 edges.
function faceEdges(face) {
  var n = face.length,
      edges = [];
  for (var a = face[n - 1], i = 0; i < n; ++i) edges.push([a, a = face[i]]);
  return edges;
}

function hasInverse(node) {
  return node.project.invert || node.children && node.children.some(hasInverse);
}

})();
