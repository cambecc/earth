earth
=====

To construct the natural earth data:

```
curl "http://www.nacis.org/naturalearth/${DETAIL}/physical/ne_${DETAIL}_coastline.zip" -o dl.zip && \
  unzip -o dl.zip && \
  ogr2ogr -f GeoJSON coastline.json ne_${DETAIL}_coastline.shp && \
  topojson --bbox -o earth-$DETAIL-topo.json coastline.json && \
  cp earth-$DETAIL-topo.json ~/code/earth/public/data/
```

Run above for each of:

```
DETAIL=50m
DETAIL=110m
```
