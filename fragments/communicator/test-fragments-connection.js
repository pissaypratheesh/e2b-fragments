#!/usr/bin/env node

const WebSocket = require('ws');
const clipboardy = require('clipboardy');

const FRAGMENTS_WS_PORT = 3006;
let fragmentsWs = null;
let lastClipboardContent = '';

console.log('🚀 Testing direct connection to fragments app...');

// Connect to local fragments app
async function connectToFragmentsApp() {
  try {
    const wsUrl = `ws://localhost:${FRAGMENTS_WS_PORT}`;
    console.log(`Connecting to fragments app at ${wsUrl}`);
    
    fragmentsWs = new WebSocket(wsUrl);
    
    fragmentsWs.on('open', () => {
      console.log('✅ Connected to fragments app');
    });
    
    fragmentsWs.on('error', (error) => {
      console.error('❌ Fragments WebSocket error:', error);
    });
    
    fragmentsWs.on('close', () => {
      console.log('Connection to fragments app closed. Attempting to reconnect...');
      setTimeout(connectToFragmentsApp, 3000);
    });
    
  } catch (error) {
    console.error('Failed to connect to fragments app:', error);
    console.log('Retrying fragments connection in 5 seconds...');
    setTimeout(connectToFragmentsApp, 5000);
  }
}

// Send message to fragments app
function sendToFragmentsApp(message) {
  if (fragmentsWs && fragmentsWs.readyState === WebSocket.OPEN) {
    fragmentsWs.send(JSON.stringify(message));
    console.log('✅ Message sent to fragments app:', message.type, '-', message.content.substring(0, 50));
  } else {
    console.log('❌ Cannot send to fragments app - not connected');
  }
}

// Monitor clipboard changes
function monitorClipboard() {
  console.log('📋 Starting clipboard monitoring...');
  setInterval(async () => {
    try {
      const currentContent = await clipboardy.read();
      if (currentContent !== lastClipboardContent && currentContent.trim() !== '') {
        lastClipboardContent = currentContent;
        
        console.log('📋 New clipboard content detected:', currentContent.substring(0, 50));
        
        // Send to fragments app
        sendToFragmentsApp({
          type: 'text',
          content: currentContent,
          timestamp: new Date().toISOString(),
          source: 'clipboard_monitor'
        });
      }
    } catch (error) {
      console.error('Error reading clipboard:', error);
    }
  }, 1000);
}

// Start everything
connectToFragmentsApp();

// Wait for connection then start monitoring
setTimeout(() => {
  monitorClipboard();
}, 2000);

// Handle graceful shutdown
process.on('SIGINT', () => {
  console.log('\nShutting down gracefully...');
  if (fragmentsWs) {
    fragmentsWs.close();
  }
  process.exit(0);
});

console.log('📝 Instructions:');
console.log('1. Wait for "Connected to fragments app" message');
console.log('2. Copy any text to clipboard');
console.log('3. Check fragments app for new messages');
console.log('4. Press Ctrl+C to stop');