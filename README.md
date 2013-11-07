earth
=====

To construct the earth topojson file from natural earth data:

```
curl "http://www.nacis.org/naturalearth/50m/physical/ne_50m_coastline.zip" -o ne_50m_coastline.zip && \
    curl "http://www.nacis.org/naturalearth/110m/physical/ne_110m_coastline.zip" -o ne_110m_coastline.zip && \
    unzip -o ne_\*_coastline.zip && \
    ogr2ogr -f GeoJSON coastline_50m.json ne_50m_coastline.shp && \
    ogr2ogr -f GeoJSON coastline_110m.json ne_110m_coastline.shp && \
    topojson --bbox -o earth-topo.json coastline_50m.json coastline_110m.json && \
    cp earth-topo.json ~/code/earth/public/data/
```
