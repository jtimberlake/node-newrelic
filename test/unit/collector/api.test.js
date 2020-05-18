'use strict'

const tap = require('tap')

// TODO: convert to normal tap style.
// Below allows use of mocha DSL with tap runner.
tap.mochaGlobals()

const nock = require('nock')
const chai = require('chai')
const expect = chai.expect
const helper = require('../../lib/agent_helper')
const should = chai.should()
const CollectorApi = require('../../../lib/collector/api')

const HOST = 'collector.newrelic.com'
const PORT = 443
const URL = 'https://' + HOST
const RUN_ID = 1337

describe('CollectorAPI', function() {
  var api = null
  var agent = null

  beforeEach(function() {
    nock.disableNetConnect()
    agent = helper.loadMockedAgent({
      host: HOST,
      port: PORT,
      app_name: ['TEST'],
      ssl: true,
      license_key: 'license key here',
      utilization: {
        detect_aws: false,
        detect_pcf: false,
        detect_azure: false,
        detect_gcp: false,
        detect_docker: false
      },
      browser_monitoring: {},
      transaction_tracer: {}
    })
    agent.reconfigure = function() {}
    agent.setState = function() {}
    api = new CollectorApi(agent)
  })

  afterEach(function() {
    if (!nock.isDone()) {
      /* eslint-disable no-console */
      console.error('Cleaning pending mocks: %j', nock.pendingMocks())
      /* eslint-enable no-console */
      nock.cleanAll()
    }

    nock.enableNetConnect()
    helper.unloadAgent(agent)
  })

  // describe('reportSettings', function() {
  //   var bad
  //   var res
  //   var payload = {return_value: []}

  //   before(function(done) {
  //     api._agent.config.run_id = RUN_ID

  //     var mock = nock(URL)
  //       .post(helper.generateCollectorPath('agent_settings', RUN_ID))
  //       .reply(200, payload)

  //     api.reportSettings(function test(error, response) {
  //       bad = error
  //       res = response
  //       mock.done()
  //       done()
  //     })
  //   })

  //   after(function() {
  //     api._agent.config.run_id = undefined
  //   })

  //   it('should not error out', function() {
  //     should.not.exist(bad)
  //   })

  //   it('should return the expected `empty` response', function() {
  //     expect(res.payload).eql(payload.return_value)
  //   })
  // })

  // describe('errorData', function() {
  //   it('requires errors to send', (done) => {
  //     api.error_data(null, (err) => {
  //       expect(err)
  //         .to.be.an.instanceOf(Error)
  //         .and.have.property('message', 'must pass errors to send')
  //       done()
  //     })
  //   })

  //   it('requires a callback', function() {
  //     expect(function() { api.error_data([], null) })
  //       .to.throw('callback is required')
  //   })

  //   describe('on the happy path', function() {
  //     let bad = null
  //     let command = null
  //     var response = {return_value: []}

  //     before(function(done) {
  //       api._agent.config.run_id = RUN_ID
  //       var shutdown = nock(URL)
  //         .post(helper.generateCollectorPath('error_data', RUN_ID))
  //         .reply(200, response)

  //       var errors = [
  //         [
  //           0,                          // timestamp, which is always ignored
  //           'TestTransaction/Uri/TEST', // transaction name
  //           'You done screwed up',      // helpful, informative message
  //           'SampleError',              // Error type (almost always Error in practice)
  //           {},                         // request parameters
  //         ]
  //       ]

  //       api.error_data(errors, function test(error, res) {
  //         bad = error
  //         command = res

  //         shutdown.done()
  //         done()
  //       })
  //     })

  //     after(function() {
  //       api._agent.config.run_id = undefined
  //     })

  //     it('should not error out', function() {
  //       should.not.exist(bad)
  //     })

  //     it('should return retain state', function() {
  //       expect(command).to.have.property('retainData').eql(false)
  //     })
  //   })
  // })

  describe('sql_trace_data', function() {
    it('requires queries to send', (done) => {
      api.sql_trace_data(null, (err) => {
        expect(err)
          .to.be.an.instanceOf(Error)
          .and.have.property('message', 'must pass queries to send')
        done()
      })
    })

    it('requires a callback', function() {
      expect(function() { api.sql_trace_data([], null) })
        .to.throw('callback is required')
    })

    describe('on the happy path', function() {
      let bad = null

      var response = {return_value: []}

      before(function(done) {
        api._agent.config.run_id = RUN_ID
        var shutdown = nock(URL)
          .post(helper.generateCollectorPath('sql_trace_data', RUN_ID))
          .reply(200, response)

        var queries = [
          [
            'TestTransaction/Uri/TEST',
            '/TEST',
            1234,
            'select * from foo',
            '/Datastore/Mysql/select/foo',
            1,
            700,
            700,
            700,
            'compressed/bas64 params'
          ]
        ]

        api.sql_trace_data(queries, function test(error) {
          bad = error

          shutdown.done()
          done()
        })
      })

      after(function() {
        api._agent.config.run_id = undefined
      })

      it('should not error out', function() {
        should.not.exist(bad)
      })
    })
  })

  describe('analyticsEvents', function() {
    it('requires errors to send', (done) => {
      api.analytic_event_data(null, (err) => {
        expect(err)
          .to.be.an.instanceOf(Error)
          .and.have.property('message', 'must pass events to send')
        done()
      })
    })

    it('requires a callback', function() {
      expect(function() { api.analytic_event_data([], null) })
        .to.throw('callback is required')
    })

    describe('on the happy path', function() {
      let bad = null
      let command = null

      var response = {return_value: []}

      before(function(done) {
        api._agent.config.run_id = RUN_ID
        var endpoint = nock(URL)
          .post(helper.generateCollectorPath('analytic_event_data', RUN_ID))
          .reply(200, response)

        var transactionEvents = [
          RUN_ID,
          [{
            'webDuration': 1.0,
            'timestamp': 1000,
            'name': 'Controller/rails/welcome/index',
            'duration': 1.0,
            'type': 'Transaction'
          },{
            'A': 'a',
            'B': 'b',
          }]
        ]

        api.analytic_event_data(transactionEvents, function test(error, res) {
          bad = error
          command = res

          endpoint.done()
          done()
        })
      })

      after(function() {
        api._agent.config.run_id = undefined
      })

      it('should not error out', function() {
        should.not.exist(bad)
      })

      it('should return retain state', function() {
        expect(command).to.have.property('retainData').eql(false)
      })
    })
  })

  describe('metricData', function() {
    it('requires metrics to send', (done) => {
      api.metric_data(null, (err) => {
        expect(err)
          .to.be.an.instanceOf(Error)
          .and.have.property('message', 'must pass metrics to send')
        done()
      })
    })

    it('requires a callback', function() {
      expect(function() { api.metric_data([], null) })
        .to.throw('callback is required')
    })

    describe('on the happy path', function() {
      let bad = null
      let command = null

      var response = {return_value: []}

      before(function(done) {
        api._agent.config.run_id = RUN_ID
        var shutdown = nock(URL)
          .post(helper.generateCollectorPath('metric_data', RUN_ID))
          .reply(200, response)

        // would like to keep this set of tests relatively self-contained
        var metrics = {
          toJSON: function() {
            return [
              [{name: 'Test/Parent'},  [1,0.026,0.006,0.026,0.026,0.000676]],
              [{name: 'Test/Child/1'}, [1,0.012,0.012,0.012,0.012,0.000144]],
              [{name: 'Test/Child/2'}, [1,0.008,0.008,0.008,0.008,0.000064]]
            ]
          }
        }

        api.metric_data(metrics, function test(error, res) {
          bad = error
          command = res

          shutdown.done()
          done()
        })
      })

      after(function() {
        api._agent.config.run_id = undefined
      })

      it('should not error out', function() {
        should.not.exist(bad)
      })

      it('should return empty data array', function() {
        expect(command).to.have.property('retainData', false)
      })
    })
  })

  describe('transaction_sample_data', function() {
    it('requires slow trace data to send', (done) => {
      api.transaction_sample_data(null, (err) => {
        expect(err)
          .to.be.an.instanceOf(Error)
          .and.have.property('message', 'must pass traces to send')
        done()
      })
    })

    it('requires a callback', function() {
      expect(function() { api.transaction_sample_data([], null) })
        .to.throw('callback is required')
    })

    describe('on the happy path', function() {
      let bad = null

      var response = {return_value: []}

      before(function(done) {
        api._agent.config.run_id = RUN_ID
        var shutdown = nock(URL)
          .post(helper.generateCollectorPath('transaction_sample_data', RUN_ID))
          .reply(200, response)

        // imagine this is a serialized transaction trace
        var trace = []

        api.transaction_sample_data([trace], function test(error) {
          bad = error

          shutdown.done()
          done()
        })
      })

      after(function() {
        api._agent.config.run_id = undefined
      })

      it('should not error out', function() {
        should.not.exist(bad)
      })
    })
  })

  describe('shutdown', function() {
    it('requires a callback', function() {
      expect(function() { api.shutdown(null) }).to.throw('callback is required')
    })

    describe('on the happy path', function() {
      var bad = null
      var command = null

      var response = {return_value: null}

      before(function(done) {
        api._agent.config.run_id = RUN_ID
        var shutdown = nock(URL)
          .post(helper.generateCollectorPath('shutdown', RUN_ID))
          .reply(200, response)

        api.shutdown(function test(error, res) {
          bad = error
          command = res

          shutdown.done()
          done()
        })
      })

      after(function() {
        api._agent.config.run_id = undefined
      })

      it('should not error out', function() {
        should.not.exist(bad)
      })

      it('should return null', function() {
        expect(command).to.exist.and.have.property('payload', null)
      })
    })

    describe('off the happy path', function() {
      describe('fails on a 503 status code', function() {
        var captured = null
        var command = null

        beforeEach(function(done) {
          api._agent.config.run_id = RUN_ID
          var failure = nock(URL)
            .post(helper.generateCollectorPath('shutdown', RUN_ID))
            .reply(503)

          api.shutdown(function test(error, response) {
            captured = error
            command = response

            failure.done()
            done()
          })
        })

        afterEach(function() {
          api._agent.config.run_id = undefined
        })

        it('should have gotten an error', function() {
          expect(captured).to.be.null
        })

        it('should no longer have agent run id', function() {
          expect(api._agent.config.run_id).to.be.undefined
        })

        it('should tell the requester to shut down', () => {
          expect(command.shouldShutdownRun()).to.be.true
        })
      })
    })
  })

  describe('_runLifecycle', function() {
    let method = null

    beforeEach(function() {
      agent.config.run_id = 31337
      delete agent.reconfigure
      agent.stop = function(cb) {
        api.shutdown(cb)
      }

      method = api._methods.metrics
    })

    it('should bail out if disconnected', function(done) {
      api._agent.config.run_id = undefined

      function tested(error) {
        should.exist(error)
        expect(error.message).equals('Not connected to collector.')

        done()
      }

      api._runLifecycle(method, null, tested)
    })

    it('should discard HTTP 413 errors', function(done) {
      var failure = nock(URL)
        .post(helper.generateCollectorPath('metric_data', 31337))
        .reply(413)
      function tested(error) {
        should.not.exist(error)

        failure.done()
        done()
      }

      api._runLifecycle(method, null, tested)
    })

    it('should discard HTTP 415 errors', function(done) {
      var failure = nock(URL)
        .post(helper.generateCollectorPath('metric_data', 31337))
        .reply(415)
      function tested(error) {
        should.not.exist(error)

        failure.done()
        done()
      }

      api._runLifecycle(method, null, tested)
    })

    it('should discard 413 exceptions', function(done) {
      var failure = nock(URL)
        .post(helper.generateCollectorPath('metric_data', 31337))
        .reply(413)
      function tested(error, command) {
        should.not.exist(error)
        expect(command).to.have.property('retainData', false)

        failure.done()
        done()
      }

      api._runLifecycle(method, null, tested)
    })

    it('should retain after HTTP 500 errors', function(done) {
      var failure = nock(URL)
        .post(helper.generateCollectorPath('metric_data', 31337))
        .reply(500)
      function tested(error, command) {
        expect(error).to.not.exist
        expect(command).to.have.property('retainData', true)

        failure.done()
        done()
      }

      api._runLifecycle(method, null, tested)
    })

    it('should retain after HTTP 503 errors', function(done) {
      var failure = nock(URL)
        .post(helper.generateCollectorPath('metric_data', 31337))
        .reply(503)
      function tested(error, command) {
        expect(error).to.not.exist
        expect(command).to.have.property('retainData', true)

        failure.done()
        done()
      }

      api._runLifecycle(method, null, tested)
    })

    it('should indicate a restart and discard data after 401 errors', (done) => {
      // Call fails.
      const metrics = nock(URL)
        .post(helper.generateCollectorPath('metric_data', 31337))
        .reply(401)

      // Execute!
      api._runLifecycle(method, null, (error, command) => {
        expect(error).to.not.exist

        metrics.done()

        expect(command).to.have.property('retainData', false)
        expect(command.shouldRestartRun()).to.be.true

        done()
      })
    })

    describe('on 409 status', function() {
      it('should indicate reconnect and discard data', function(done) {
        const restart = nock(URL)
          .post(helper.generateCollectorPath('metric_data', 31337))
          .reply(409, {return_value: {}})

        api._runLifecycle(method, null, function(error, command) {
          if (error) {
            console.error(error.stack) // eslint-disable-line no-console
          }
          expect(error).to.not.exist
          expect(command).to.have.property('retainData', false)
          expect(command.shouldRestartRun()).to.be.true

          restart.done()
          done()
        })
      })
    })

    it('should stop the agent on 410 (force disconnect)', function(done) {
      var restart = nock(URL)
        .post(helper.generateCollectorPath('metric_data', 31337))
        .reply(410)
      var shutdown = nock(URL)
        .post(helper.generateCollectorPath('shutdown', 31337))
        .reply(200, {return_value: null})

      function tested(error, command) {
        expect(error).to.not.exist
        expect(command.shouldShutdownRun()).to.be.true

        expect(api._agent.config).property('run_id').to.not.exist

        restart.done()
        shutdown.done()
        done()
      }

      api._runLifecycle(method, null, tested)
    })

    it('should retain data after maintenance notices', function(done) {
      var exception = {
        exception: {
          message: 'Out for a smoke beeearrrbeee',
          error_type: 'NewRelic::Agent::MaintenanceError'
        }
      }

      var failure = nock(URL)
        .post(helper.generateCollectorPath('metric_data', 31337))
        .reply(503, exception)
      function tested(error, command) {
        expect(error).to.not.exist
        expect(command).to.have.property('retainData', true)

        failure.done()
        done()
      }

      api._runLifecycle(method, null, tested)
    })

    it('should retain data after runtime errors', function(done) {
      var exception = {
        exception: {
          message: 'What does this button do?',
          error_type: 'RuntimeError'
        }
      }

      var failure = nock(URL)
        .post(helper.generateCollectorPath('metric_data', 31337))
        .reply(500, exception)
      function tested(error, command) {
        expect(error).to.not.exist
        expect(command).to.have.property('retainData', true)

        failure.done()
        done()
      }

      api._runLifecycle(method, null, tested)
    })

    it('should not retain data after unexpected errors', function(done) {
      var failure = nock(URL)
        .post(helper.generateCollectorPath('metric_data', 31337))
        .reply(501)
      function tested(error, command) {
        expect(error).to.not.exist
        expect(command).to.have.property('retainData', false)

        failure.done()
        done()
      }

      api._runLifecycle(method, null, tested)
    })
  })
})


