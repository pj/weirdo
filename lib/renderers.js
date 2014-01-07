module.exports = {
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

