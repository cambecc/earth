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
        }
    });

    // Load the plugin that provides the "jshint" task.
    grunt.loadNpmTasks("grunt-contrib-jshint");

    // Default task(s).
    grunt.registerTask("default", ["jshint"]);

};