tap.test('reportSettings', (t) => {
  t.autoend()

  let agent = null
  let collectorApi = null

  let settings = null

  const emptySettingsPayload = {
    return_value: []
  }

  t.beforeEach((done) => {
    agent = setupMockedAgent()
    agent.config.run_id = RUN_ID
    collectorApi = new CollectorApi(agent)

    nock.disableNetConnect()

    settings = nock(URL)
      .post(helper.generateCollectorPath('agent_settings', RUN_ID))
      .reply(200, emptySettingsPayload)

    done()
  })

  t.afterEach((done) => {
    if (!nock.isDone()) {
      /* eslint-disable no-console */
      console.error('Cleaning pending mocks: %j', nock.pendingMocks())
      /* eslint-enable no-console */
      nock.cleanAll()
    }

    nock.enableNetConnect()

    helper.unloadAgent(agent)
    agent = null
    collectorApi = null

    done()
  })

  t.test('should not error out', (t) => {
    collectorApi.reportSettings((error) => {
      t.error(error)

      settings.done()

      t.end()
    })
  })

  t.test('should return the expected `empty` response', (t) => {
    collectorApi.reportSettings((error, res) => {
      t.deepEqual(res.payload, emptySettingsPayload.return_value)

      settings.done()

      t.end()
    })
  })
})

