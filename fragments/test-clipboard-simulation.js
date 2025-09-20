#!/usr/bin/env node

const WebSocket = require('ws');

// Simulate what app1.js sends when you copy something
const FRAGMENTS_WS_PORT = 3006;

console.log('🚀 Simulating clipboard copy event...');

async function simulateClipboardCopy() {
  try {
    console.log(`Connecting to fragments app at ws://localhost:${FRAGMENTS_WS_PORT}`);
    
    const ws = new WebSocket(`ws://localhost:${FRAGMENTS_WS_PORT}`);
    
    ws.on('open', () => {
      console.log('✅ Connected to fragments app WebSocket server');
      
      // Simulate the exact message format that app1.js sends when you copy text
      const clipboardMessage = {
        type: 'text',
        content: 'How do I implement a binary search algorithm in JavaScript?',
        timestamp: new Date().toISOString(),
        source: 'machine2_clipboard'
      };
      
      console.log('📋 Simulating clipboard copy message...');
      console.log('Message:', clipboardMessage);
      ws.send(JSON.stringify(clipboardMessage));
      
      // Close connection after sending
      setTimeout(() => {
        ws.close();
        console.log('✅ Simulation completed - connection closed');
        process.exit(0);
      }, 2000);
    });
    
    ws.on('error', (error) => {
      console.error('❌ WebSocket error:', error.message);
      process.exit(1);
    });
    
    ws.on('close', () => {
      console.log('📋 WebSocket connection closed');
    });
    
  } catch (error) {
    console.error('❌ Failed to simulate clipboard:', error.message);
    process.exit(1);
  }
}

simulateClipboardCopy();