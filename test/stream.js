'use strict';

require('chai').should();

var bunyan = require('bunyan'),
    bunyanRollbar = require('../'),
    http = require('http'),
    Rollbar = require('rollbar'),
    rollbar = new Rollbar('dummy_key'),
    sinon = require('sinon'),
    should = require('chai').should();

describe('bunyan-rollbar', function() {
  beforeEach(function() {
    this.rollbarCriticalStub = sinon.stub(rollbar, 'critical', function() {
    });
    this.rollbarErrorStub = sinon.stub(rollbar, 'error', function() {
    });
    this.rollbarWarningStub = sinon.stub(rollbar, 'warning', function() {
    });
    this.rollbarInfoStub = sinon.stub(rollbar, 'info', function() {
    });
    this.rollbarDebugStub = sinon.stub(rollbar, 'debug', function() {
    });
  });

  afterEach(function() {
    this.rollbarCriticalStub.restore();
    this.rollbarErrorStub.restore();
    this.rollbarWarningStub.restore();
    this.rollbarInfoStub.restore();
    this.rollbarDebugStub.restore();
  });

  describe('raw type requirement', function() {
    it('throws error if the stream is not raw', function() {
      var logger = bunyan.createLogger({
        name: 'mylogger',
        streams: [
          {
            level: 'trace',
            stream: new bunyanRollbar.Stream(rollbar)
          },
        ],
      });

      (function() {
        logger.info('testing');
      }).should.throw('requires a raw stream');
    });

    it('performs logging if stream is raw', function() {
      var logger = bunyan.createLogger({
        name: 'mylogger',
        streams: [
          {
            level: 'trace',
            type: 'raw',
            stream: new bunyanRollbar.Stream(rollbar)
          },
        ],
      });

      (function() {
        logger.info('testing');
      }).should.not.throw(Error);
    });
  });

  describe('rollbar payload', function() {
    before(function() {
      this.logger = bunyan.createLogger({
        name: 'mylogger',
        streams: [
          {
            level: 'trace',
            type: 'raw',
            stream: new bunyanRollbar.Stream(rollbar)
          },
        ],
      });
    });

    it('sends rollbar the message separate from the custom payload', function() {
      this.logger.info('testing');
      this.rollbarInfoStub.callCount.should.eql(1);
      this.rollbarErrorStub.callCount.should.eql(0);

      var call = this.rollbarInfoStub.getCall(0);
      call.args[0].should.eql('testing');
      should.not.exist(call.args[2].custom.msg);
    });

    it('sends rollbar the message parameter even if an error instance is provided too', function() {
      this.logger.info({ err: new Error('oops') }, 'testing');
      this.rollbarInfoStub.callCount.should.eql(1);
      this.rollbarErrorStub.callCount.should.eql(0);

      var call = this.rollbarInfoStub.getCall(0);
      call.args[0].should.be.an.instanceOf(Error);
      call.args[2].custom.msg.should.eql('testing');
    });

    it('sends rollbar all other data as the custom payload', function() {
      this.logger.info({ foo: 'bar' }, 'testing');
      this.rollbarInfoStub.callCount.should.eql(1);
      this.rollbarErrorStub.callCount.should.eql(0);

      var call = this.rollbarInfoStub.getCall(0);
      call.args[0].should.eql('testing');

      var custom = call.args[2].custom;
      Object.keys(custom).sort().should.eql([
        'foo',
        'hostname',
        'level',
        'name',
        'pid',
        'time',
        'v',
      ]);
      call.args[2].custom.foo.should.eql('bar');
    });
  });

  describe('log levels', function() {
    before(function() {
      this.logger = bunyan.createLogger({
        name: 'mylogger',
        streams: [
          {
            level: 'trace',
            type: 'raw',
            stream: new bunyanRollbar.Stream(rollbar)
          },
        ],
      });
    });

    it('trace becomes debug', function() {
      this.logger.trace('testing');
      this.rollbarDebugStub.callCount.should.eql(1);

      var call = this.rollbarDebugStub.getCall(0);
      call.args[2].level.should.eql('debug');
    });

    it('debug becomes debug', function() {
      this.logger.debug('testing');
      this.rollbarDebugStub.callCount.should.eql(1);

      var call = this.rollbarDebugStub.getCall(0);
      call.args[2].level.should.eql('debug');
    });

    it('info becomes info', function() {
      this.logger.info('testing');
      this.rollbarInfoStub.callCount.should.eql(1);

      var call = this.rollbarInfoStub.getCall(0);
      call.args[2].level.should.eql('info');
    });

    it('warn becomes warning', function() {
      this.logger.warn('testing');
      this.rollbarWarningStub.callCount.should.eql(1);

      var call = this.rollbarWarningStub.getCall(0);
      call.args[2].level.should.eql('warning');
    });

    it('error becomes error', function() {
      this.logger.error('testing');
      this.rollbarErrorStub.callCount.should.eql(1);

      var call = this.rollbarErrorStub.getCall(0);
      call.args[2].level.should.eql('error');
    });

    it('fatal becomes critical', function() {
      this.logger.fatal('testing');
      this.rollbarCriticalStub.callCount.should.eql(1);

      var call = this.rollbarCriticalStub.getCall(0);
      call.args[2].level.should.eql('critical');
    });
  });

  describe('serializers', function() {
    before(function() {
      this.logger = bunyan.createLogger({
        name: 'mylogger',
        serializers: bunyanRollbar.stdSerializers,
        streams: [
          {
            level: 'trace',
            type: 'raw',
            stream: new bunyanRollbar.Stream(rollbar)
          },
        ],
      });
    });

    it('sends rollbar the original error object and does not duplicate the error data', function() {
      this.logger.info({ err: new Error('oops') }, 'testing');
      this.rollbarInfoStub.callCount.should.eql(1);
      this.rollbarErrorStub.callCount.should.eql(0);

      var call = this.rollbarInfoStub.getCall(0);
      call.args[0].should.be.an.instanceof(Error);
      should.not.exist(call.args[2].custom.err);
      call.args[2].custom.msg.should.eql('testing');
    });

    it('sends rollbar the original request object and does not duplicate the request data', function(done) {
      var req, res;
      var server = http.createServer(function(request, response) {
        req = request;
        res = response;
        res.writeHead(200, {'Content-Type': 'text/plain'});
        res.end('Hello World\n');
      });

      server.listen(8765, function () {
        http.get({ host: '127.0.0.1', port: 8765, path: '/' }, function() {
          this.logger.info({ req: req }, 'testing');
          this.rollbarInfoStub.callCount.should.eql(1);
          this.rollbarErrorStub.callCount.should.eql(0);

          var call = this.rollbarInfoStub.getCall(0);
          call.args[0].should.eql('testing');
          should.not.exist(call.args[2].custom.req);
          call.args[1].should.be.an('object');
          should.exist(call.args[1].headers);

          server.close();
          done();
        }.bind(this));
      }.bind(this));
    });

    it('can send rollbar an error and request object at the same time', function(done) {
      var req, res;
      var server = http.createServer(function(request, response) {
        req = request;
        res = response;
        res.writeHead(200, {'Content-Type': 'text/plain'});
        res.end('Hello World\n');
      });

      server.listen(8765, function () {
        http.get({ host: '127.0.0.1', port: 8765, path: '/' }, function() {
          this.logger.info({ err: new Error('oops'), req: req }, 'testing');
          this.rollbarInfoStub.callCount.should.eql(1);
          this.rollbarErrorStub.callCount.should.eql(0);

          var call = this.rollbarInfoStub.getCall(0);
          call.args[0].should.be.an.instanceof(Error);
          should.not.exist(call.args[2].custom.err);
          should.not.exist(call.args[2].custom.req);
          call.args[1].should.be.an('object');
          should.exist(call.args[1].headers);

          server.close();
          done();
        }.bind(this));
      }.bind(this));
    });
  });
});
