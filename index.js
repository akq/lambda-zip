'use strict';

const archiver = require('archiver');
const console = require('console');
const fs = require('fs');
const globby = require('globby');
const path = require('path');
const Promise = require('bluebird');

const readFile = Promise.promisify(fs.readFile);

const DEFAULT_IGNORE_PATTERNS = [
];

const DEFAULT_INCLUDE_PATTERNS = [
    '!node_modules/**'
];

let resolvePathRelativeTo = (() => {
    let pcwd = process.cwd();
    return cwd => path.resolve.bind(path, cwd || pcwd);
})();

let getFiles = ({ cwd }) => (
    { include, ignore }) => globby(include, { cwd: cwd || process.cwd(), ignore, nodir: true }
);

function getPackageInfo(packageFile) {
    return readFile(packageFile, 'utf-8')
        .then(content => JSON.parse(content))
        .catch(error => {
            console.error(`Failed to read ${packageFile}`);
            return Promise.reject(error);
        });
}

function getDefaultOuputFilename({ cwd }) {
    let at = resolvePathRelativeTo(cwd);
    let packageFile = at('package.json');
    return getPackageInfo(packageFile).then(packageInfo => `${packageInfo.name}.zip`);
}

function flatten(arr) {
  return arr.reduce(function (flat, toFlatten) {
    return flat.concat(Array.isArray(toFlatten) ? flatten(toFlatten) : toFlatten);
  }, []);
}

function getTransitiveDependencies({ cwd }, dependencies, module) {
    let at = resolvePathRelativeTo(cwd);
    if (!dependencies.find(d => d === module)) {
        dependencies.push(module);
        return getPackageInfo(at('node_modules/'+module+'/package.json'))
            .then(modulePackage => Object.keys(modulePackage.dependencies || {})
                                    .concat(Object.keys(modulePackage._phantomChildren || {})))
            .then(deps => { 
            	return Promise.map(deps, (dep) => { 
               		return getTransitiveDependencies({ cwd }, dependencies, dep);
               	});
            })
            .then(flatten);
    } else {
      return Promise.resolve([]);
    }
}

function getPackageDependencies({ cwd }) {
    let at = resolvePathRelativeTo(cwd);
	
    return getPackageInfo(at('package.json'))
        .then(rootPackage => Object.keys(rootPackage.dependencies || {})
                                .concat(Object.keys(rootPackage._phantomChildren || {})))
        .then(rootDependencies => {
			let totalDependencies = [];            
        	return Promise.all(rootDependencies.map(dep => getTransitiveDependencies({ cwd }, totalDependencies, dep)))
        		.then(() => { return totalDependencies;} );
        })
        .then(flatten);
}

function getGlobPatterns({ cwd, opt }) {
    let at = resolvePathRelativeTo(cwd);


    let ignorePatterns = readFile(at(opt), 'utf-8')
        .then(txt => txt.split('\n').map(line => line.trim()).filter(line => {
            let keep = false;
            if(line.length > 0){
                if(line[0] == '!'){
                    DEFAULT_IGNORE_PATTERNS.push(line.substr(1))
                    keep = true;
                }
                else
                    DEFAULT_INCLUDE_PATTERNS.push(line)
            }
            return keep;
        }))
        .catch(error => error.code === 'ENOENT' ? Promise.resolve([]) : Promise.reject(error))
        .then(() => {
            if(DEFAULT_INCLUDE_PATTERNS.length == 1)
                DEFAULT_INCLUDE_PATTERNS.unshift('**/*');
            return DEFAULT_IGNORE_PATTERNS
        })
        // .then(pattern => {
        //         DEFAULT_IGNORE_PATTERNS.concat(pattern)
        // });

    let includePatterns = getPackageDependencies({ cwd })
        .then(dependencies => dependencies.map(x => `node_modules/${x}/**`))
        .then(pattern => (
            DEFAULT_INCLUDE_PATTERNS.concat(pattern)
        ))
        ;
    // let ignorePatterns = readFile(at('.packignore'), 'utf-8')
    //     .then(txt => txt.split('\n').map(line => line.trim()).filter(line => line.length > 0))
    //     .catch(error => error.code === 'ENOENT' ? Promise.resolve([]) : Promise.reject(error))
    //     .then(ignorePatterns => DEFAULT_IGNORE_PATTERNS.concat(ignorePatterns))



    return Promise.all([includePatterns, ignorePatterns])
        .then(([include, ignore]) => ({ include, ignore }));
}

function zipFiles({ cwd, destination }) {
    let at = resolvePathRelativeTo(cwd);

    return files => new Promise((resolve, reject) => {
        let archive = archiver.create('zip');
        archive.on('error', error => reject(error));
        archive.pipe(fs.createWriteStream(destination)).on('end', () => resolve());
        files
            .filter(f => { return f !== destination })
            .forEach(file => {
                console.log(file);
                return archive.file(at(file), { name: file })
            });
        archive.finalize();
    });
}

function pack({ source, destination, opt }) {
    let files = getGlobPatterns({ cwd: source, opt })
        .then(getFiles({ cwd: source }));

    let outputFilename = destination
        ? Promise.resolve(destination)
        : getDefaultOuputFilename({ cwd: source })

    return Promise.all([outputFilename, files])
        .then(([destination, files]) => zipFiles({ cwd: source, destination })(files));
}

module.exports = {
    getFiles,
    getGlobPatterns,
    pack,
    zipFiles,
}
