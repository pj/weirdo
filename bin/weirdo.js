#!/usr/bin/env node

console.log("Starting Weirdo!");

var connect = require('connect'), 
       http = require('http'),
       path = require('path'),
       vm   = require('vm'),
       ejs  = require('ejs'),
       Walker = require("walker"),
       NodeCache = require("node-cache"),
       async = require('async'),
       url = require('url'),
       renderers = require("./renderers.js"),
       url_processing = require("./url_processing.js");

var file_cache = new NodeCache();

fs.watch(".", function(event, filename){
	file_cache.flush();
});

// known content types to options
var option_content_types = {
	"application/json": 'json',
	"text/html": 'html'
}

var extension_order = ["js", "ejs"];

function handler(request, response, next) {
	async.waterfall([
		// start
		function (cb) {
			url_processing.find_path_parts(cache, request, response, cb);
		},

		// find directory from path
		url_processing.find_directory,

		// find files
		url_processing.find_file,

		// files to run before running main file - data is a holder that will get passed to the file 
		// as context
		// config.js - load database config etc
		function (context, cb) {
			url_processing.run_config_file("config.js", context, cb);
		},

		// before.js - use for parsing content and any other stuff
		function (context, cb) {
			url_processing.run_config_file("before.js", context, cb);
		},

		// session.js - generate
		function (context, cb) {
			url_processing.run_config_file("session.js", context, cb);
		},

		// authentication.js
		function (context, cb) {
			url_processing.run_config_file("authentication.js", context, cb);
		},

		// authorization.js
		function (context, cb) {
			url_processing.run_config_file("authorization.js", context, cb);
		},

		// run main file
		url_procssing.run_main_file

		// if file didn't render anything search for a rendering file.

		// render layout files
		// layout.ejs

		// header.ejs

		// nav.ejs

		// footer.ejs

		// put it all together

		// post processing
		// after.js
	],
	function (err, result) {
		console.log(err);
		console.log(result);
		next();
	});
}

var app = connect()
  .use(connect.logger())
  .use(connect.errorHandler())
  .use(connect.directory(''))
  .use(connect.cookieParser())
  .use(connect.session({ secret: 'my secret here' }))
  .use(connect.urlencoded())
  .use(connect.query())
  .use(handler);

http.createServer(app).listen(3000);