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

let getFiles = () => (
    { include, ignore }) => globby(include, { cwd: process.cwd(), ignore, nodir: true }
);

function getPackageInfo(packageFile) {
    return readFile(packageFile, 'utf-8')
        .then(content => JSON.parse(content))
        .catch(error => {
            console.error(`Failed to read ${packageFile}, with error: ${JSON.stringify(error)}`);
            return JSON.parse("{}");
        });
}

function getDefaultOuputFilename() {
    let at = resolvePathRelativeTo();
    let packageFile = at('package.json');
    return getPackageInfo(packageFile).then(packageInfo => `${packageInfo.name}.zip`);
}

function flatten(arr) {
  return arr.reduce(function (flat, toFlatten) {
    return flat.concat(Array.isArray(toFlatten) ? flatten(toFlatten) : toFlatten);
  }, []);
}

function getTransitiveDependencies(dependencies, module) {
    let at = resolvePathRelativeTo();
    if (!dependencies.find(d => d === module)) {
        dependencies.push(module);
        return getPackageInfo(at('node_modules/'+module+'/package.json'))
            .then(modulePackage => Object.keys(modulePackage.dependencies || {})
                                    .concat(Object.keys(modulePackage._phantomChildren || {}))
                                    .concat(Object.keys(modulePackage.bundledDependencies || {}))
                                    )
            .then(deps => { 
            	return Promise.map(deps, (dep) => getTransitiveDependencies( dependencies, dep));
            })
            .then(flatten);
    } else {
        return Promise.resolve([]);
    }
}

function getPackageDependencies({ opt}) {
    let at = resolvePathRelativeTo();
	
    return getPackageInfo(at('package.json'))
        .then(rootPackage => Object.keys(rootPackage.dependencies || {})
                                .concat(Object.keys(rootPackage._phantomChildren || {}))
                                .concat(Object.keys(rootPackage.bundledDependencies || {}))
                                )
        .then(rootDependencies => {
            let totalDependencies = [];        
            if(opt.noaws){
                rootDependencies = rootDependencies.filter(dep => dep!='aws-sdk')
            }   
        	return Promise.all(
                rootDependencies
                .map(dep => getTransitiveDependencies(totalDependencies, dep)))
        		.then(() => totalDependencies );
        })
        .then(flatten);
}

function getGlobPatterns({ source, opt }) {
    let at = resolvePathRelativeTo();

    let ignorePatterns = readFile(at(source), 'utf-8')
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

    let includePatterns = getPackageDependencies({ opt })
        .then(dependencies => dependencies.map(x => `node_modules/${x}/**`))
        .then(pattern => {
            return  DEFAULT_INCLUDE_PATTERNS.concat(pattern);
        });

    return Promise.all([includePatterns, ignorePatterns])
        .then(([include, ignore]) => ({ include, ignore }));
}

function zipFiles({ destination, opt }) {
    let at = resolvePathRelativeTo();
    let vb = opt && opt.verbose;
    return files => new Promise((resolve, reject) => {
        let archive = archiver.create('zip');
        archive.on('error', error => reject(error));
        let output = fs.createWriteStream(destination);
        output.on('close', function() {
            if(vb){
                console.log('-----------------')
                console.log(archive.pointer() + ' total bytes');
            }
            console.log('Lambda-zip Successfully Done! ');
            resolve()
          });
        archive.pipe(output)//.on('end', () => resolve());
        files
            .filter(f => { return f !== destination })
            .forEach(file => {
                if(vb)
                    console.log(file);
                return archive.file(at(file), { name: file })
            })
        if(vb)
            console.log('\tWriting to disk....')
        archive.finalize();
        

    });
}

function pack(opt, source, destination) {
    let files = getGlobPatterns({ source, opt })
        .then(getFiles());

    let outputFilename = destination
        ? Promise.resolve(destination)
        : getDefaultOuputFilename()

    return Promise.all([outputFilename, files])
        .then(([destination, files]) => zipFiles({ destination, opt })(files));
}

module.exports = {
    getFiles,
    getGlobPatterns,
    pack,
    zipFiles,
}
