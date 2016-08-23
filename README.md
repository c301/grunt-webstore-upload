# grunt-webstore-upload

> Automate uploading process of the new versions of Chrome Extension or App to Chrome Webstore

## Getting Started
This plugin requires Grunt.

If you haven't used [Grunt](http://gruntjs.com/) before, be sure to check out the [Getting Started](http://gruntjs.com/getting-started) guide, as it explains how to create a [Gruntfile](http://gruntjs.com/sample-gruntfile) as well as install and use Grunt plugins. Once you're familiar with that process, you may install this plugin with this command:

```shell
npm install grunt-webstore-upload --save-dev
```

Once the plugin has been installed, it may be enabled inside your Gruntfile with this line of JavaScript:

```js
grunt.loadNpmTasks('grunt-webstore-upload');
```

## The "webstore_upload" task

### Overview
Read more about great ability to automate this task here: [Chrome Web Store Publish API](http://developer.chrome.com/webstore/using_webstore_api).
In your project's Gruntfile, add a section named `webstore_upload` to the data object passed into `grunt.initConfig()`.
#### Please note, that you have to upload your extension first time manually, and then provide appID to update ( see below ). Also please make sure, that your draft ready to be published, ie all required fields was populated

```js
grunt.initConfig({
    webstore_upload: {
        "accounts": {
            "default": { //account under this section will be used by default
                publish: true, //publish item right after uploading. default false
                client_id: "ie204es2mninvnb.apps.googleusercontent.com",
                client_secret: "LEJDeBHfS"
            },
            "other_account": {
                publish: true, //publish item right after uploading. default false
                client_id: "ie204es2mninvnb.apps.googleusercontent.com",
                client_secret: "LEJDeBHfS",
                refresh_token: "1/eeeeeeeeeeeeeeeeeeeeeee_aaaaaaaaaaaaaaaaaaa"
            },
            "new_account": { 
                cli_auth: true, // Use server-less cli prompt go get access token. Default false
                publish: true, //publish item right after uploading. default false
                client_id: "kie204es2mninvnb.apps.googleusercontent.com",
                client_secret: "EbDeHfShcj"
            }
        },
        "extensions": {
            "extension1": {
                //required
                appID: "jcbeonnlikcefedeaijjln",
                //required, we can use dir name and upload most recent zip file
                zip: "test/files/test1.zip"      
            },
            "extension2": {
                account: "new_account",
                //will rewrite values from 'account' section
                publish: false, 
                appID: "jcbeonnlplijjln",
                zip: "test/files/test2.zip"
            }
        }
    }
})
```

### CLI options
You can pass multiple compile targets separated with comas: `grunt webstore_upload:target1:target2 -m "new super feature released"`

#### -m
Message for release, can be used within `onComplete` callback

### Configuration

#### accounts
List of the accounts (see *Accounts* section for details).

Type: `Object`

Required

#### extensions
List of the extension (see *Extensions* section for details).

Type: `Object`

Required

#### onComplete
Function that will be executed when all extension uploaded.

Array of released extensions and release message ( see `-m` ) passed as argument:
```
[{
    fileName        : zip,
    extensionName   : options.name,
    extensionId     : options.appID,
    published       : true
}..]
```

Type: `Function`

Optional

### Accounts
Since Google allows only 20 extensions under one account, you can create multiple records here.
It is object with arbitrary meaningful accounts names as a keys (see example above).
Special account named `default` will be used by defaults.

#### publish
Make item available at Chrome Webstore or not

Type: `Boolean`

Default value: `false`

Optional

#### client_id
[How to get it](http://developer.chrome.com/webstore/using_webstore_api#beforeyoubegin)
Client ID to access to Chrome Console API

Type: `String`

Required

#### client_secret
[How to get it](http://developer.chrome.com/webstore/using_webstore_api#beforeyoubegin)
Client Secret to access to Chrome Console API

Type: `String`

Required

#### refresh_token
[How to get it](http://developer.chrome.com/webstore/using_webstore_api#beforeyoubegin)
Refresh token for the Chrome Console API

Type: `String`

Optional


### skipUnpublished
Skip extensions where `publish` is `false`

Type: `Boolean`

Default value: `false`

Optional

### Extensions
It is object with arbitrary meaningful extensions names as a keys (see example above).

#### appID
Extension id or Application id at Chrome Webstore

Type: `String`

Required

#### zip
Path to zip file. Upload most recent zip file in case of path is directory

Type: `String`

Required

#### publish
Make item available at Chrome Webstore or not. 
This option under `extensions` will rewrite `publish` under related `account` section.

Type: `Boolean`

Default value: `false`

Optional

#### publishTarget
Make item available at . 
See https://developer.chrome.com/webstore/webstore_api/items/publish
Can be `trustedTesters` or `default`

Type: `String`

Default value: `default`

Optional

#### account
Name of the account, that we should use to upload extension. If ommited, `default` account will be used.

Type: `String`

Default value: `default`

Optional

#### skip
skip this extension ( don't upload, etc )

Type: `Bool`

Default value: `false`

Optional

### Migrating from < 0.7 versions
In order to move your existing config to new version, do following steps:
- Create new keys in config `accounts`, `extensions`  
- Remove `browser_path` from `options`
- Move `publish`, `client_id`, `client_secret` from `options` to `default` account
- Move all exntentions to `extension` section.
- Move `publish`, `zip`, `appID` from `options` of the extension to one level up
- Ask me, if something still broken :P

### Workflow
Read more about [Chrome Web Store Publish API](http://developer.chrome.com/webstore/using_webstore_api) and how to get Client ID and Client secret
+ execute `grunt webstore_upload` or `grunt webstore_upload:target` in order to upload zip files
+ browser should be opened
+ confirm privileges in browser ( we have to manually do this )
+ wait until uploading will be finished

To automatically pull a new access token using a refresh token just set the `refresh_token` property in your configuration.  If the `refresh_token` is present
it will automatically refresh the token for you without any manual intervention.


## Contributing
In lieu of a formal styleguide, take care to maintain the existing coding style. Add unit tests for any new or changed functionality. Lint and test your code using [Grunt](http://gruntjs.com/).

## Release History
0.8.9 `-m` and `onComplete` released

0.7.0 Allowed multiple accounts. Async multiple uploading. Redo configuration style.

0.5.1 Fix problem with path

0.5.0 Initial commit

## License
Copyright (c) 2014 Anton Sivolapov. Licensed under the MIT license.
