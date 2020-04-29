geomag-earth
=====

building and launching
----------------------

After installing node.js and npm, clone "earth" and install dependencies:

    git clone https://github.com/chompar4/geomag-earth
    cd earth
    npm install

Next, launch the development web server:

    node dev-server.js 8080

Finally, point your browser to:

    http://localhost:8080

The server acts as a stand-in for static S3 bucket hosting and so contains almost no server-side logic. It
serves all files located in the `earth/public` directory. See `public/index.html` and `public/libs/earth/*.js`
for the main entry points. Data files are located in the `public/data` directory, and there is one sample
weather layer located at `data/weather/current`.

getting map data
----------------

Map data is provided by [Natural Earth](http://www.naturalearthdata.com) but must be converted to
[TopoJSON](https://github.com/mbostock/topojson/wiki) format. 
There are two files in the project at different scales

getting magnetic data
--------------------

Magnetic data is produced by running the [World Magnetic Model](https://www.ngdc.noaa.gov/geomag/WMM/) and generating values for the WGS84 ellipsoid at altitude 0km. 

You can find the python implementation [here](https://github.com/chompar4/geomag)