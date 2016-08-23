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
        open = require('open'),
        readline = require('readline');

    var isWin = /^win/.test(process.platform);
    var isLinux = /^linux$/.test(process.platform);

    // Please see the Grunt documentation for more information regarding task
    // creation: http://gruntjs.com/creating-tasks
    grunt.registerTask('webstore_upload',
        'Automate uploading uploading process of the new versions of Chrome Extension to Chrome Webstore',
        function () {

            var
                _task = this,
                _ = require('lodash'),
                extensionsConfigPath = _task.name + '.extensions',
                accountsConfigPath = _task.name + '.accounts',
                skipUnpublishedPath = _task.name + '.skipUnpublished',
                accounts,
                extensions,
                onComplete;

            var tasks = this.args;
            //get all arguments after all grunt specific arguments
            var args = process.argv.slice(3);
            //search for message. Next element, after `-m`
            var message = _.reduce(args, function(total, v){
                    if(!total.message){
                        if(total.next){
                            total.message = v;
                        }
                        if(v === '-m'){
                            total.next = true;
                        }
                    }
                    return total;
                }, {next:false, message: false}).message || '';

            grunt.config.requires(extensionsConfigPath);
            grunt.config.requires(accountsConfigPath);
            //on publish callback
            onComplete = grunt.config.get(_task.name + '.onComplete');
            onComplete = onComplete || function(){};


            extensions = grunt.config(extensionsConfigPath);
            accounts = grunt.config(accountsConfigPath);
            var extensionsToUpload = extensions;
            if(tasks.length){
                //validate extension name
                _.each(tasks, function(task){
                    if( !extensionsToUpload[task] ){
                        var msg = 'Configuration for "' +
                            task
                            + '" not exist, please check configuration of the extensions list';
                        grunt.fail.warn(msg);
                    }
                });
                extensionsToUpload = _.pick(extensions, tasks);
            }

            var newExtensionsToUpload = {};

            var skipUnpublished = grunt.config.get(skipUnpublishedPath);
            extensionsToUpload = _.forOwn(extensionsToUpload, function(val, key, obj){
                var use = !val.skip && !( skipUnpublished && val.publish === false );
                if( use ){
                    newExtensionsToUpload[key] = val;
                }else{
                    grunt.log.writeln('Skip ' + val.zip);
                }
            });
            extensionsToUpload = newExtensionsToUpload;

            grunt.registerTask( 'get_account_token', 'Get token for account',
                function(accountName){
                    //prepare account for inner function
                    var account = accounts[ accountName ];
                    account["name"] = accountName;

                    var done = this.async();
                    var getTokenFn = account["cli_auth"] ? getTokenForAccountCli : getTokenForAccount;

                    getTokenFn(account, function (error, token) {
                        if(error !== null){
                            console.log('Error');
                            throw error;
                        }
                        //set token for provided account
                        accounts[ accountName ].token = token;
                        done();
                    });
                });

            grunt.registerTask( 'refresh_account_token', 'Refresh token for account',
                function(accountName){
                    //prepare account for inner function
                    var account = accounts[ accountName ];
                    account["name"] = accountName;

                    var done = this.async();

                    grunt.log.writeln('Refreshing access token.');
                    var post_data = util.format('client_id=%s' +
                        '&client_secret=%s' +
                        '&refresh_token=%s' +
                        '&grant_type=refresh_token',
                        account.client_id,
                        account.client_secret,
                        account.refresh_token);

                    var req = https.request({
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
                                done( new Error() );
                            }else{
                                var token = obj.access_token;
                                //set token for provided account
                                accounts[ accountName ].token = token;
                                done();
                            }
                        });
                    });

                    req.on('error', function(e){
                        console.log('Something went wrong', e.message);
                        done( e );
                    });

                    req.write( post_data );
                    req.end();

                });

            grunt.registerTask( 'uploading', 'uploading with token',
                function( extensionName ){
                    var done = this.async();
                    var uploadConfig;
                    var accountName;
                    var MAX_UPLOADS = 5;

                    //split extension in to parts to habdle uploads in small chunks 
                    var parts = _.chunk(_.keys(extensionsToUpload), MAX_UPLOADS);
                    var wait = Q(true);
                    var results = [];

                    _.each(parts, function (extensionsInChunk) {
                        wait = wait.then(function(){
                            var promises = [];
                            _.each(extensionsInChunk, function(extensionName){
                                var extensionConfigPath = extensionsConfigPath + '.' + extensionName;
                                var extension = extensionsToUpload[extensionName];

                                grunt.config.requires(extensionConfigPath);
                                grunt.config.requires(extensionConfigPath + '.appID');
                                grunt.config.requires(extensionConfigPath + '.zip');
                                var appID = grunt.config.get(extensionConfigPath + '.appID');
                                if ( !appID ){
                                    //empty appID, so show warning and skip this extension
                                    var errorStr = util.format('Extension "%s", has empty `appID.`', extensionName);
                                    grunt.fail.warn(errorStr);
                                    return false;
                                    
                                }

                                var uploadConfig = extension;
                                var accountName = extension.account || "default";

                                uploadConfig["name"] = extensionName;
                                uploadConfig["account"] = accounts[accountName];
                                var p = handleUpload(uploadConfig);
                                promises.push(p);
                                return true;
                            });
                            return Q.allSettled(promises).then(function(r){
                                results = results.concat(r);
                            });
                        });
                    });

                    wait.then(function(){
                        var isError = false;
                        var values = [];
                        results.forEach(function (result) {
                            if (result.state === "fulfilled") {
                                values.push( result.value );
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
                            try{
                                onComplete(values, message);
                            }catch(e){
                                done(new Error(e.stack));
                            }
                            done();
                        }
                    }).catch(function(e){
                        console.log(e.stack);
                    });
                });


            //upload all available extensions
            var accountsTasksToUse = [];

            //callculate tasks for accounts that we want to use
            var accountsTasksToUse = _.uniq( _.map( extensionsToUpload, function (extension) {

                var name = (extension.account || "default");
                var account = accounts[ name ];

                // If a `refresh_token` exists in the config then use it instead of prompting the user
                var tokenStrategy = account.refresh_token !== undefined
                    ? 'refresh_account_token:'
                    : 'get_account_token:';

                return tokenStrategy + name;
            }) ).sort();

            grunt.task.run( accountsTasksToUse.concat('uploading') );
            // grunt.task.run( 'uploading' );
        });

    //upload zip
    function handleUpload( options ){

        var d = Q.defer();

        var filePath, readStream, zip;
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

        zip = options.zip;
        if( fs.statSync( zip ).isDirectory() ){
            zip = getRecentFile( zip );
        }
        filePath = path.resolve(zip);

        var req = https.request({
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
                    grunt.log.writeln(' ');

                    var messageFromAPI = '';
                    if( obj.error ){
                        messageFromAPI = obj.error.message;
                    }else if( obj.itemError && obj.itemError[0] ){
                        messageFromAPI = obj.itemError[0].error_detail;
                    }

                    var errorMessage = util.format(
                        'Error on uploading (%s) with message "%s"',
                        options.name,
                        messageFromAPI
                    );
                    grunt.log.error(errorMessage);
                    grunt.log.writeln(' ');
                    d.reject(obj.error ? obj.error.message : obj);
                }else{
                    grunt.log.writeln(' ');
                    grunt.log.writeln('Uploading done ('+ options.name +')' );
                    grunt.log.writeln(' ');
                    if( doPublish ){
                        publishItem( options ).then(function () {
                            d.resolve({
                                fileName        : zip,
                                extensionName   : options.name,
                                extensionId     : options.appID,
                                published       : true
                            });
                        });
                    }else{
                        d.resolve({
                            fileName        : zip,
                            extensionName   : options.name,
                            extensionId     : options.appID,
                            published       : false
                        });
                    }
                }
            });
        });

        req.on('error', function(e){
            grunt.log.error('Something went wrong ('+ options.name +')', e.message);
            d.reject('Something went wrong ('+ options.name +')');
        });

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


    // Request access token from code
    function requestToken( account, redirectUri, code, cb ){
        console.log('code', code);
        var post_data = util.format('client_id=%s&client_secret=%s&code=%s&grant_type=authorization_code&redirect_uri=%s', account.client_id, account.client_secret, code, redirectUri),
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
                        if (!account.refresh_token) {
                            grunt.log.writeln('To make future uploads work without needing the browser, add this to your account settings in the Gruntfile:\n  refresh_token: "' + obj.refresh_token + '"');
                        }
                        cb(null, obj.access_token);
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
    // get OAuth token using ssh-friendly cli
    function getTokenForAccountCli( account, cb ){
        var redirectUri = 'urn:ietf:wg:oauth:2.0:oob';
        var codeUrl = util.format('https://accounts.google.com/o/oauth2/auth?response_type=code&scope=https://www.googleapis.com/auth/chromewebstore&client_id=%s&redirect_uri=%s', account.client_id, redirectUri);
        var readline = require('readline');

        var rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout
        });


        rl.question(util.format('Please open %s and enter code: ', codeUrl), function(code) {
            rl.close();
            requestToken(account, redirectUri, code, cb);
        });
    }

    //get OAuth token
    function getTokenForAccount( account, cb ){
        var exec = require('child_process').exec,
            port = 14809,
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
                    requestToken( account, callbackURL, code, cb );
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


    }
};

