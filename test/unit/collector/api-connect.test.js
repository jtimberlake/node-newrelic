'use strict'

const tap = require('tap')
const nock = require('nock')

const helper = require('../../lib/agent_helper')
const CollectorApi = require('../../../lib/collector/api')
const CollectorResponse = require('../../../lib/collector/response')

const HOST = 'collector.newrelic.com'
const PORT = 443
const URL = 'https://' + HOST
const RUN_ID = 1337

const timeout = global.setTimeout

tap.test('succeeds after one 503 on preconnect', (t) => {
  t.autoend()

  let collectorApi = null
  let agent = null

  const valid = {
    agent_run_id: RUN_ID
  }

  const response = {return_value: valid}

  let failure = null
  let success = null
  let connection = null

  let bad = null
  let ssc = null

  t.beforeEach((done) => {
    fastSetTimeoutIncrementRef()

    nock.disableNetConnect()

    agent = setupMockedAgent()
    collectorApi = new CollectorApi(agent)

    const redirectURL = helper.generateCollectorPath('preconnect')
    failure = nock(URL).post(redirectURL).reply(503)
    success = nock(URL)
      .post(redirectURL)
      .reply(200, {
        return_value: {redirect_host: HOST, security_policies: {}}
      })
    connection = nock(URL)
      .post(helper.generateCollectorPath('connect'))
      .reply(200, response)

    done()
  })

  t.afterEach((done) => {
    restoreSetTimeout()

    if (!nock.isDone()) {
      /* eslint-disable no-console */
      console.error('Cleaning pending mocks: %j', nock.pendingMocks())
      /* eslint-enable no-console */
      nock.cleanAll()
    }

    nock.enableNetConnect()
    helper.unloadAgent(agent)

    done()
  })

  t.test('should not error out', (t) => {
    testConnect(t, () => {
      t.notOk(bad)
      t.end()
    })
  })

  t.test('should have a run ID', (t) => {
    testConnect(t, () => {
      t.equal(ssc.agent_run_id, RUN_ID)
      t.end()
    })
  })

  t.test('should pass through server-side configuration untouched', (t) => {
    testConnect(t, () => {
      t.deepEqual(ssc, valid)
      t.end()
    })
  })

  function testConnect(t, cb) {
    collectorApi.connect((error, res) => {
      bad = error
      ssc = res.payload

      t.ok(failure.isDone())
      t.ok(success.isDone())
      t.ok(connection.isDone())
      cb()
    })
  }
})

// TODO: 503 tests can likely be consolidated into single test func
// passed to t.test() while specifying different # of 503s.
tap.test('succeeds after five 503s on preconnect', (t) => {
  t.autoend()

  let collectorApi = null
  let agent = null

  const valid = {
    agent_run_id: RUN_ID
  }

  const response = {return_value: valid}

  let failure = null
  let success = null
  let connection = null

  let bad = null
  let ssc = null

  t.beforeEach((done) => {
    fastSetTimeoutIncrementRef()

    nock.disableNetConnect()

    agent = setupMockedAgent()
    collectorApi = new CollectorApi(agent)

    const redirectURL = helper.generateCollectorPath('preconnect')
    failure = nock(URL).post(redirectURL).times(5).reply(503)
    success = nock(URL)
      .post(redirectURL)
      .reply(200, {
        return_value: {redirect_host: HOST, security_policies: {}}
      })
    connection = nock(URL)
      .post(helper.generateCollectorPath('connect'))
      .reply(200, response)

    done()
  })

  t.afterEach((done) => {
    restoreSetTimeout()

    if (!nock.isDone()) {
      /* eslint-disable no-console */
      console.error('Cleaning pending mocks: %j', nock.pendingMocks())
      /* eslint-enable no-console */
      nock.cleanAll()
    }

    nock.enableNetConnect()
    helper.unloadAgent(agent)

    done()
  })


  t.test('should not error out', (t) => {
    testConnect(t, () => {
      t.notOk(bad)
      t.end()
    })
  })

  t.test('should have a run ID', (t) => {
    testConnect(t, () => {
      t.equal(ssc.agent_run_id, RUN_ID)
      t.end()
    })
  })

  t.test('should pass through server-side configuration untouched', (t) => {
    testConnect(t, () => {
      t.deepEqual(ssc, valid)
      t.end()
    })
  })


  function testConnect(t, cb) {
    collectorApi.connect((error, res) => {
      bad = error
      ssc = res.payload

      t.ok(failure.isDone())
      t.ok(success.isDone())
      t.ok(connection.isDone())
      cb()
    })
  }
})

