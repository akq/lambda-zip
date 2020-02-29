It was mainly designed to help deploy node.js functions to AWS Lambda.

When deploying node.js codes to AWS lambda, all dependent modules needed to be included. 
But if you simply zip all content node_modules/ folder, the final media may be messed up with some dev dependencies.
So to exclude the dev dependencies, initially I found [node-pack-zip](https://github.com/Merlin-Taylor/node-pack-zip)
, but @jogoussard found this repo did not support transitive dependencies (see [issue#2](https://github.com/Merlin-Taylor/node-pack-zip/issues/2)).
and then he forked and created [node-repack-zip](https://github.com/jogoussard/node-repack-zip).

As the .packignore config file in original design only did files exclusion, but in my case, I only need to specify which files should be included.
So I modified [node-repack-zip](https://github.com/jogoussard/node-repack-zip) repo, and created a new one. You should explicitly specify the files you want to include or exclude in the config files.


## Installation

`npm install --save-dev lambda-zip`



## Example

_my-lambda_ is an npm package I want to run as an AWS Lambda Function.

Install _lambda-zip_ locally in _my-lambda_
```
npm install --save-dev lambda-zip
```

Install any runtime dependencies of _my-lambda_.
```
npm install
```
Add a config file in the root of _my-lambda_, let's say _.dev_
it's content will be like .gitignore, using ! to exclude files, for example

```
index.js
lib/**/*
proj/**/*
!lib/test.js
```

Modify _my-lambda/package.json_:
```JSON
"scripts": {
    "build-aws-lambda": "lambda-zip .dev lambda.zip -a -v"
    ...
}
```

Create the lambda.zip file containing _my-lambda_ and all its dependencies, ready to be uploaded to AWS Lambda
```
npm run build-aws-lambda
```

## Release notes
* 0.3.2 - refine the original codes  
  add excluding aws-sdk option  
  add verbose mode option and some running information

* 0.3.1 - remove .packignore file, and all files are not included by default.

* 0.2.5 - Added support for root module _phantomChildren dependencies.

* 0.2.4 - Initial published release

