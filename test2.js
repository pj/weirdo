var vm = require("vm");
var fs = require("fs");
var file = fs.readFileSync("test.js").toString();
var context = vm.createContext({asdf: "asdf", console: console});
//vm.runInNewContext(file, context);

var script = vm.createScript(file);

try {
	var x = script.runInThisContext(context);
} catch (e) {
	console.log(e)
}


