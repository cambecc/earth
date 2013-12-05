earth
=====

"earth" is a project to visualize global weather conditions.

The main components of the project are:

   * a script to download and process [Global Forecast System](http://www.emc.ncep.noaa.gov/index.php?branch=GFS)
     weather data in GRIB2 format from the National Centers for Environmental Prediction, NOAA / National Weather
     Service.
   * a GRIB2 to JSON converter (see the [grib2json](https://github.com/cambecc/grib2json) project).
   * scripts to push site files to [Amazon S3](http://aws.amazon.com/s3/) for static hosting.
   * a browser app that interpolates the data and renders an animated wind map.

An instance of "earth" is available at http://earth.nullschool.net. It is currently hosted by Amazon S3 and
fronted by [CloudFlare](https://www.cloudflare.com).

"earth" is a personal project I've used to learn javascript and browser programming, and is based on the earlier
[Tokyo Wind Map](https://github.com/cambecc/air) project.  Feedback and contributions are welcome! ...especially
those that clarify accepted best practices.

building and launching
----------------------

After installing node.js and npm, clone "earth" and install dependencies:

    git clone https://github.com/cambecc/earth
    cd earth
    npm install

Next, launch the development web server:

    cd server
    node dev-server.js 8080

Finally, point your browser to:

    http://localhost:8080

The server acts as a stand-in for static S3 bucket hosting and so contains almost no server-side logic. It
serves all files located in the `earth/public` directory. See `public/index.html` and `public/libs/earth/*.js`
for the main entry points. Data files are located in the `public/data` directory, and there is one sample
weather layer located at `data/weather/current`.

getting map data
----------------

    curl "http://www.nacis.org/naturalearth/50m/physical/ne_50m_coastline.zip" -o ne_50m_coastline.zip
    curl "http://www.nacis.org/naturalearth/110m/physical/ne_110m_coastline.zip" -o ne_110m_coastline.zip
    unzip -o ne_\*_coastline.zip
    ogr2ogr -f GeoJSON coastline_50m.json ne_50m_coastline.shp
    ogr2ogr -f GeoJSON coastline_110m.json ne_110m_coastline.shp
    ogr2ogr -simplify 1 -f GeoJSON coastline_tiny.json ne_110m_coastline.shp
    topojson -o earth-topo.json coastline_50m.json coastline_110m.json
    topojson -o earth-topo-mobile.json coastline_110m.json coastline_tiny.json
    cp earth-topo*.json ~/code/earth/public/data/

font subsetting
---------------

This project uses [M+ FONTS](http://mplus-fonts.sourceforge.jp/). To reduce download size, a subset font is
constructed out of the unique characters utilized by the site. See the `earth/server/font/findChars.js` script
for details. Font subsetting is performed by the [M+Web FONTS Subsetter](http://mplus.font-face.jp/), and
the resulting font is placed in `earth/public/styles`.

inspiration
-----------

The awesome [hint.fm wind map](http://hint.fm/wind/) and [D3.js visualization library](http://d3js.org) provided
the main inspiration for this project.
