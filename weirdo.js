#!/usr/bin/env node

console.log("Starting Weirdo!");

var connect = require('connect'), 
       http = require('http'),
       path = require('path'),
       vm   = require('vm'),
       ejs  = require('ejs'),
       Walker = require("walker");

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

function handler(request, response, next) {
	var url = require('url').parse(request.url, true);

	var url_split = url.split("/");

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