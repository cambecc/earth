Rayyan
======

building and launching
----------------------

After installing node.js and npm, install dependencies:

    npm install
    npm install -g grunt-cli

Next, define new env variable API_RAYYAN_URL to define the api url (default value 'http://localhost:5000' if env variable is not define) and then run

    grunt build:config

Next, launch the development web server:

    node dev-server.js 8080

Finally, point your browser to:

    http://localhost:8080
