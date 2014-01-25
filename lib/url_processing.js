
var connect = require('connect'), 
       http = require('http'),
       path = require('path'),
       vm   = require('vm'),
       ejs  = require('ejs'),
       Walker = require("walker"),
       NodeCache = require("node-cache"),
       async = require('async'),
       url = require('url'),
       fs = require('fs');

function InvalidPathError(message) {  
    this.message = message;  
}  
// InvalidPathError.prototype = new Error();  
// InvalidPathError.prototype.constructor = InvalidPathError; 

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
	});
}

function directory_matcher(current_path, parts, context, cb) {
	if (parts.length === 0) {
		var part = "index";
	} else {
		var part = parts[0];
	}

	var new_path = path.join(current_path, part);

	fs.lstat(path.join(context.base_path, new_path), function (err, stats) {
		if (err !== null) {
			if (err.code === 'ENOENT') {
				// should only be 1 or 0 parts left
				if (parts.length > 1) {
					cb("Requested url does not match path", null, null);
				}

				context.url_file_name = part;
				// this ensures that '.' is produced on blank paths
				context.directory = path.join(current_path);

				cb(null, null, context);
			} else {
				cb(err, null, null);
			}
		} else {
			// if it's a directory continue
			if (stats.isDirectory()) {
				directory_matcher(new_path, parts.slice(1), context, cb);
			} else {
				cb("path matches but is not a directory", null, null);
			}
		}
	});
}

// known content types to options
var option_content_types = {
	"application/json": 'json',
	"text/html": 'html'
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

// a list of regexes to check against path segments to determine if they are ids.
var id_regexes = [/^\d+$/];

function matchIdRegex(part) {
	var result = null;

	id_regexes.forEach(function(regex){
		var id_match = part.match(regex);

		if (id_match !== null) {
			result = regex;
			return;
		}
	});

	return result;
}

// Finds the parts of the url that are non id related
function find_path_parts (cache, request, response, cb) {
	var context = {};

	context.base_path = process.cwd();

	context.request = request;
	context.response = response;
	context.cache = cache;

	var url_split = url.parse(request.url, true).pathname.split("/");

	// First item is blank.
	url_split.splice(0, 1);

	context.url_split = url_split;
	context.ids = [];
	context.explanation = [];
	context.path_parts = [];

	// strip anything that looks like an id from the path
	context.url_split.forEach (function (part){
		var match_result = matchIdRegex(part);

		if (match_result !== null) {
			context.explanation.push("<id> " + match_result.toString() + " " + part);
			context.ids.push(part);
		} else {
			context.path_parts.push(part);
		}
	});

	cb(null, context);
}

function isEmpty(obj) {
  return Object.keys(obj).length === 0;
}

function find_directory (context, cb) {
	// check cache
	var cache_key = generate_cache_key(context.path_parts, context.request);

	context.cache.get( cache_key, function( err, cache_file ){
		if( !err ){
			if (isEmpty(cache_file)) {
				directory_matcher("", context.path_parts.slice(0), context, cb);
			} else {
				cb(null, cache_file, context);
			}
		} else {
			cb(err, null, null);
		}
	});
}

var CONTENT_TYPE_MAP = {
	"text/html": "html",
	"application/json": "json"
};

// var extension_order = ["js", "ejs"];

function find_script_file(cache_file, context, cb ) {
	if ( cache_file ) {
		cb(cache_file, context);
		return;
	}

	var content_type = context.request.headers["Content-Type"];

	function candidateSorter(a, b) {
		var a_score = a.options.indexOf(CONTENT_TYPE_MAP[content_type]) > 0 ? 1 : -1;
		var b_score = b.options.indexOf(CONTENT_TYPE_MAP[content_type]) > 0 ? 1 : -1;

		a_score += a.options.indexOf(context.request.method.toLowerCase()) > 0 ? 1 : -1;
		b_score += b.options.indexOf(context.request.method.toLowerCase()) > 0 ? 1 : -1;

		// a_score += -extension_order.indexOf(a.extension);
		// b_score += -extension_order.indexOf(b.extension);

		if (a_score == b_score) {
			throw new InvalidPathError("Unable to select file");
		} else {
			return a_score > b_score ? 1 : -1;
		}
	}

	// var file_name_regex = new RegExp("^" + context.url_file_name + "\.([a-zA-Z]+\.)+([a-zA-Z]+)$");//"[.](\w+[.])*(\w+)$");

	// console.log(file_name_regex);

	fs.readdir(path.join(context.base_path, context.directory), function (err, files) {
		if (err) {
			cb(err, null);
		}

		context.candidates = [];

		files.forEach(function (file_name) {
			var file_split = file_name.split(".");

			if (file_split[0] === context.url_file_name) {
				var file = {
							file_name: file_name,
							options: file_split.slice(1, -1),
							extension: file_split[file_split.length-1],
						};

				context.candidates.push(file);
			}
		});

		if (context.candidates.length === 0) {
			cb("No files found", null);
		}

		// find best candidate.
		context.candidates.sort(candidateSorter);

		context.file = context.candidates[0];

		// load file contents
		fs.readFile(path.join(context.base_path, context.directory, context.file.file_name), function (err, data) {
			if (err) {
				cb(err, null);
			}

			context.file.file_data = data;


			// add file to cache
			var cache_key = generate_cache_key(context.path_parts, context.request);

			context.cache.set(cache_key, context.file);

			context.script_context = {};

			cb(null, context)
		});
	});
}

function run_config_file(config_file_name, context, cb) {
	// check cache
	var config_file = check_config_cache(config_file_name, context.file);

	if (config_file !== null) {
		vm.runInContext(file, context.script_context);

		// check if we have rendered or redirected?


		cb(null, context);
	} else {
		// work up directory to find relevant file
		find_config_file(config_file_name, context.path_parts.slice(0), context, cb);
	}
}

function run_main_file(context, cb) {
	// find handler for file
	var handler = extension_handlers[file.extension];

	// run file
	handler(file, context);

	// set results or redirect.
	if (context.result) {
		response.end(context.result);
	} else {
		cb("No result from running script.", null);
	}
}

exports.run_main_file = run_main_file;
exports.run_config_file = run_config_file;
exports.find_file = find_file;
exports.find_directory = find_directory;
exports.find_path_parts = find_path_parts;
exports.find_config_file = find_config_file;