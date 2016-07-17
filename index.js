const fs = require('fs')

const log    = require('npmlog')
const npm    = require('npm')
const semver = require('semver')

log.heading = 'publish';


const BASE_URL = 'https://registry.npmjs.org/'


function start(tagName, callback) {
  var loadOptions = {};
  if (tagName) {
    log.info('Using tag', tagName);
    loadOptions.tag = tagName;
  }

  npm.load(loadOptions, function (err) {
    callback(err, npm);
  });
};

function localPackage(callback) {
  try {
    var json = require(process.cwd()+'/package.json');
  } catch (err) {
    return callback(err);
  }

  callback(null, json);
}

function remoteVersion(localPackage, callback) {
  npm.commands.view([localPackage.name, 'version'], true, function (err, message) {
    if (err) {
      if (err.code === 'E404') {
        return callback('You have not published yet your first version of this'+
                        ' module: publish will do nothing\n' +
                 'You must publish manually the first release of your module');
      }

      return callback(err);
    }

    for (var remoteVersion in message) break;  // Hack?
    if (remoteVersion) {
      return callback(null, remoteVersion);
    }

    callback('No version of this package has yet been published for tag "' +
             npm.config.get('tag') + '".\n' +
             'You must publish manually the first release of your module');
  });
}

function publish(options, callback) {
  localPackage(function(err, pkg) {
    if (err)
      return callback('publish can only be performed from the root of npm modules (where the package.json resides)');

    var localVersion = pkg.version;
    if (localVersion == null)
      return callback('you have not defined a version in your npm module, check your package.json');

    remoteVersion(pkg, function(err, remoteVersion) {
      if (err)
        return callback(err);

      if (shouldPublish(options, localVersion, remoteVersion) && !options.test) {
        if (!isCI())
          return npmPublish(callback);

        log.info('running in CI server');
        var npmUser = npmUserCredentials();
        if (!npmUser)
          return callback('npm user credentials not found, make sure NPM_USERNAME, NPM_PASSWORD and NPM_EMAIL environment variables are set');

        npmAddUser(npmUser, function(err) {
          if (err)
            return callback('error while trying to add npm user in CI server: ' + err);

          npmPublish(callback);
        });
      }
    });
  });
};


function npmPublish(callback) {
  npm.commands.publish([], false, function (err, message) {
    if (err) {
      log.error('publish failed:', message);
      return callback(err);
    }

    log.info('published ok');
    callback();
  });
}

function npmUserCredentials() {
  const username = process.env.NPM_USERNAME
  const password = process.env.NPM_PASSWORD
  const email    = process.env.NPM_EMAIL

  if (username && password && email) {
    return {username, password, email}
  }
}

function isCI() {
  return process.env.CI;
}

function npmAddUser(auth, callback) {
  npm.registry.adduser(BASE_URL, {auth}, function(err) {
    npm.config.set("email", auth.email, "user");
    callback(err);
  });
}

function shouldPublish(options, localVersion, remoteVersion) {
  options = options || {};

  log.info('Local version: ' + localVersion);
  log.info('Published version: ' + remoteVersion);

  if (semver.eq(remoteVersion, localVersion)) {
    log.info('Your local version is the same as your published version: publish will do nothing');
    return false;
  }

  if (semver.gt(remoteVersion, localVersion)) {
    log.warn('Your local version is smaller than your published version: publish will do nothing');
    return false;
  }

  if (containsOnVersion(options)) {
    var diff = semver.diff(remoteVersion, localVersion);
    if (!options['on-' + diff]) {
      log.info('Your local version does not satisfy your --on-[major|minor|patch|build] options; publish will do nothing');
      return false;
    }
  }

  log.info('Defined criteria met; publish will release a new version');
  return true;
}

function containsOnVersion(options) {
  return options['on-major'] || options['on-minor'] || options['on-patch'] || options['on-build'];
}


exports.localPackage  = localPackage;
exports.publish       = publish
exports.remoteVersion = remoteVersion;
exports.shouldPublish = shouldPublish;
exports.start         = start
