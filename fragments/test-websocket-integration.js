#!/usr/bin/env node

const WebSocket = require('ws');

// Test script to verify WebSocket integration
const FRAGMENTS_WS_PORT = 3006;

console.log('Testing WebSocket integration...');

async function testWebSocketConnection() {
  try {
    console.log(`Attempting to connect to fragments app at ws://localhost:${FRAGMENTS_WS_PORT}`);
    
    const ws = new WebSocket(`ws://localhost:${FRAGMENTS_WS_PORT}`);
    
    ws.on('open', () => {
      console.log('✅ Connected to fragments app WebSocket server');
      
      // Send test text message
      const testTextMessage = {
        type: 'text',
        content: 'Hello from test script! Can you help me with JavaScript?',
        timestamp: new Date().toISOString(),
        source: 'test_script'
      };
      
      console.log('📤 Sending test text message...');
      ws.send(JSON.stringify(testTextMessage));
      
      // Send test screenshot message after 2 seconds
      setTimeout(() => {
        const testScreenshotMessage = {
          type: 'screenshot',
          content: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', // 1x1 pixel PNG
          filename: 'test_screenshot.png',
          timestamp: new Date().toISOString(),
          source: 'test_script'
        };
        
        console.log('📤 Sending test screenshot message...');
        ws.send(JSON.stringify(testScreenshotMessage));
        
        // Close connection after sending test messages
        setTimeout(() => {
          ws.close();
          console.log('✅ Test completed - connection closed');
          process.exit(0);
        }, 1000);
      }, 2000);
    });
    
    ws.on('error', (error) => {
      console.error('❌ WebSocket error:', error.message);
      console.log('📝 Make sure the fragments app is running with: npm run dev');
      process.exit(1);
    });
    
    ws.on('close', () => {
      console.log('📋 WebSocket connection closed');
    });
    
  } catch (error) {
    console.error('❌ Failed to create WebSocket connection:', error.message);
    process.exit(1);
  }
}

// Test HTTP API endpoints
async function testHTTPAPI() {
  try {
    console.log('\n🔍 Testing HTTP API endpoints...');
    
    // Test status endpoint
    const statusResponse = await fetch('http://localhost:4000/api/websocket?action=status');
    if (statusResponse.ok) {
      const status = await statusResponse.json();
      console.log('✅ Status endpoint working:', status);
    } else {
      console.error('❌ Status endpoint failed');
    }
    
  } catch (error) {
    console.error('❌ HTTP API test failed:', error.message);
    console.log('📝 Make sure the fragments app is running on http://localhost:4000');
  }
}

console.log('🚀 Starting WebSocket integration test...');
console.log('📝 Prerequisites:');
console.log('   1. Fragments app should be running (npm run dev)');
console.log('   2. WebSocket server should be listening on port 3006');
console.log('   3. HTTP server should be running on port 4000\n');

// Run tests
testHTTPAPI()
  .then(() => testWebSocketConnection())
  .catch((error) => {
    console.error('❌ Test failed:', error);
    process.exit(1);
  });