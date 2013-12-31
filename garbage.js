// Easier to build a list of files than try to stat them during a request
var fileTree = {};

function generateFileTree() {
	console.log("Generating file tree");

	var newTree = {};
	Walker('.').on('dir', function(dir, stat) {
						var dir_split = dir.split(path.sep);
						currentPath = newTree;
						dir_split.forEach(function(part) {
							if (part in currentPath) {
								currentPath = currentPath[part];
							} else {
								newPath = {};
								currentPath[part] = newPath;

								currentPath = newPath;
							}
						});
					})
					.on('file', function(file, stat) {
						var dir_split = dir.split(path.sep);
						currentPath = newTree;
						dir_split.forEach(function(part) {
							if (part in currentPath) {
								currentPath = currentPath[part];
							} else {
								newPath = {};
								currentPath[part] = newPath;

								currentPath = newPath;
							}
						});


					})
					.on('error', function(er, entry, stat) {
						console.log('Got error ' + er + ' on entry ' + entry)
					}).on('end', function() {
						fileTree = newTree;
					})
	)
}


function findFiles(current_path, name) {
	var files = fs.readdirSync(current_path);

	var file_name_regex = new RegExp("^" + name + "[.](\w+[.])*(\w+)$");

	return files.filter(function(file_name) {
		var file_match = file_name.match(file_name_regex)
		if (file_match !== null) {
			var file_name = path.join(current_path, file_match[0]).isFile();

			if (fs.lstatSync(file_name).isFile()){
				return {
					file_path: file_name,
					name: name,
					options: file_match[1].split(".").slice(0,-1),
					extension: file_match[2]
				};
			}
		}
	});
}

function processPath(current_path, path_parts) {
	if (fs.lstatSync(path.join(current_path, path_parts[0])).isDirectory()) {
		// Directory exists and no more path parts or last parts is a blank string.
		if (path_parts.length === 1 || (path_parts.length === 2 && path_parts[1] === "")){
			return findFiles(current_path, "index");
		} else {
			return processPath(path.join(current_path, path_parts[0]), path_parts.slice(1));
		}
	} else if (path_parts.length === 1) {
		return findFiles(current_path, path_parts[0]);
	} else {
		throw new InvalidPathError(current_path);
	}
}