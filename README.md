# webstore-upload

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

```js
grunt.initConfig({
    webstore_upload: {
        options: {
            //publish item right after uploading. default false
            publish: true,
            client_id: "825744-pahfq9kedhu44m02kb3e6vqe1qea06ss.apps.googleusercontent.com",
            client_secret: "60sFIDYi9boePm",
            //any browser path. Escape backslashes!
            browser_path: "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe"
        },
        "extension1": {
            options: {
                publish: false,
                //required
                appID: "likcefedeabhphiljpplijjln",
                //required, we can use dir name and upload most recent zip file
                zip: "build/extension1"
            }
        },
        "extension2": {
            options: {
                appID: "knjdjdmgphlcdagojmbcipla",
                zip: "build/extension2"
            }
        }
    }
})
```

### Options

#### options.publish
Make item available at Chrome Webstore or not
Type: `Boolean`
Default value: `false`

#### options.client_id
[How to get it](http://developer.chrome.com/webstore/using_webstore_api#beforeyoubegin)
Client ID to access to Chrome Console API
Type: `String`
Required

#### options.client_secret
[How to get it](http://developer.chrome.com/webstore/using_webstore_api#beforeyoubegin)
Client Secret to access to Chrome Console API
Type: `String`
Required

#### options.browser_path
Path to Browser executed file
Type: `String`
Required

#### options.appID
Extension id or Application id at Chrome Webstore
Type: `String`
Required

#### options.zip
Path to zip file. Upload most recent zip file in case of path is directory
Type: `String`
Required

### Workflow
Read more about [Chrome Web Store Publish API](http://developer.chrome.com/webstore/using_webstore_api) and how to get Client ID and Client secret
+ execute `grunt webstore_upload` or `grunt webstore_upload:target` in order to upload zip files
+ browser should be opened
+ confirm privileges in browser ( we have to manually do this )
+ wait until uploading will be finished




## Contributing
In lieu of a formal styleguide, take care to maintain the existing coding style. Add unit tests for any new or changed functionality. Lint and test your code using [Grunt](http://gruntjs.com/).

## Release History
0.5.1 Fix problem with path
0.5.0 Initial commit

## License
Copyright (c) 2014 Anton Sivolapov. Licensed under the MIT license.
