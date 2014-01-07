var assert = require("assert");
var should = require("should");
var url_processing = require("../lib/url_processing.js");

describe("Url Processing", function(){
	it("should split paths and ids out correctly", function (){
		var test_cases = [
			["/hello/world", ["hello", "world"], []], 
			["/hello/1234/world", ["hello", "world"], ["1234"]],
			["/hello/world/1234", ["hello", "world"], ["1234"]],
		    ["/hello/1234/world/5678", ["hello", "world"], ["1234", "5678"]]
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
});