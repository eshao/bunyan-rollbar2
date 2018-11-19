'use strict'

var _ = require('lodash')

// Rollbar uses slightly different error levels than Bunyan.
// https://rollbar.com/docs/custom-log-messages/
var levelMapping = {
  10: 'debug',
  20: 'debug',
  30: 'info',
  40: 'warning',
  50: 'error',
  60: 'critical'
}

var isRequest = function (object) {
  if (!object) {
    return false
  }
  return ['headers', 'protocol', 'url', 'method', 'body', 'route'].some(function (key) {
    return object[key] !== undefined
  })
}

var BunyanRollbar = function () {
  this.initialize.apply(this, arguments)
}

_.extend(BunyanRollbar.prototype, {
  initialize: function (rollbar) {
    this.rollbar = rollbar
  },

  write: function (record) {
    if (!_.isObject(record)) {
      throw new Error('bunyan-rollbar requires a raw stream. Please define the type as raw when setting up the bunyan-rollbar stream.')
    }

    // If Bunyan has serialized the Error object, try to retrieve the real
    // error object to send to Rollbar, so it can process the error object
    // itself. This requires use of the customized
    // bunyanRollbar.stdSerializers.
    var error
    if (record.err && record.err._bunyanRollbarOriginalObject && (record.err._bunyanRollbarOriginalObject instanceof Error)) {
      error = record.err._bunyanRollbarOriginalObject
    } else if (record.err && (record.err instanceof Error)) {
      error = record.err
    }

    // Similar to above, but for the request object. Try to retrieve the real
    // request object to send to Rollbar.
    var request
    if (record.req && record.req._bunyanRollbarOriginalObject && isRequest(record.req._bunyanRollbarOriginalObject)) {
      request = record.req._bunyanRollbarOriginalObject
    } else if (record.req && isRequest(record.req)) {
      request = record.req
    }

    var level = levelMapping[record.level] || 'error'

    var payload = {
      level: level,
      custom: record
    }

    // If we're sending Rollbar the real error or request objects, remove those
    // references from the custom playload so there's not duplicate data.
    if (error) {
      payload.custom = _.omit(payload.custom, 'err')
    }
    if (request) {
      payload.custom = _.omit(payload.custom, 'req')
    }

    // *request* must precede *payload* even if undefined
    // so that the payload isn't confused with the request
    if (error) {
      this.rollbar[level](error, request, payload)
    } else {
      payload.custom = _.omit(payload.custom, 'msg')
      this.rollbar[level](record.msg, request, payload)
    }
  }
})

// Define our own copy of the bunyan.stdSerializers but patch the 'err' and
// 'req' serializers so we can maintain access to the original error or request
// objects for sending to Rollbar (since Rollbar's API has it's own custom
// handling of those two types of objects).
var patchSerializer = function (originalSerializer) {
  return function (object) {
    // Call the original serializer.
    var serialized = originalSerializer(object)

    // If the original serializer did serialize this object, store the original
    // object on a special '_bunyanRollbarOriginalObject' property of the
    // serialized object. Using defineProperty should ensure that this object
    // is available for us to access, but won't show up in the JSON
    // serialization of the serialized data.
    if (serialized !== object && _.isPlainObject(serialized)) {
      Object.defineProperty(serialized, '_bunyanRollbarOriginalObject', {
        value: object
      })
    }

    return serialized
  }
}

module.exports.patchSerializer = patchSerializer
module.exports.Stream = BunyanRollbar