tap.test('retries preconnect until forced to disconnect (410)', (t) => {
  t.autoend()

  let collectorApi = null
  let agent = null

  const exception = {
    exception: {
      message: 'fake force disconnect',
      error_type: 'NewRelic::Agent::ForceDisconnectException'
    }
  }

  let failure = null
  let disconnect = null

  let capturedResponse = null

  t.beforeEach((done) => {
    fastSetTimeoutIncrementRef()

    nock.disableNetConnect()

    agent = setupMockedAgent()
    collectorApi = new CollectorApi(agent)

    const redirectURL = helper.generateCollectorPath('preconnect')
    failure = nock(URL).post(redirectURL).times(500).reply(503)
    disconnect = nock(URL).post(redirectURL).times(1).reply(410, exception)

    done()
  })

  t.afterEach((done) => {
    restoreSetTimeout()

    if (!nock.isDone()) {
      /* eslint-disable no-console */
      console.error('Cleaning pending mocks: %j', nock.pendingMocks())
      /* eslint-enable no-console */
      nock.cleanAll()
    }

    nock.enableNetConnect()
    helper.unloadAgent(agent)

    done()
  })

  t.test('should have received shutdown response', (t) => {
    testConnect(t, () => {
      const shutdownCommand = CollectorResponse.AGENT_RUN_BEHAVIOR.SHUTDOWN

      t.ok(capturedResponse)
      t.equal(capturedResponse.agentRun, shutdownCommand)

      t.end()
    })
  })

  function testConnect(t, cb) {
    collectorApi.connect((error, response) => {
      capturedResponse = response

      t.ok(failure.isDone())
      t.ok(disconnect.isDone())
      cb()
    })
  }
})


tap.test('retries on receiving invalid license key (401)', (t) => {
  t.autoend()

  let collectorApi = null
  let agent = null

  const error = {
    exception: {
      message: 'Invalid license key. Please contact support@newrelic.com.',
      error_type: 'NewRelic::Agent::LicenseException'
    }
  }

  let failure = null
  let success = null
  let connect = null

  t.beforeEach((done) => {
    fastSetTimeoutIncrementRef()

    nock.disableNetConnect()

    agent = setupMockedAgent()
    collectorApi = new CollectorApi(agent)

    const preconnectURL = helper.generateCollectorPath('preconnect')
    failure = nock(URL).post(preconnectURL).times(5).reply(401, error)
    success = nock(URL).post(preconnectURL).reply(200, {return_value: {}})
    connect = nock(URL)
      .post(helper.generateCollectorPath('connect'))
      .reply(200, {return_value: {agent_run_id: 31338}})

    done()
  })

  t.afterEach((done) => {
    restoreSetTimeout()

    if (!nock.isDone()) {
      /* eslint-disable no-console */
      console.error('Cleaning pending mocks: %j', nock.pendingMocks())
      /* eslint-enable no-console */
      nock.cleanAll()
    }

    nock.enableNetConnect()
    helper.unloadAgent(agent)

    done()
  })

  t.test('should call the expected number of times', (t) => {
    testConnect(t, () => {
      t.end()
    })
  })

  function testConnect(t, cb) {
    collectorApi.connect(() => {
      t.ok(failure.isDone())
      t.ok(success.isDone())
      t.ok(connect.isDone())

      cb()
    })
  }
})

function fastSetTimeoutIncrementRef() {
  global.setTimeout = function(cb) {
    const nodeTimeout = timeout(cb, 0)

    // This is a hack to keep tap from shutting down test early.
    // Is there a better way to do this?
    setImmediate(() => {
      nodeTimeout.ref()
    })

    return nodeTimeout
  }
}

function restoreSetTimeout() {
  global.setTimeout = timeout
}

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
