'use strict';

var crypto = require('crypto'),
    path = require('path');

var clone = require('clone'),
    express = require('express'),
    mbtiles = require('mbtiles');

var utils = require('./utils');

module.exports = function(maps, options, prefix) {
  var app = express().disable('x-powered-by'),
      domains = options.domains,
      tilePath = '/{z}/{x}/{y}.pbf';

  var rootPath = path.join(process.cwd(), options.root || '');

  var mbtilesPath = options.mbtiles;
  var map = {
    tileJSON: {}
  };
  maps[prefix] = map;

  var source = new mbtiles(path.join(rootPath, mbtilesPath), function(err) {
    source.getInfo(function(err, info) {
      map.tileJSON['name'] = prefix.substr(1);

      Object.assign(map.tileJSON, info);

      map.tileJSON['tilejson'] = '2.0.0';
      map.tileJSON['basename'] = prefix.substr(1);
      map.tileJSON['format'] = 'pbf';

      Object.assign(map.tileJSON, options.options || {});
    });
  });

  var tilePattern = tilePath
    .replace('{z}', ':z(\\d+)')
    .replace('{x}', ':x(\\d+)')
    .replace('{y}', ':y(\\d+)');

  var getTile = function(z, x, y, callback) {
    source.getTile(z, x, y, function(err, data, headers) {
      if (err) {
        callback(err);
      } else {
        var md5 = crypto.createHash('md5').update(data).digest('base64');
        headers['content-md5'] = md5;
        headers['content-type'] = 'application/x-protobuf';
        headers['content-encoding'] = 'gzip';

        callback(null, data, headers);
      }
    });
  };

  app.get(tilePattern, function(req, res, next) {
    var z = req.params.z | 0,
        x = req.params.x | 0,
        y = req.params.y | 0;
    return getTile(z, x, y, function(err, data, headers) {
        if (err) {
          return next(err);
        }
        if (headers) {
          res.set(headers);
        }
        if (data == null) {
          return res.status(404).send('Not found');
        } else {
          return res.status(200).send(data);
        }
    }, res, next);
  });

  app.get('/index.json', function(req, res, next) {
    var info = clone(map.tileJSON);

    info.tiles = utils.getTileUrls(req.protocol, domains, req.headers.host,
                                   prefix, tilePath, info.format,
                                   req.query.key);

    return res.send(info);
  });

  return app;
};
