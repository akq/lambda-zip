#!/usr/bin/env node

'use strict';

const console = require('console');
const { pack } = require('../index');

var args = process.argv.slice(2);
if (args.length <= 4) {
    let i = 1;
    let opts = [{}];
    while(args.length > 0){
        let arg = args.shift()
        
        if(arg=='-a') opts[0].noaws=true;
        else if(arg=='-v') opts[0].verbose=true;
        else {
            opts[i++] = arg
        }
    }
    
    pack.apply(null, opts)
        .then(() => process.exit(0))
        .catch(error => {
            console.error(error);
            process.exit(1);
        });
} else {
    console.log('USAGE: lambda-zip <config> [<destination>] [-a] [-v]');
    console.log(' <config>: configuration file path to indicate which files is included or exluded');
    console.log(' <destination>: output zip file');
    console.log(' -a: exclude aws-sdk');
    console.log(' -v: verbose mode');
    process.exit(1);
}
