"use strict";

module.exports = function(grunt) {

    // Project configuration.
    grunt.initConfig({
        pkg: grunt.file.readJSON("package.json"),
        jshint: {
            files: ["*.js", "public/libs/earth/**/*.js"],
            options: {
                // ignores: [""],
                globals: {
                    Buffer: false,
                    console: false,
                    exports: false,
                    module: false,
                    process: false,
                    require: false,
                    __dirname: false
                },
                globalstrict: true
            }
        },
        preprocess : {
            options: {
                context : {
                    API_RAYYAN_URL: process.env.API_RAYYAN_URL ||'http://localhost:5000'
                }
            },
            config : {
                src : 'public/libs/earth/1.0.0/config.js.in',
                dest : 'public/libs/earth/1.0.0/config.js',
                options: {
                    type: 'js'
                }
            }
        }
    });

    grunt.loadNpmTasks("grunt-preprocess");

    // Load the plugin that provides the "jshint" task.
    grunt.loadNpmTasks("grunt-contrib-jshint");

    // Default task(s).
    grunt.registerTask("default", ["jshint"]);

    grunt.registerTask("build:config", ['preprocess:config']);

};
