'use strict';

const joi = require('joi');
const errs = require('errs');

const buildSchema = joi.object().keys({
  'name': joi.string().required(),
  'dist-tags': joi.object().required(),
  '_attachments': joi.object().required()
}).unknown(true);

const buildOneSchema = joi.object().keys({
  name: joi.string().required(),
  env: joi.string().required(),
  version: joi.string().required(),
  locale: joi.string().required()
}).unknown(true);

//
// Define routes.
//
module.exports = function routes(app, options, done) {
  app.perform('actions', function performRoutes(next) {
    app.contextLog.verbose('Adding application routes');

    //
    // ### /healthcheck
    // Simple healthcheck
    //
    app.routes.get('/healthcheck(.html)?', function (req, res) {
      res.end('ok');
    });

    app.routes.post('/catchup', function catchup(req, res) {
      const env = req.body.env;
      if (!env) {
        return app.terminate(res, errs.create('No env specified', {
          code: 400
        }));
      }

      app.scheduler.schedule(env, (err, counts) => {
        if (err) return app.terminate(res, err);

        app.contextLog.info('Scheduled catch up builds', counts);
        return res.status(201).json(counts);
      });
    });

    app.routes.post('/build-one', function buildOne(req, res) {

      joi.validate(req.body || {}, buildOneSchema, (err, data) => {
        if (err) return app.terminate(res, err);

        app.construct.buildOne(data, (err) => {
          if (err) {
            return void app.contextLog.error('Failed to build', err);
          }
        }).pipe(res);
      });
    });
    //
    // ### /build
    // Trigger a build. This route assume `npm publish` like JSON that contains
    // the package.json and the package's content as binary blob in `attachments`.
    //
    app.routes.post('/build', function build(req, res) {

      //
      // TODO: Add some retry to the API client underneath
      //
      function change() {
        app.feedsme.change(req.body.env || 'dev', {
          data: req.body
        }, function posted(error) {
          return error
            ? app.contextLog.error('Failed to process changes', error)
            : app.contextLog.info('Changes processed');
        });
      }

      //
      // Check some basic properties that always should be present.
      //
      joi.validate(req.body || {}, buildSchema, function validated(error, data) {
        if (error) {
          return void app.terminate(res, error);
        }

        return app.construct.build(data, function building(err) {
          if (err) {
            return void app.contextLog.error('Failed to build', err);
          }

          app.contextLog.info('Build finished, sending change for %s', data.name);
          return void change();
        }).pipe(res);
      });
    });

    next();
  }, done);
};
