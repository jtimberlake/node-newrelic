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

tap.test('error_data', (t) => {
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

tap.test('sql_trace_data', (t) => {
  t.autoend()

  t.test('requires queries to send', (t) => {
    const agent = setupMockedAgent()
    const collectorApi = new CollectorApi(agent)

    t.tearDown(() => {
      helper.unloadAgent(agent)
    })

    collectorApi.sql_trace_data(null, (err) => {
      t.ok(err)
      t.equal(err.message, 'must pass queries to send')

      t.end()
    })
  })

  t.test('requires a callback', (t) => {
    const agent = setupMockedAgent()
    const collectorApi = new CollectorApi(agent)

    t.tearDown(() => {
      helper.unloadAgent(agent)
    })

    t.throws(() => { collectorApi.sql_trace_data([], null) }, new Error('callback is required'))
    t.end()
  })

  t.test('receiving 200 response, with valid data', (t) => {
    t.autoend()

    let agent = null
    let collectorApi = null

    let sqlTraceEndpoint = null

    const queries = [
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

    t.beforeEach((done) => {
      agent = setupMockedAgent()
      agent.config.run_id = RUN_ID
      collectorApi = new CollectorApi(agent)

      nock.disableNetConnect()

      const response = {return_value: []}

      sqlTraceEndpoint = nock(URL)
        .post(helper.generateCollectorPath('sql_trace_data', RUN_ID))
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
      collectorApi.sql_trace_data(queries, (error) => {
        t.error(error)

        sqlTraceEndpoint.done()

        t.end()
      })
    })

    t.test('should return retain state', (t) => {
      collectorApi.sql_trace_data(queries, (error, res) => {
        const command = res

        t.equal(command.retainData, false)

        sqlTraceEndpoint.done()

        t.end()
      })
    })
  })
})

tap.test('analytic_event_data (transaction events)', (t) => {
  t.autoend()

  t.test('requires events to send', (t) => {
    const agent = setupMockedAgent()
    const collectorApi = new CollectorApi(agent)

    t.tearDown(() => {
      helper.unloadAgent(agent)
    })

    collectorApi.analytic_event_data(null, (err) => {
      t.ok(err)
      t.equal(err.message, 'must pass events to send')

      t.end()
    })
  })

  t.test('requires a callback', (t) => {
    const agent = setupMockedAgent()
    const collectorApi = new CollectorApi(agent)

    t.tearDown(() => {
      helper.unloadAgent(agent)
    })

    t.throws(
      () => { collectorApi.analytic_event_data([], null) },
      new Error('callback is required')
    )

    t.end()
  })

  t.test('receiving 200 response, with valid data', (t) => {
    t.autoend()

    let agent = null
    let collectorApi = null

    let analyticEventEndpoint = null

    const transactionEvents = [
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

    t.beforeEach((done) => {
      agent = setupMockedAgent()
      agent.config.run_id = RUN_ID
      collectorApi = new CollectorApi(agent)

      nock.disableNetConnect()

      const response = {return_value: []}

      analyticEventEndpoint = nock(URL)
        .post(helper.generateCollectorPath('analytic_event_data', RUN_ID))
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
      collectorApi.analytic_event_data(transactionEvents, (error) => {
        t.error(error)

        analyticEventEndpoint.done()

        t.end()
      })
    })

    t.test('should return retain state', (t) => {
      collectorApi.analytic_event_data(transactionEvents, (error, res) => {
        const command = res

        t.equal(command.retainData, false)

        analyticEventEndpoint.done()

        t.end()
      })
    })
  })
})

tap.test('metric_data', (t) => {
  t.autoend()

  t.test('requires metrics to send', (t) => {
    const agent = setupMockedAgent()
    const collectorApi = new CollectorApi(agent)

    t.tearDown(() => {
      helper.unloadAgent(agent)
    })

    collectorApi.metric_data(null, (err) => {
      t.ok(err)
      t.equal(err.message, 'must pass metrics to send')

      t.end()
    })
  })

  t.test('requires a callback', (t) => {
    const agent = setupMockedAgent()
    const collectorApi = new CollectorApi(agent)

    t.tearDown(() => {
      helper.unloadAgent(agent)
    })

    t.throws(
      () => { collectorApi.metric_data([], null) },
      new Error('callback is required')
    )

    t.end()
  })

  t.test('receiving 200 response, with valid data', (t) => {
    t.autoend()

    let agent = null
    let collectorApi = null

    let metricsEndpoint = null

    const metrics = {
      toJSON: function() {
        return [
          [{name: 'Test/Parent'},  [1,0.026,0.006,0.026,0.026,0.000676]],
          [{name: 'Test/Child/1'}, [1,0.012,0.012,0.012,0.012,0.000144]],
          [{name: 'Test/Child/2'}, [1,0.008,0.008,0.008,0.008,0.000064]]
        ]
      }
    }

    t.beforeEach((done) => {
      agent = setupMockedAgent()
      agent.config.run_id = RUN_ID
      collectorApi = new CollectorApi(agent)

      nock.disableNetConnect()

      const response = {return_value: []}

      metricsEndpoint = nock(URL)
        .post(helper.generateCollectorPath('metric_data', RUN_ID))
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
      collectorApi.metric_data(metrics, (error) => {
        t.error(error)

        metricsEndpoint.done()

        t.end()
      })
    })

    t.test('should return retain state', (t) => {
      collectorApi.metric_data(metrics, (error, res) => {
        const command = res

        t.equal(command.retainData, false)

        metricsEndpoint.done()

        t.end()
      })
    })
  })
})

tap.test('transaction_sample_data (transaction trace)', (t) => {
  t.autoend()

  t.test('requires slow trace data to send', (t) => {
    const agent = setupMockedAgent()
    const collectorApi = new CollectorApi(agent)

    t.tearDown(() => {
      helper.unloadAgent(agent)
    })

    collectorApi.transaction_sample_data(null, (err) => {
      t.ok(err)
      t.equal(err.message, 'must pass traces to send')

      t.end()
    })
  })

  t.test('requires a callback', (t) => {
    const agent = setupMockedAgent()
    const collectorApi = new CollectorApi(agent)

    t.tearDown(() => {
      helper.unloadAgent(agent)
    })

    t.throws(
      () => { collectorApi.transaction_sample_data([], null) },
      new Error('callback is required')
    )

    t.end()
  })

  t.test('receiving 200 response, with valid data', (t) => {
    t.autoend()

    let agent = null
    let collectorApi = null

    let transactionTraceEndpoint = null

    // imagine this is a serialized transaction trace
    const trace = []

    t.beforeEach((done) => {
      agent = setupMockedAgent()
      agent.config.run_id = RUN_ID
      collectorApi = new CollectorApi(agent)

      nock.disableNetConnect()

      const response = {return_value: []}

      transactionTraceEndpoint = nock(URL)
        .post(helper.generateCollectorPath('transaction_sample_data', RUN_ID))
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
      collectorApi.transaction_sample_data(trace, (error) => {
        t.error(error)

        transactionTraceEndpoint.done()

        t.end()
      })
    })

    t.test('should return retain state', (t) => {
      collectorApi.transaction_sample_data(trace, (error, res) => {
        const command = res

        t.equal(command.retainData, false)

        transactionTraceEndpoint.done()

        t.end()
      })
    })
  })
})

tap.test('shutdown', (t) => {
  t.autoend()

  t.test('requires a callback', (t) => {
    const agent = setupMockedAgent()
    const collectorApi = new CollectorApi(agent)

    t.tearDown(() => {
      helper.unloadAgent(agent)
    })

    t.throws(
      () => { collectorApi.shutdown(null) },
      new Error('callback is required')
    )

    t.end()
  })

  t.test('receiving 200 response, with valid data', (t) => {
    t.autoend()

    let agent = null
    let collectorApi = null

    let shutdownEndpoint = null

    t.beforeEach((done) => {
      agent = setupMockedAgent()
      agent.config.run_id = RUN_ID
      collectorApi = new CollectorApi(agent)

      nock.disableNetConnect()

      const response = {return_value: null}

      shutdownEndpoint = nock(URL)
        .post(helper.generateCollectorPath('shutdown', RUN_ID))
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
      collectorApi.shutdown((error) => {
        t.error(error)

        shutdownEndpoint.done()

        t.end()
      })
    })

    t.test('should return null', (t) => {
      collectorApi.shutdown((error, res) => {
        t.equal(res.payload, null)

        shutdownEndpoint.done()

        t.end()
      })
    })
  })

  t.test('fail on a 503 status code', (t) => {
    t.autoend()

    let agent = null
    let collectorApi = null

    let shutdownEndpoint = null

    t.beforeEach((done) => {
      agent = setupMockedAgent()
      agent.config.run_id = RUN_ID
      collectorApi = new CollectorApi(agent)

      nock.disableNetConnect()

      shutdownEndpoint = nock(URL)
        .post(helper.generateCollectorPath('shutdown', RUN_ID))
        .reply(503)

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
      collectorApi.shutdown((error) => {
        t.error(error)

        shutdownEndpoint.done()

        t.end()
      })
    })

    t.test('should no longer have agent run id', (t) => {
      collectorApi.shutdown(() => {
        t.notOk(agent.config.run_id)

        shutdownEndpoint.done()

        t.end()
      })
    })

    t.test('should tell the requester to shut down', (t) => {
      collectorApi.shutdown((error, res) => {
        const command = res
        t.equal(command.shouldShutdownRun(), true)

        shutdownEndpoint.done()

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
