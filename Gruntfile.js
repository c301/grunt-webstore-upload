/*
 * webstore-upload
 * 
 *
 * Copyright (c) 2014 Anton Sivolapov
 * Licensed under the MIT license.
 */

'use strict';

module.exports = function (grunt) {
  // load all npm grunt tasks
  require('load-grunt-tasks')(grunt);

  // Project configuration.
  grunt.initConfig({
    jshint: {
      all: [
        'Gruntfile.js',
        'tasks/*.js',
        '<%= nodeunit.tests %>'
      ],
      options: {
        jshintrc: '.jshintrc',
        reporter: require('jshint-stylish')
      }
    },

    // Before generating any new files, remove any previously-created files.
    clean: {
      tests: ['tmp']
    },

    // Configuration to be run (and then tested).
    webstore_upload: {

        // TODO: remove before publish
        "accounts": {
            "default": { //account under this section will be used by default
                publish: true, //publish item right after uploading. default false
                client_id: "ie204es2mninvnb.apps.googleusercontent.com",
                client_secret: "LEJDeBHfS"
            },
            "new_account": { 
                publish: true, //publish item right after uploading. default false
                client_id: "kie204es2mninvnb.apps.googleusercontent.com",
                client_secret: "EbDeHfShcj"
            }
        },
        "extensions": {
            "test1": {
                //required
                appID: "jcbeonnlikcefedeaijjln",
                //required, we can use dir name and upload most recent zip file
                zip: "test/files/test1.zip"      
            },
            "test2": {
                account: "new_account",
                //will rewrite values from 'account' section
                publish: false, 
                appID: "jcbeonnlplijjln",
                zip: "test/files/test2.zip"
            }
        }
    },
     
    // Unit tests.
    nodeunit: {
      tests: ['test/*_test.js']
    }

  });

  // Actually load this plugin's task(s).
  grunt.loadTasks('tasks');

  // Whenever the "test" task is run, first clean the "tmp" dir, then run this
  // plugin's task(s), then test the result.
  grunt.registerTask('test', ['webstore_upload']);

  // By default, lint and run all tests.
  grunt.registerTask('default', ['jshint', 'test']);

};
