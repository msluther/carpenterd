'use strict';

const path = require('path');
const fs = require('fs');
const spawn = require('child_process').spawn;
const once = require('one-time');
const npm = path.join(require.resolve('npm'), '..', '..', 'bin', 'npm-cli.js');

const assign = Object.assign;

exports.install = function (opts, callback) {
  const { log, spec, installPath, pkgDir, userconfig } = opts;
  const done = once(callback);
  const env = assign({}, process.env);

  env.NODE_ENV = ~['prod', 'latest'].indexOf(spec.env)
    ? 'production'
    : 'development';

  const logs = {
    stdout: path.join(installPath, 'stdout.log'),
    stderr: path.join(installPath, 'stderr.log')
  };

  log.info('npm logs available for spec: %s@%s', spec.name, spec.version, logs);

  // Danger zone - spawn the child process running ./npm.js
  const child = spawn(process.execPath, ['--max_old_space_size=8192', npm]
    .concat(['install', `--userconfig=${userconfig}`]), {
    env: env,
    cwd: pkgDir
  });

  function onFileError(type, path) {
    return (err) => {
      log.error(`npm install ${type} filestream error for ${path}`, {
        message: err.message,
        stack: err.stack,
        code: err.code
      });
    };
  }

  child.on('error', done);
  child.stderr.pipe(fs.createWriteStream(logs.stderr))
    .on('error', onFileError('stderr', logs.stderr));
  child.stdout.pipe(fs.createWriteStream(logs.stdout))
    .on('error', onFileError('stdout', logs.stdout));

  child.on('close', (code) => {
    if (code !== 0) {
      return fs.readFile(logs.stderr, 'utf8', function (err, text) {
        const msg = text || (err && err.message) || `Could not read ${logs.stderr}`;
        done(new Error(`npm exited with code ${code} ${msg}`));
      });
    }

    return done();
  });

};

