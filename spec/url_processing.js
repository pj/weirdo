var assert = require("assert");
var should = require("should");
var url_processing = require("../lib/url_processing.js");
var NodeCache = require("node-cache");

function create_context() {
    context = {};
    context.request = null;
	context.response = null;
	context.cache = new NodeCache();

	// var url_split = url.parse(request.url, true).pathname.split("/");

	// // First item is blank.
	// url_split.splice(0, 1);

	// context.url_split = url_split;
	context.ids = [];
	context.explanation = [];
	context.path_parts = [];
}

function generate_url_test_callback(directory, file_name) {
	return function (err, cache_file, context) {
			should.not.exist(err);
			should.not.exist(cache_file);
			context.should.have.property("directory").with.eql(directory);
			context.should.have.property("url_file_name").with.eql(file_name);
		};
}

function generate_url_test_context(parts) {
	return {
				path_parts: parts,
				request: {method: 'GET', headers: {'content_type': "text/html"}},
				cache: new NodeCache()
			};
}

function run_find_directory_test(test_context, callback) {
	try {
		process.chdir("spec/fixtures/directories");
		test_context.base_path = process.cwd();
		url_processing.find_directory(test_context, callback);
	} finally {
		process.chdir('../../..')
	}
}


function generate_file_test_callback(done, file_name, options, extension) {
	return function (err, context) {
			should.not.exist(err);
			context.should.have.property("file").with.property("file_name").eql(file_name);
			context.should.have.property("file").with.property("options").eql(options);
			context.should.have.property("file").with.property("extension").eql(extension);
			done();
		};
}

function generate_file_test_context(directory, url_file_name, method, content_type, path_parts) {
	return {
				directory: directory,
				url_file_name: url_file_name, 
				request: {method: method, headers: {'content_type': content_type}},
				path_parts: path_parts,
				cache: new NodeCache()
			};
}

function run_find_file_test(test_context, callback) {
	try {
		process.chdir("spec/fixtures/directories");
		test_context.base_path = process.cwd();
		url_processing.find_script_file(null, test_context, callback);
	} finally {
		process.chdir('../../..')
	}
}

describe("Url Processing", function(){
	it("should split paths and ids out correctly", function (){
		var test_cases = [
			["/hello/world", ["hello", "world"], []], 
			["/hello/1234/world", ["hello", "world"], ["1234"]],
			["/hello/world/1234", ["hello", "world"], ["1234"]],
		    ["/hello/1234/world/5678", ["hello", "world"], ["1234", "5678"]],
		    ["/hello/1234/6543/world/5678", ["hello", "world"], ["1234", "6543", "5678"]]
		];

		var context = null;
		var err = null;

		function test_cb (e, ctx) {
			err = e;
			context = ctx;
		}

		test_cases.forEach(function (test_case){
			url_processing.find_path_parts(null, {url: test_case[0]}, null, test_cb);

			context.should.have.property('path_parts').with.eql(test_case[1]);
			context.should.have.property('ids').with.eql(test_case[2]);
			should.not.exist(err);
		});
	});

	it("should find the correct directory for an url", function (){
		run_find_directory_test(
			generate_url_test_context(["hello", "world"]), 
			generate_url_test_callback("hello", "world")
		);

		run_find_directory_test(
			generate_url_test_context(["test"]), 
			generate_url_test_callback(".", "test")
		);
		
		run_find_directory_test(
			generate_url_test_context([""]), 
			generate_url_test_callback(".", "index")
		);

		run_find_directory_test(
			generate_url_test_context(["hello"]), 
			generate_url_test_callback("hello", "index")
		);

		run_find_directory_test(
			generate_url_test_context(["other", "thing", "blah"]), 
			generate_url_test_callback("other/thing", "blah")
		);

		// TODO: test error conditions.

		// TODO: test url cache.
	});

	it("should find the correct file for an url", function (done){
		function dummy_done(){}

		run_find_file_test(
			generate_file_test_context("hello", "world", "GET", "text/html",  ["hello", "world"]),
			generate_file_test_callback(dummy_done, "world.js", [], "js")
		);

		run_find_file_test(
			generate_file_test_context(".", "test", "GET", "text/html",  ["test"]),
			generate_file_test_callback(done, "test.js", [], "js")
		);

		// TODO: test error conditions

		// TODO: test prevention of running config files

		// TODO: test caching
	});
});