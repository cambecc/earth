/**
 * dev-server - serves static resources for developing "earth" locally
 */

"use strict";

console.log("============================================================");
console.log(new Date().toISOString() + " - Starting");

var util = require("util");
/**
 * Returns true if the response should be compressed.
 */
function compressionFilter(req, res) {
    return (/json|text|javascript|font/).test(res.getHeader('Content-Type'));
}

/**
 * Adds headers to a response to enable caching.
 */
function cacheControl() {
    return function(req, res, next) {
        res.setHeader("Cache-Control", "public, max-age=300");
        return next();
    };
}

function logger() {
    express.logger.token("date", function() {
        return new Date().toISOString();
    });
    express.logger.token("response-all", function(req, res) {
        return (res._header ? res._header : "").trim();
    });
    express.logger.token("request-all", function(req, res) {
        return util.inspect(req.headers);
    });
    return express.logger(
        ':date - info: :remote-addr :req[cf-connecting-ip] :req[cf-ipcountry] :method :url HTTP/:http-version ' +
        '":user-agent" :referrer :req[cf-ray] :req[accept-encoding]\\n:request-all\\n\\n:response-all\\n');
}

var port = process.argv[2];
var express = require("express");
var app = express();
var fs = require("fs");
var bodyParser = require('body-parser');
var cookies = require("cookies");
var urlencodedParser = bodyParser.urlencoded({ extended: false })

app.use(cacheControl());
app.use(express.compress({filter: compressionFilter}));
app.use(logger());
app.use(express.static("public"));

app.post('/authenticate', urlencodedParser, function (req, res) {
   
   if (req.body.username == "admin" && req.body.password == "theadmin" ) {
		res.writeHead(301,{Location: 'http://localhost:8181/home.html' , 'Set-Cookie': 'user=admin', 'Content-Type': 'text/plain'  });
		res.end();
	 
   } else {
		res.writeHead(301,{Location: 'http://localhost:8181/' , 'Set-Cookie': 'user=null', 'Content-Type': 'text/plain' });
		res.write("hello");
		res.end();
	   
   }
})


app.listen(port);
console.log("Listening on port " + port + "...");
