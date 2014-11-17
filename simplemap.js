// tiles.openseamap.org does not set CORS headers, so we have to disable
// crossOrigin and we cannot use WebGL.

console.log('Initializing ...');


// creating the view
var view = new ol.View({
  center: ol.proj.transform([5.8713, 45.6452], 'EPSG:4326', 'EPSG:3857'),
  zoom: 19
});

var geolocation = new ol.Geolocation({
  projection: view.getProjection()
});

var openSeaMapLayer = new ol.layer.Tile({
  source: new ol.source.OSM()
  });


var map = new ol.Map({
  layers: [
    new ol.layer.Tile({
      source: new ol.source.OSM()
    })
  ],
  target: 'map',
  controls: ol.control.defaults({
    attributionOptions: /** @type {olx.control.AttributionOptions} */ ({
      collapsible: false
    })
  }),
  view: view
});

// geolocate device
var geolocateBtn = document.getElementById('geolocate');
geolocateBtn.addEventListener('click', function() {
  geolocation.setTracking(true); // Start position tracking
  map.on('postcompose', render);
  map.render();
}, false);

geolocation.on('error', function() {
  alert('geolocation error');
  // FIXME we should remove the coordinates in positions
});

var styles = {
  'amenity': {
    'parking': [
      new ol.style.Style({
        stroke: new ol.style.Stroke({
          color: 'rgba(170, 170, 170, 1.0)',
          width: 1
        }),
        fill: new ol.style.Fill({
          color: 'rgba(170, 170, 170, 0.3)'
        })
      })
    ]
  },
  'building': {
    '.*': [
      new ol.style.Style({
        zIndex: 100,
        stroke: new ol.style.Stroke({
          color: 'rgba(246, 99, 79, 1.0)',
          width: 1
        }),
        fill: new ol.style.Fill({
          color: 'rgba(246, 99, 79, 0.3)'
        })
      })
    ]
  },
  'highway': {
    'residential': [
      new ol.style.Style({
        stroke: new ol.style.Stroke({
          color: 'rgba(246, 99, 79, 1.0)',
          width: 4
        })
      })
    ],
    '.*': [
      new ol.style.Style({
        stroke: new ol.style.Stroke({
          color: 'rgba(255, 255, 255, 1.0)',
          width: 3
        })
      })
    ]
  },
  'landuse': {
    'forest|grass|allotments': [
      new ol.style.Style({
        stroke: new ol.style.Stroke({
          color: 'rgba(140, 208, 95, 1.0)',
          width: 1
        }),
        fill: new ol.style.Fill({
          color: 'rgba(140, 208, 95, 0.3)'
        })
      })
    ]
  },
  'natural': {
    'tree': [
      new ol.style.Style({
        image: new ol.style.Circle({
          radius: 2,
          fill: new ol.style.Fill({
            color: 'rgba(140, 208, 95, 1.0)'
          }),
          stroke: null
        })
      })
    ]
  }
};

var vectorSource = new ol.source.ServerVector({
  format: new ol.format.OSMXML(),
  loader: function(extent, resolution, projection) {
    var epsg4326Extent =
        ol.proj.transformExtent(extent, projection, 'EPSG:4326');
    var url = 'http://overpass-api.de/api/xapi?way[name=' + encodeURI('Galla\u0161ova') + '][bbox=' +
        epsg4326Extent.join(',') + ']';
    $.ajax(url).then(function(response) {
      vectorSource.addFeatures(vectorSource.readFeatures(response));
    });
  },
  strategy: ol.loadingstrategy.createTile(new ol.tilegrid.XYZ({
    maxZoom: 19
  })),
  projection: 'EPSG:3857'
});

var vector = new ol.layer.Vector({
  source: vectorSource,
  style: function(feature, resolution) {
    for (var key in styles) {
      var value = feature.get(key);
      if (value !== undefined) {
        for (var regexp in styles[key]) {
          if (new RegExp(regexp).test(value)) {
            return styles[key][regexp];
          }
        }
      }
    }
    return null;
  }
});

var accuracyFeature = new ol.Feature();
accuracyFeature.bindTo('geometry', geolocation, 'accuracyGeometry');

var positionFeature = new ol.Feature();
positionFeature.bindTo('geometry', geolocation, 'position')
    .transform(function() {}, function(coordinates) {
      return coordinates ? new ol.geom.Point(coordinates) : null;
    });

var featuresOverlay = new ol.FeatureOverlay({
  map: map,
  features: [accuracyFeature, positionFeature]
});


var deltaMean = 500; // the geolocation sampling period mean in ms

// LineString to store the different geolocation positions. This LineString
// is time aware.
// The Z dimension is actually used to store the rotation (heading).
var positions = new ol.geom.LineString([],
    /** @type {ol.geom.GeometryLayout} */ ('XYZM'));

// convert radians to degrees
function radToDeg(rad) {
  return rad * 360 / (Math.PI * 2);
}
// convert degrees to radians
function degToRad(deg) {
  return deg * Math.PI * 2 / 360;
}
// modulo for negative values
function mod(n) {
  return ((n % (2 * Math.PI)) + (2 * Math.PI)) % (2 * Math.PI);
}

function addPosition(position, heading, m, speed) {
  var x = position[0];
  var y = position[1];
  var fCoords = positions.getCoordinates();
  var previous = fCoords[fCoords.length - 1];
  var prevHeading = previous && previous[2];
  if (prevHeading) {
    var headingDiff = heading - mod(prevHeading);

    // force the rotation change to be less than 180°
    if (Math.abs(headingDiff) > Math.PI) {
      var sign = (headingDiff >= 0) ? 1 : -1;
      headingDiff = - sign * (2 * Math.PI - Math.abs(headingDiff));
    }
    heading = prevHeading + headingDiff;
  }
  positions.appendCoordinate([x, y, heading, m]);

  // only keep the 20 last coordinates
  positions.setCoordinates(positions.getCoordinates().slice(-20));

  // FIXME use speed instead
  // if (heading && speed) {
    // markerEl.src = 'data/geolocation_marker_heading.png';
  // } else {
    // markerEl.src = 'data/geolocation_marker.png';
  // }
}
// Listen to position changes
geolocation.on('change', function(evt) {
  var position = geolocation.getPosition();
  var accuracy = geolocation.getAccuracy();
  var heading = geolocation.getHeading() || 0;
  var speed = geolocation.getSpeed() || 0;
  var m = Date.now();

  addPosition(position, heading, m, speed);

  var coords = positions.getCoordinates();
  var len = coords.length;
  if (len >= 2) {
    deltaMean = (coords[len - 1][3] - coords[0][3]) / (len - 1);
  }

 
});
	
var previousM = 0;
// change center and rotation before render
map.beforeRender(function(map, frameState) {
  if (frameState !== null) {
    // use sampling period to get a smooth transition
    var m = frameState.time - deltaMean * 1.5;
    m = Math.max(m, previousM);
    previousM = m;
    // interpolate position along positions LineString
    var c = positions.getCoordinateAtM(m, true);
    var view = frameState.viewState;
    if (c) {
      view.center = getCenterWithHeading(c, -c[2], view.resolution);
      view.rotation = -c[2];
      // marker.setPosition(c);
    }
  }
  return true; // Force animation to continue
});

// recenters the view by putting the given coordinates at 3/4 from the top or
// the screen
function getCenterWithHeading(position, rotation, resolution) {
  var size = map.getSize();
  var height = size[1];

  return [
    position[0] - Math.sin(rotation) * height * resolution * 1 / 4,
    position[1] + Math.cos(rotation) * height * resolution * 1 / 4
  ];
}

function render(){
	map.render();
}
