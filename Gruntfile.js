"use strict";

module.exports = function(grunt) {

    // Project configuration.
    grunt.initConfig({
        pkg: grunt.file.readJSON("package.json"),
        jshint: {
            files: ["*.js", "public/**/*.js", "test/**/*.js"],
            options: {
                ignores: ["public/js/d3*.js", "public/js/topojson*.js", "public/js/when*.js"],
                globals: {
                    console: false, require: false, __dirname: false, process: false, exports: false, module: false
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
