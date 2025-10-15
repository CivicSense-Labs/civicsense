import axios from 'axios';
import { loadConfig } from '../src/utils/config.js';

const config = loadConfig();
const BASE_URL = config.app.baseUrl;

/**
 * Test the SMS workflow with sample reports
 */
async function testSMSWorkflow() {
  console.log('🧪 Testing SMS Workflow...\n');

  const testCases = [
    {
      name: 'Pothole Report',
      from: '+15551234567',
      body: 'There is a huge pothole at Broad and Market Street. Cars are getting damaged!'
    },
    {
      name: 'Similar Pothole (Should Merge)',
      from: '+15559876543',
      body: 'Big pothole near Broad & Market by the bus stop. Almost damaged my car tire!'
    },
    {
      name: 'Trash Issue',
      from: '+15551234567',
      body: 'Garbage bins overflowing on Park Place near Halsey Street'
    },
    {
      name: 'Water Leak',
      from: '+15559876543',
      body: 'Water leak on the sidewalk near City Hall, needs attention'
    }
  ];

  for (const testCase of testCases) {
    console.log(`📱 Testing: ${testCase.name}`);
    console.log(`From: ${testCase.from}`);
    console.log(`Message: "${testCase.body}"\n`);

    try {
      const response = await axios.post(`${BASE_URL}/webhooks/sms`, {
        From: testCase.from,
        Body: testCase.body,
        MessageSid: `test_${Date.now()}`
      }, {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'X-Twilio-Signature': 'test_signature' // In dev mode, signature validation is bypassed
        }
      });

      if (response.status === 200) {
        console.log('✅ SMS processed successfully');
        console.log('Response:', response.data);
      } else {
        console.log('❌ SMS processing failed');
        console.log('Status:', response.status);
        console.log('Response:', response.data);
      }

    } catch (error) {
      console.log('❌ Request failed');
      if (error.response) {
        console.log('Status:', error.response.status);
        console.log('Error:', error.response.data);
      } else {
        console.log('Error:', error.message);
      }
    }

    console.log('---\n');

    // Wait between requests to avoid overwhelming the system
    await new Promise(resolve => setTimeout(resolve, 2000));
  }
}

/**
 * Test the dashboard API
 */
async function testDashboardAPI() {
  console.log('📊 Testing Dashboard API...\n');

  try {
    // Get the organization ID from seed data (first org)
    const orgId = 'org-id-placeholder'; // In real testing, you'd get this from the database

    const response = await axios.get(`${BASE_URL}/dashboard/${orgId}`);

    if (response.status === 200) {
      console.log('✅ Dashboard API working');
      console.log('Metrics:');
      console.log(`- Open Parent Tickets: ${response.data.metrics?.open_parent_tickets || 0}`);
      console.log(`- Total Open: ${response.data.metrics?.total_open_tickets || 0}`);
      console.log(`- Merged: ${response.data.metrics?.merged_tickets || 0}`);
      console.log(`- Critical: ${response.data.metrics?.critical_open || 0}`);
      console.log(`- Parent Tickets Count: ${response.data.parentTickets?.length || 0}`);
    } else {
      console.log('❌ Dashboard API failed');
      console.log('Status:', response.status);
    }

  } catch (error) {
    console.log('❌ Dashboard request failed');
    if (error.response) {
      console.log('Status:', error.response.status);
      console.log('Error:', error.response.data);
    } else {
      console.log('Error:', error.message);
    }
  }
}

/**
 * Test health check
 */
async function testHealthCheck() {
  console.log('🏥 Testing Health Check...\n');

  try {
    const response = await axios.get(`${BASE_URL}/health`);

    if (response.status === 200) {
      console.log('✅ Server is healthy');
      console.log('Response:', response.data);
    } else {
      console.log('❌ Health check failed');
    }

  } catch (error) {
    console.log('❌ Health check request failed');
    console.log('Error:', error.message);
  }
}

/**
 * Run all tests
 */
async function runAllTests() {
  console.log('🚀 CivicSense Workflow Testing\n');
  console.log(`API Base URL: ${BASE_URL}\n`);
  console.log('=' * 50);

  await testHealthCheck();
  console.log('\n' + '=' * 50);

  // Uncomment when you have a real org ID from seeding
  // await testDashboardAPI();
  // console.log('\n' + '=' * 50);

  await testSMSWorkflow();

  console.log('🎉 Testing completed!');
  console.log('\nNext steps:');
  console.log('1. Check the dashboard at http://localhost:8501');
  console.log('2. Review tickets in the database');
  console.log('3. Test actual Twilio integration with real phone numbers');
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  runAllTests().catch(console.error);
}

export { testSMSWorkflow, testDashboardAPI, testHealthCheck, runAllTests };