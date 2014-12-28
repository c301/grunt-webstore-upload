/*
 * webstore-upload
 * 
 *
 * Copyright (c) 2014 Anton Sivolapov
 * Licensed under the MIT license.
 */

'use strict';

module.exports = function (grunt) {
    var Q = require('q'),
        https = require('https'),
        path = require('path'),
        url = require('url'),
        fs = require('fs'),
        http = require('http'),
        util = require('util'),
        open = require('open');

    var isWin = /^win/.test(process.platform);
    var isLinux = /^linux$/.test(process.platform);

    // Please see the Grunt documentation for more information regarding task
    // creation: http://gruntjs.com/creating-tasks
    grunt.registerTask('webstore_upload', 
                       'Automate uploading uploading process of the new versions of Chrome Extension to Chrome Webstore', 
    function ( taskName ) {
        var 
            _task = this,
            _ = require('lodash'),
            extensionsConfigPath = _task.name + '.extensions',
            accountsConfigPath = _task.name + '.accounts',
            accounts,
            extensions;

        grunt.config.requires(extensionsConfigPath);
        grunt.config.requires(accountsConfigPath);
        
        extensions = grunt.config(extensionsConfigPath);
        accounts = grunt.config(accountsConfigPath);

        grunt.registerTask( 'get_account_token', 'Get token for account', 
            function(accountName){
                //prepare account for inner function
                var account = accounts[ accountName ];
                account["name"] = accountName;

                var done = this.async();

                getTokenForAccount(account, function (error, token) {
                    if(error !== null){
                        console.log('Error');
                        throw error;
                    }
                    //set token for provided account
                    accounts[ accountName ].token = token;
                    done();
                });
            });

        grunt.registerTask( 'uploading', 'uploading with token', 
            function( extensionName ){
                var done = this.async();
                var promisses = [];
                var uploadConfig;
                var accountName;

                if(extensionName){
                    uploadConfig = extensions[extensionName];
                    accountName = uploadConfig.account || "default";

                    uploadConfig["name"] = extensionName;
                    uploadConfig["account"] = accounts[accountName];
                    promisses.push(handleUpload(uploadConfig));
                }else{
                    _.each(extensions, function (extension, extensionName) {
                        var extensionConfigPath = extensionsConfigPath + '.' + extensionName;

                        grunt.config.requires(extensionConfigPath);
                        grunt.config.requires(extensionConfigPath + '.appID');
                        grunt.config.requires(extensionConfigPath + '.zip');

                        var uploadConfig = extension;
                        var accountName = extension.account || "default";

                        uploadConfig["name"] = extensionName;
                        uploadConfig["account"] = accounts[accountName];
                        var p = handleUpload(uploadConfig);
                        promisses.push(p);
                    });
                }

                Q.allSettled(promisses).then(function (results) {
                    var isError = false;
                    results.forEach(function (result) {
                        if (result.state === "fulfilled") {
                            var value = result.value;
                        } else {
                            isError = result.reason;
                        }
                    });
                    if( isError ){
                        grunt.log.writeln('================');
                        grunt.log.writeln(' ');
                        grunt.log.writeln('Error while uploading: ', isError);
                        grunt.log.writeln(' ');
                        done(new Error('Error while uploading'));
                    }else{
                        done();
                    }
                });
            });

        if(taskName){
            //upload specific extension
            var extensionConfigPath = extensionsConfigPath + '.' + taskName;

            grunt.config.requires(extensionConfigPath);
            grunt.config.requires(extensionConfigPath + '.appID');
            grunt.config.requires(extensionConfigPath + '.zip');

            var extensionConfig = grunt.config(extensionConfigPath);
            var accountName = extensionConfig.account || "default";
            
            grunt.task.run( [ "get_account_token:" + accountName, "uploading:" + taskName ] );

        }else{
            //upload all available extensions
            var tasks = [];

            //callculate tasks for accounts that we want to use
            var accountsTasksToUse = _.uniq( _.map( extensions, function (extension) {
                return "get_account_token:" + (extension.account || "default");
            }) );
            
            accountsTasksToUse.push('uploading');
            grunt.task.run( accountsTasksToUse );
        }
    });

        //upload zip
    function handleUpload( options ){
        var d = Q.defer();
        var doPublish = false;
        if( typeof options.publish !== 'undefined' ){
            doPublish = options.publish;
        }else if( typeof options.account.publish !== 'undefined' ){
            doPublish = options.account.publish;
        }
        //updating existing
        grunt.log.writeln('================');
        grunt.log.writeln(' ');
        grunt.log.writeln('Updating app ('+ options.name +'): ', options.appID);
        grunt.log.writeln(' ');

        var filePath, readStream, zip,
            req = https.request({
                method: 'PUT',
                host: 'www.googleapis.com',
                path: util.format('/upload/chromewebstore/v1.1/items/%s', options.appID),
                headers: {
                    'Authorization': 'Bearer ' + options.account.token,
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
                    if( obj.uploadState !== "SUCCESS" ) {
                        // console.log('Error while uploading ZIP', obj);
                        d.reject(obj.error ? obj.error.message : obj);
                    }else{
                        grunt.log.writeln(' ');
                        grunt.log.writeln('Uploading done ('+ options.name +')' );
                        grunt.log.writeln(' ');
                        if( doPublish ){
                            publishItem( options ).then(function () {
                                d.resolve();
                            });
                        }else{
                            d.resolve();
                        }
                    }
                });
            });

        req.on('error', function(e){
            grunt.log.error('Something went wrong ('+ options.name +')', e.message);
            d.resolve();
        });

        zip = options.zip;
        if( fs.statSync( zip ).isDirectory() ){
            zip = getRecentFile( zip );
        }

        filePath = path.resolve(zip);
        grunt.log.writeln('Path to ZIP ('+ options.name +'): ', filePath);
        grunt.log.writeln(' ');
        grunt.log.writeln('Uploading '+ options.name +'..');
        readStream = fs.createReadStream(filePath);

        readStream.on('end', function(){
            req.end();
        });

        readStream.pipe(req);

        return d.promise;
    }

    //make item published
    function publishItem(options){
        var d = Q.defer();
        grunt.log.writeln('Publishing ('+ options.name +') ' + options.appID + '..');

        var url = util.format('/chromewebstore/v1.1/items/%s/publish', options.appID);
        if(options.publishTarget)
            url += "?publishTarget=" + options.publishTarget;
            
        var req = https.request({
            method: 'POST',
            host: 'www.googleapis.com',
            path: url,
            headers: {
                'Authorization': 'Bearer ' + options.account.token,
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
                    console.log('Error while publishing ('+ options.name +'). Please check configuration at Developer Dashboard', obj);
                }else{
                    grunt.log.writeln('Publishing done ('+ options.name +')');
                    grunt.log.writeln(' ');
                }
                d.resolve();
            });
        });

        req.on('error', function(e){
            grunt.log.error('Something went wrong ('+ options.name +')', e.message);
            d.resolve();
        });
        req.end();

        return d.promise;
    }

    //return most recent chenged file in directory
    function getRecentFile( dirName ){
        var files = grunt.file.expand( { filter: 'isFile' }, dirName + '/*.zip'),
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
    function getTokenForAccount( account, cb ){
        var exec = require('child_process').exec,
            token = null,
            port = 8090,
            callbackURL = util.format('http://localhost:%s', port),
            server = http.createServer(),
            codeUrl = util.format('https://accounts.google.com/o/oauth2/auth?response_type=code&scope=https://www.googleapis.com/auth/chromewebstore&client_id=%s&redirect_uri=%s', account.client_id, callbackURL);

        grunt.log.writeln(' ');
        grunt.log.writeln('Authorization for account: ' + account.name);
        grunt.log.writeln('================');

        //due user interaction is required, we creating server to catch response and opening browser to ask user privileges
        server.on('connection', function(socket) {
            //reset Keep-Alive connetions in order to quick close server
            socket.setTimeout(1000); 
        });
        server.on('request', function(req, res){
            var code = url.parse(req.url, true).query['code'];  //user browse back, so code in url string
            if( code ){
                res.end('Got it! Authorizations for account "' + account.name + '" done. \
                        Check your console for new details. Tab now can be closed.');
                server.close(function () {
                    requestToken( code );
                });
            }else{
                res.end('<a href="' + codeUrl + '">Please click here and allow access for account "' + account.name + '", \
to continue uploading..</a>');
            }
        });
        server.listen( port, 'localhost' );

        grunt.log.writeln(' ');
        grunt.log.writeln('Opening browser for authorization.. Please confirm privileges to continue..');
        grunt.log.writeln(' ');
        grunt.log.writeln(util.format('If the browser didn\'t open within a minute, please visit %s manually to continue', callbackURL));
        grunt.log.writeln(' ');

        open(codeUrl);



        function requestToken( code ){
            console.log('code', code);
            var post_data = util.format('client_id=%s&client_secret=%s&code=%s&grant_type=authorization_code&redirect_uri=%s', account.client_id, account.client_secret, code, callbackURL),
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
                            cb( new Error() );
                        }else{
                            token = obj.access_token;
                            cb(null, token);
                        }
                    });
                });

            req.on('error', function(e){
                console.log('Something went wrong', e.message);
                cb( e );
            });

            req.write( post_data );
            req.end();
        }
    }
};

