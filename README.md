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

After installing node.js and npm, clone the project and install project dependencies:

    git clone https://github.com/cambecc/earth
    cd earth
    npm install

Next, launch the web server used for development, on a port of your choice:

    cd server
    node dev-server.js 8080

Finally, point your browser to:

    http://localhost:8080

There is one sample data layer included in the repository.

inspiration
-----------

The awesome [hint.fm wind map](http://hint.fm/wind/) and [D3.js visualization library](http://d3js.org) provided
the main inspiration for this project.
