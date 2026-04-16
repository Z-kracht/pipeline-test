const http = require('http');

const BASE_URL = process.env.TEST_URL || 'http://localhost:3000';

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    passed++;
    console.log(`  PASS: ${name}`);
  } catch (e) {
    failed++;
    console.log(`  FAIL: ${name} - ${e.message}`);
  }
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function httpGet(path) {
  return new Promise((resolve, reject) => {
    http.get(`${BASE_URL}${path}`, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve({ status: res.statusCode, body: data }));
    }).on('error', reject);
  });
}

async function run() {
  console.log('Running tests...\n');

  // Test 1: Health endpoint
  try {
    const res = await httpGet('/api/health');
    test('Health endpoint returns 200', () => {
      assert(res.status === 200, `Expected 200, got ${res.status}`);
    });

    const body = JSON.parse(res.body);
    test('Health endpoint returns status ok', () => {
      assert(body.status === 'ok', `Expected "ok", got "${body.status}"`);
    });

    test('Health endpoint returns timestamp', () => {
      assert(body.timestamp, 'No timestamp in response');
    });
  } catch (e) {
    failed++;
    console.log(`  FAIL: Health endpoint - ${e.message}`);
  }

  // Test 2: Homepage
  try {
    const res = await httpGet('/');
    test('Homepage returns 200', () => {
      assert(res.status === 200, `Expected 200, got ${res.status}`);
    });

    test('Homepage contains title', () => {
      assert(res.body.includes('Z.Kracht Pipeline Test'), 'Title not found');
    });
  } catch (e) {
    failed++;
    console.log(`  FAIL: Homepage - ${e.message}`);
  }

  // Results
  console.log(`\nResults: ${passed} passed, ${failed} failed\n`);
  process.exit(failed > 0 ? 1 : 0);
}

run();
