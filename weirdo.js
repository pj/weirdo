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

// known content types to options
var option_content_types = {
	"application/json": 'json',
	"text/html": 'html'
}

var extension_order = ["js", "ejs"];

var extension_handlers = {
	"js": function (candidate, data, cb) {
		var results = {};

		var render = null;

		function results_func(result) {
			results = result;
		}

		function render_func(render) {
			if (render !== null) {
				// double render error
				throw "Double render error";

			}
			return render;
		}

		function render_file_func(render) {
			if (render === null) {
				throw "Double render error";
			}
			return render;
		}

		// add functions to context.
		var context = vm.createContext({
			params: request.query,
			request: request,
			results: results_func,
			render: render_func,
			render_file: render_file_func
		});

		vm.runInContext(file, context);

		cb();
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
	b_score += b.options.indexOf(method) > 0 ? 1 : -1;

	a_score += -extension_order.indexOf(a.extension);
	b_score += -extension_order.indexOf(b.extension);

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

function check_config_cache (config_file, file) {
	return cache.get(config_file + "_" + file.directory);
}

function find_config_file(config_name, directory, parts, file, ids, explanation, context, cb) {
	if (parts.length == 0) {
		cb(null);
		return;
	}

	var check_path = parts.join(path.sep) + path.sep + config_name;

	fs.readFile(check_path, 'r', function (err, data) {
		if (err) {	
			find_config_file(config_name, directory, parts.slice(0,-1), cb);
		} else {
			// parse file
			var script = vm.createScript(data, check_path);

			// add to cache. - keyed by directory from url so possibly multiple copies of it.
			var cache_key = config_name + "_" + directory;

			var file = {
				name: config_name,
				path: check_path,
				data: data,
				script: script
			}

			cache.set(cache_key, file)

			vm.runInContext(script, context);

			cb(file, ids, explanation, context, cb);
		}
	});
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

			cache.get( cache_key, function( err, cache_file ){
				if( !err ){
					if (_.isEmpty(cache_file)) {
						directory_matcher("", path_parts, ids, explanation, cb)
					} else {
						cb(cache_file, path_parts, ids, explanation)
					}
				}
			});
		},

		// find files
		function (cache_file, parts, directory, ids, explanation, cb) {
			if ( cache_file ) {
				cb(cache_file, ids, explanation);
				return;
			}

			// should only be 1 or 0 parts left
			if (parts.length > 1) {
				throw "Requested url does not match path";
			}

			var part = parts.length === 0 ? "index" : parts[0]

			var file_name_regex = new RegExp("^" + part + "[.](\w+[.])*(\w+)$");

			fs.readdir(parts, function (err, files) {
				if (err) {
					throw err;
				}

				var candidates = [];

				files.forEach(function (file_name) {
					var file_match = file_name.match(regex);
					if (file_match !== null) {
						var file = {
									file_path: file_name,
									name: name,
									options: file_match[1].split(".").slice(0,-1),
									extension: file_match[2],
									directory: directory
								};

						candidates.append(file);
					}
				}

				// find best candidate.
				candidates.sort(candidateSorter);

				var candidate = candidates[0];

				// load file contents
				fs.readFile(directory + path.sep + file_name, function (err, data) {
					if (err) throw err;

					candidate.file_data = data;

					// add file to cache
					var cache_key = generate_cache_key(parts, request);

					cache.set(cache_key, candidates[0]);

					cb(candidate, ids, explanation, {})
				});
			});
		},

		// files to run before running main file - data is a holder that will get passed to the file 
		// as context
		// config.js - load database config etc
		function (file, ids, explanation, context, cb) {
			// check cache
			var config_file = check_config_cache("config", file);

			if (config_file !== null) {
				vm.runInContext(file, context);

				// check if we have rendered or redirected?


				cb(file, ids, explanation, context);
			} else {
				var directory = file.directory;

				var parts = directory.split(path.sep);

				// work up directory to find relevant file
				find_config_file("config.js", parts, file, ids, explanation, context, cb);
			}
		}

		// before.js - use for parsing content and any other stuff
		function (file, ids, explanation, context, cb) {
			cb(file, ids, explanation, context);
		}

		// session.js - generate
		function (file, ids, explanation, context, cb) {
			cb(file, ids, explanation, context);
		}

		// authentication.js
		function (file, ids, explanation, context, cb) {
			cb(file, ids, explanation, context);
		}

		// authorization.js
		function (file, ids, explanation, context, cb) {
			cb(file, ids, explanation, context);
		}

		// run main file
		function (file, ids, explanation, context, cb) {
			// find handler for file
			var handler = extension_handlers[file.extension];

			// run file
			handler(file, context);

			// set results
			if (context.result) {

			} else {

			}
		}

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