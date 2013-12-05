"use strict";

module.exports = function(grunt) {

    // Project configuration.
    grunt.initConfig({
        pkg: grunt.file.readJSON("package.json"),
        jshint: {
            files: ["server/**/*.js", "public/libs/earth/**/*.js"],
            options: {
                // ignores: ["public/js/d3*.js", "public/js/topojson*.js", "public/js/when*.js"],
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
        }
    });

    // Load the plugin that provides the "jshint" task.
    grunt.loadNpmTasks("grunt-contrib-jshint");

    // Default task(s).
    grunt.registerTask("default", ["jshint"]);

};