tap.test('errorData', (t) => {
  t.autoend()

  t.test('requires errors to send', (t) => {
    const agent = setupMockedAgent()
    const collectorApi = new CollectorApi(agent)

    t.tearDown(() => {
      helper.unloadAgent(agent)
    })

    collectorApi.error_data(null, (err) => {
      t.ok(err)
      t.equal(err.message, 'must pass errors to send')

      t.end()
    })
  })

  t.test('requires a callback', (t) => {
    const agent = setupMockedAgent()
    const collectorApi = new CollectorApi(agent)

    t.tearDown(() => {
      helper.unloadAgent(agent)
    })

    t.throws(() => { collectorApi.error_data([], null) }, new Error('callback is required'))
    t.end()
  })

  t.test('receiving 200 response, with valid data', (t) => {
    t.autoend()

    let agent = null
    let collectorApi = null

    let errorDataEndpoint = null

    const errors = [
      [
        0,                          // timestamp, which is always ignored
        'TestTransaction/Uri/TEST', // transaction name
        'You done screwed up',      // helpful, informative message
        'SampleError',              // Error type (almost always Error in practice)
        {},                         // request parameters
      ]
    ]

    t.beforeEach((done) => {
      agent = setupMockedAgent()
      agent.config.run_id = RUN_ID
      collectorApi = new CollectorApi(agent)

      nock.disableNetConnect()

      const response = {return_value: []}

      errorDataEndpoint = nock(URL)
        .post(helper.generateCollectorPath('error_data', RUN_ID))
        .reply(200, response)

      done()
    })

    t.afterEach((done) => {
      if (!nock.isDone()) {
        /* eslint-disable no-console */
        console.error('Cleaning pending mocks: %j', nock.pendingMocks())
        /* eslint-enable no-console */
        nock.cleanAll()
      }

      nock.enableNetConnect()

      helper.unloadAgent(agent)
      agent = null
      collectorApi = null

      done()
    })

    t.test('should not error out', (t) => {
      collectorApi.error_data(errors, (error) => {
        t.error(error)

        errorDataEndpoint.done()

        t.end()
      })
    })

    t.test('should return retain state', (t) => {
      collectorApi.error_data(errors, (error, res) => {
        const command = res

        t.equal(command.retainData, false)

        errorDataEndpoint.done()

        t.end()
      })
    })
  })
})

function setupMockedAgent() {
  const agent = helper.loadMockedAgent({
    host: HOST,
    port: PORT,
    app_name: ['TEST'],
    ssl: true,
    license_key: 'license key here',
    utilization: {
      detect_aws: false,
      detect_pcf: false,
      detect_azure: false,
      detect_gcp: false,
      detect_docker: false
    },
    browser_monitoring: {},
    transaction_tracer: {}
  })
  agent.reconfigure = function() {}
  agent.setState = function() {}

  return agent
}
