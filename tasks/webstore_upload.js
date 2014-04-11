/*
 * webstore-upload
 * 
 *
 * Copyright (c) 2014 Anton Sivolapov
 * Licensed under the MIT license.
 */

'use strict';

module.exports = function (grunt) {

    // Please see the Grunt documentation for more information regarding task
    // creation: http://gruntjs.com/creating-tasks

    grunt.registerMultiTask('webstore_upload', 'Automate uploading uploading process of the new versions of Chrome Extension to Chrome Webstore', function () {
        var token = null,
            https = require('https'),
            path = require('path'),
            url = require('url'),
            http = require('http'),
            fs = require('fs'),
            util = require('util'),
            done = this.async(),

            optionsPath = this.name + '.' + this.target,
            token = grunt.config('webstore_upload.options.token'),
            options = this.options();

        grunt.config.requires( this.name + '.options.client_id');
        grunt.config.requires( this.name + '.options.client_secret');
        grunt.config.requires( this.name + '.options.browser_path');
        grunt.config.requires( optionsPath + '.options.appID');
        grunt.config.requires( optionsPath + '.options.zip');

        //set default
        options['publish'] = options['publish'] || false;

        //set token for next tasks in queue
        function setToken(token){
            grunt.config('webstore_upload.options.token', token);
        }
        function getToken(){
            return grunt.config('webstore_upload.options.token');
        }

        //return most recent chenged file in directory
        function getRecentFile( dirName ){
            var fs = require('fs'),
                files = grunt.file.expand( { filter: 'isFile' }, dirName + '/*.zip'),
                mostRecentFile,
                currentFile;

            if( files.length ){
                for( var i = 0; i < files.length; i++ ){
                    currentFile = files[i];
                    if( !mostRecentFile ){
                        mostRecentFile = currentFile;
                    }else{
                        if( fs.statSync( currentFile ).mtime > fs.statSync( mostRecentFile ).mtime ){
                            mostRecentFile = currentFile;
                        }
                    }
                }
                return mostRecentFile;
            }else{
                return false;
            }
        }

        //get OAuth token
        function get_token( cb ){
            var exec = require('child_process').exec,
                port = 8090,
                callbackURL = util.format('http://localhost:%s', port),
                server = http.createServer(),
                codeUrl = util.format('https://accounts.google.com/o/oauth2/auth?response_type=code&scope=https://www.googleapis.com/auth/chromewebstore&client_id=%s&redirect_uri=%s', options.client_id, callbackURL);

            //due user interaction is required, we creating server to catch response and opening browser to ask user privileges
            server.on('request', function(req, res){
                var code = url.parse(req.url, true).query['code'];  //user browse back, so code in url string
                if( code ){
                    res.end('Got it! Check your console for new details. Tab now can be closed.');
                    server.close();
                    requestToken( code );
                }else{
                    res.end('<a href="' + codeUrl + '">Please click here and allow access to continue uploading..</a>');
                }
            });
            server.listen( port, 'localhost' );

            grunt.log.writeln(' ');
            grunt.log.writeln('Opening browser for authorization.. Please confirm privileges to continue..');
            grunt.log.writeln(' ');
            grunt.log.writeln(util.format('If browser doesnt opened in a minute, please check options.browserPath or visit manually %s to continue', callbackURL));
            grunt.log.writeln(' ');

            exec( util.format('"%s" "%s"', options.browser_path, codeUrl), function(error, stdout, stderr ){
            });

            function requestToken( code ){
                console.log('code', code);
                var post_data = util.format('client_id=%s&client_secret=%s&code=%s&grant_type=authorization_code&redirect_uri=%s', options.client_id, options.client_secret, code, callbackURL),
                    req = https.request({
                        host: 'accounts.google.com',
                        path: '/o/oauth2/token',
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/x-www-form-urlencoded',
                            'Content-Length': post_data.length
                        }
                    }, function(res) {

                        res.setEncoding('utf8');
                        var response = '';
                        res.on('data', function (chunk) {
                            response += chunk;
                        });
                        res.on('end', function () {
                            var obj = JSON.parse(response);
                            if(obj.error){
                                grunt.log.writeln('Error: during access token request');
                                grunt.log.writeln( response );
                                done();
                            }else{
                                token = obj.access_token;
                                setToken(token);
                                cb();
                            }
                        })
                    });

                req.on('error', function(e){
                    console.log('Something went wrong', e.message);
                    done();
                });

                req.write( post_data );
                req.end();
            }
        };

        //upload zip
        function handleUpload(){
            //updating existing
            grunt.log.writeln('================');
            grunt.log.writeln(' ');
            grunt.log.writeln('Updating app: ', options.appID);
            grunt.log.writeln(' ');
            var filePath, readStream, zip,
                req = https.request({
                    method: 'PUT',
                    host: 'www.googleapis.com',
                    path: util.format('/upload/chromewebstore/v1.1/items/%s', options.appID),
                    headers: {
                        'Authorization': 'Bearer ' + getToken(),
                        'x-goog-api-version': '2'
                    }
                }, function(res) {
                    res.setEncoding('utf8');
                    var response = '';
                    res.on('data', function (chunk) {
                        response += chunk;
                    });
                    res.on('end', function () {
                        var obj = JSON.parse(response);
                        if( obj.uploadState != "SUCCESS" ){
                            console.log('Error while uploading ZIP', obj);
                        }else{
                            grunt.log.writeln('Uploading done');
                            grunt.log.writeln(' ');
                        }


                        if( options.publish ){
                            publishItem();
                        }else{
                            done();
                        }

                    });
                });

            req.on('error', function(e){
                grunt.log.error('Something went wrong', e.message);
                done();
            });

            zip = options.zip;
            if( fs.statSync( zip ).isDirectory() ){
                zip = getRecentFile( zip );
            }

//            console.log(zip);
//            done();
//            return;

            filePath = path.resolve(zip);
            grunt.log.writeln('Path to ZIP: ', filePath);
            grunt.log.writeln(' ');
            grunt.log.writeln('Uploading..');
            readStream = fs.createReadStream(filePath);

            readStream.on('end', function(){
                req.end();
            });

            readStream.pipe(req);
        }

        //make item published
        function publishItem(){
            grunt.log.writeln('Publishing ' + options.appID);

            var req = https.request({
                method: 'POST',
                host: 'www.googleapis.com',
                path: util.format('/chromewebstore/v1.1/items/%s/publish', options.appID),
                headers: {
                    'Authorization': 'Bearer ' + getToken(),
                    'x-goog-api-version': '2',
                    'Content-Length': '0'
                }
            }, function(res) {
                res.setEncoding('utf8');
                var response = '';
                res.on('data', function (chunk) {
                    response += chunk;
                });
                res.on('end', function () {
                    var obj = JSON.parse(response);
                    if( obj.error ){
                        console.log('Error while publishing. Please check configuration at Developer Dashboard', obj);
                    }else{
                        grunt.log.writeln('Publishing done');
                        grunt.log.writeln(' ');
                    }
                    done();
                });
            });

            req.on('error', function(e){
                grunt.log.error('Something went wrong', e.message);
                done();
            });
            req.end();

        }

        //going to get token in case it doesn't exist already
        if( !getToken() ){
            get_token( handleUpload );
        }else{
            handleUpload();
        }

    });
};
