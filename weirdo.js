#!/usr/bin/env node

console.log("Starting Weirdo!");

var connect = require('connect'), 
       http = require('http'),
       path = require('path'),
       vm   = require('vm'),
       ejs  = require('ejs'),
       Walker = require("walker"),
       NodeCache = require("node-cache"),
       async;

var file_cache = new NodeCache();

fs.watch(".", function(event, filename){
	file_cache.flush();
});

function InvalidPathError(message) {  
    this.message = message;  
}  
InvalidPathError.prototype = new Error();  
InvalidPathError.prototype.constructor = InvalidPathError; 

// a list of regexes to check against path segments to determine if they are ids.
var id_regexes = [new RegExp("^\d+$")];

function matchIdRegex(part) {
	id_regexes.forEach(function(regex){
		var id_match = part.match(regex);

		if (id_match !== null) {
			return regex;
		}
	});

	return null;
}

function checkFiles(candidates, regex, file_name) {
	files.forEach(function (file_name) {
		var file_match = file_name.match(regex);
		if (file_match !== null) {
			candidates.append({
						file_path: file_name,
						name: name,
						options: file_match[1].split(".").slice(0,-1),
						extension: file_match[2]
					});
		}
	}
}

function urlMatcher(url, cb) {
	var url_parts = url.split("/");

	// first is blank
	var url_parts.pop();

	var current_path = "";

	var ids = [];
	var explanation = [];
	var candidates = [];

	function matcher() {
		if (url_parts.length == 0) {
			cb(candidates, ids, explanation);
			return;
		}

		var part = url_parts.pop();

		// Check if part is an id
		var matching_regex = matchIdRegex(part);

		if (matching_index !== null) {
			explanation.append("<id> " + matching_regex.toString() + " " + part);
			ids.append(part);
			matcher();
			return;
		}

		fs.lstat(path.join(current_path, part), function (err, stats) {
			// not found - try and find files
			if (err !== null) {
				var file_name_regex = new RegExp("^" + part + "[.](\w+[.])*(\w+)$");

				fs.readdir(path_parts, function (err, files) {
					checkFiles(candidates, file_name_regex, files);
					
					matcher();
				});
			// Make sure it's a directory
			} else if (stats.isDirectory()) {
				// is the last part an index file?
				if (url_parts.length === 0 || (url_parts.length === 1 && url_parts[0] === "")){
					var file_name_regex = new RegExp("^index[.](\w+[.])*(\w+)$");

					fs.readdir(path_parts, function (err, files) {
						checkFiles(candidates, file_name_regex, files);
						
						matcher();
					}); 
				} else {
					matcher();
				}
			} else {
				cb(explanation, null, null, null);
			}
		});
    }

    return matcher;
}

// known content types to options
var option_content_types = {
	"application/json": 'json',
	"text/html": 'html'
}

var extension_order = ["js", "ejs"];

var extension_handlers = {
	"js": function (candidate, data, handlerCB) {
		fs.readFile(candidate.file_path, function (err, file) {
			if (err !== null) {
				handlerCB(err, null, null);
				return;
			}
			
			var results = {};

			var render = null;

			function results_func(result) {
				results = result;
			}

			function render_func(render) {
				if (render !== null) {
					// double render error
				}
				return render;
			}

			function render_file_func(render) {
				if (render === null) {
					// double render error
				}
				return render;
			}

			// create file context
			var context = vm.createContext({
				params: request.query,
				request: request,
				results: results_func,
				render: render_func,
				render_file: render_file_func
			});

			// run script
			try {
				vm.runInContext(file, context);
			} catch (e) {
				handlerCB(e, null, null)
			}

			// work out results

		});
	},

	"ejs": function (candidate, data, handlerCB) {
		ejs.from_file(candidate.file_path, function(err, template) {
			if (err !== null) {
				handlerCB(err, null);
				return
			}

			try {
  				template(data);
			} catch (e) {
				handlerCB(e, null);
			}
		});

	}
}

function candidateSorter (a, b) {
	var a_score = a.options.indexOf(option_content_type) > 0 ? 1 : -1;
	var b_score = b.options.indexOf(option_content_type) > 0 ? 1 : -1;

	a_score += a.options.indexOf(method) > 0 ? 1 : -1;
	b_score = b.options.indexOf(method) > 0 ? 1 : -1;

	a_score = -extension_order.indexOf(a.extension);
	b_score = -extension_order.indexOf(b.extension);

	if (a_score == b_score) {
		throw new InvalidPathError("Unable to select file");
	} else {
		return a_score > b_score ? 1 : -1;
	}
}

function directory_matcher(current_path, parts, ids, explanation, cb) {
    var part = parts.pop();

	var new_path = path.join(current_path, part);

	fs.lstat(new_path, function (err, stats) {
		if (err !== null) {
			throw err;
		}

		// if it's a directory continue
		if (stats.isDirectory()) {
			directory_matcher(new_path, parts, ids, explanation, cb);
		} else {
			cb(parts, current_path, ids, explanation);
		}
	});
}

function generate_cache_key (path_parts, request) {
	var method = request.method;
	var content_type = request.headers['content_type'];
	var option_content_type = option_content_types[content_type];

	return path_parts.join("_") + "_" + method + "_" + content_type;
}

function handler(request, response, next) {
	async.waterfall([
		// start
		function (cb) {
			var url = require('url').parse(request.url, true);

			var url_split = url.split("/");

			// First item is blank.
			url_split.pop();

			var ids = [];

			var explanation = [];

			var path_parts = [];

			// strip anything that looks like an id from the path
			url_split.forEach (function (part){
				var matching_regex = matchIdRegex(part);
				if (matching_index !== null) {
					explanation.append("<id> " + matching_regex.toString() + " " + part);
					ids.append(part);
				} else {
					path_parts.append(part);
				}
			});

			cb(path_parts);
		},
		// find directory from path
		function (path_parts, ids, explanation, cb) {
			// check cache
			var cache_key = generate_cache_key(path_parts, request);

			cache.get( cache_key, function( err, value ){
				if( !err ){
					if (_.isEmpty(value)) {
						directory_matcher("", path_parts, ids, explanation, cb)
					} else {

					}
				}
			});
		},

		// find files
		function (cache_file, parts, directory, ids, explanation, cb) {
			if ( cache_file ) {
				cb()
			}

			// should only be 1 or 0 parts left
			if (parts.length > 1) {
				throw "Requested url does not match path";
			}

			var part = parts.length === 0 ? "index" : parts[0]

			var file_name_regex = new RegExp("^" + part + "[.](\w+[.])*(\w+)$");

			fs.readdir(parts, function (err, files) {
				if (err !== null) {
					throw err;
				}

				var candidates = [];

				files.forEach(function (file_name) {
					var file_match = file_name.match(regex);
					if (file_match !== null) {
						candidates.append({
									file_path: file_name,
									name: name,
									options: file_match[1].split(".").slice(0,-1),
									extension: file_match[2]
								});
					}
				}

				// find best candidate.
				cb()
			});
		},

		// files to run before running main file
		// config.js - load database config etc
		function () {
			// check cache

		}

		// before.js - use for parsing content and any other stuff
		function () {
			// check cache

		}

		// session.js - generate
		function () {
			// check cache

		}

		// authentication.js
		function () {
			// check cache

		}

		// authorization.js
		function () {
			// check cache

		}

		// run main file

		// if file didn't render anything search for a rendering file

		// layout files
		// layout.ejs

		// header.ejs

		// nav.ejs

		// footer.ejs

		// post processing
		// after.js
	],
	function (err, result) {

	});

	// handle files - have to locate the file before we can handle any of the 
	// other options like before and config.
	function urlMatcherCB(err, candidates, ids, explanation) {
		var method = request.method;
		var content_type = request.headers['content_type'];
		var option_content_type = option_content_types[content_type];

		var sorted_candidates = candidate_files.sort(candidateSorter);

		var candidate = sorted_candidates[0];

		// Run pre files
		// config.js - load database config etc

		// before.js - use for parsing content and any other stuff

		// session.js - generate

		// authentication.js

		// authorization.js

		// find handler for candidate
		var handler = extension_handlers[candidate.extension];

		function handlerCB(err, data, render) {
			// handle errors
			if (err !== null ){

			}

			// layout.ejs

			// header.ejs

			// nav.ejs

			// footer.ejs

			// after.js

			next();
		}

		handler(candidate, handlerCB);
	}

	urlMatcher(url, urlMatcherCB, urlMatcherError);
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