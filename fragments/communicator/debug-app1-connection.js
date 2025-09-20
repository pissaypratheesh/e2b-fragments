#!/usr/bin/env node

const WebSocket = require('ws');

console.log('🔍 Debugging app1.js connection issue...');

// Test WebSocket connection exactly like app1.js does
const FRAGMENTS_WS_PORT = 3006;
let fragmentsWs = null;

async function testConnectionLikeApp1() {
  try {
    const wsUrl = `ws://localhost:${FRAGMENTS_WS_PORT}`;
    console.log(`Testing connection to fragments app at ${wsUrl}`);
    
    fragmentsWs = new WebSocket(wsUrl);
    
    fragmentsWs.on('open', () => {
      console.log('✅ Connection successful! app1.js should work.');
      
      // Send a test message
      fragmentsWs.send(JSON.stringify({
        type: 'text',
        content: 'Debug test from diagnostic tool',
        timestamp: new Date().toISOString(),
        source: 'debug_tool'
      }));
      
      setTimeout(() => {
        fragmentsWs.close();
        process.exit(0);
      }, 2000);
    });
    
    fragmentsWs.on('error', (error) => {
      console.error('❌ Connection failed - this is why app1.js is not working:');
      console.error(error);
      process.exit(1);
    });
    
    fragmentsWs.on('close', () => {
      console.log('Connection closed');
    });
    
  } catch (error) {
    console.error('❌ Failed to create WebSocket:', error);
    process.exit(1);
  }
}

console.log('📝 This test will show if app1.js should be able to connect...');
testConnectionLikeApp1();