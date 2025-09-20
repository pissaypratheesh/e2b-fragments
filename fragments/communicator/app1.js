const express = require('express');
const WebSocket = require('ws');
const clipboardy = require('clipboardy');
const screenshot = require('screenshot-desktop');
const path = require('path');
const fs = require('fs');
const os = require('os');
const dgram = require('dgram');

const app = express();
const PORT = 3001;
const DISCOVERY_PORT = 3005;
const SERVICE_NAME = 'clipboard-share-receiver';
const Machine2IP = '192.168.1.211';

// Directory to monitor for new screenshots
const SCREENSHOT_DIR = '/Users/pratheeshnamrata/Downloads/brahmastra-screenshots';

// Serve static files
app.use(express.static('public'));

// WebSocket client to connect to Machine 2
let ws = null;
let discoveredMachine2 = null;

// WebSocket client to connect to local fragments app
let fragmentsWs = null;
const FRAGMENTS_WS_PORT = 3006;

// Auto-discover Machine 2 on the network
function discoverMachine2() {
  return new Promise((resolve, reject) => {
    // Direct connection to known Machine 2
    console.log(`Connecting directly to Machine 2 at ${Machine2IP}:3003`);
    discoveredMachine2 = {
      ip: Machine2IP,//'192.168.1.189',
      port: 3003,
      timestamp: Date.now()
    };
    resolve(discoveredMachine2);
    
    /* Original discovery code commented out
    const client = dgram.createSocket('udp4');
    const broadcastAddress = getBroadcastAddress();
    
    console.log(`Discovering Machine 2 on network... Broadcasting to ${broadcastAddress}:${DISCOVERY_PORT}`);
    
    // Listen for responses
    client.on('message', (msg, remote) => {
      try {
        const response = JSON.parse(msg.toString());
        if (response.service === SERVICE_NAME) {
          console.log(`Found Machine 2 at ${remote.address}:${response.port}`);
          discoveredMachine2 = {
            ip: remote.address,
            port: response.port,
            timestamp: Date.now()
          };
          if (!client.destroyed) {
            client.close();
          }
          resolve(discoveredMachine2);
        }
      } catch (error) {
        // Ignore invalid messages
      }
    });
    
    client.on('error', (err) => {
      console.error('Discovery error:', err);
      client.close();
      reject(err);
    });
    
    client.bind(() => {
      client.setBroadcast(true);
      
      // Send discovery broadcast
      const message = JSON.stringify({
        type: 'discover',
        service: SERVICE_NAME,
        from: 'sender'
      });
      
      client.send(message, DISCOVERY_PORT, broadcastAddress, (err) => {
        if (err) {
          console.error('Broadcast error:', err);
          client.close();
          reject(err);
        } else {
          console.log('Discovery broadcast sent');
          
          // Timeout after 5 seconds
          setTimeout(() => {
            if (!client.destroyed) {
              client.close();
            }
            if (!discoveredMachine2) {
              reject(new Error('Machine 2 not found'));
            }
          }, 5000);
        }
      });
    });
    */
  });
}

// Get broadcast address for the network
function getBroadcastAddress() {
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const net of interfaces[name]) {
      if (net.family === 'IPv4' && !net.internal) {
        // Calculate broadcast address
        const ip = net.address.split('.').map(Number);
        const mask = net.netmask.split('.').map(Number);
        const broadcast = ip.map((octet, i) => octet | (255 - mask[i]));
        return broadcast.join('.');
      }
    }
  }
  return '255.255.255.255'; // Fallback to global broadcast
}

// Connect to local fragments app
async function connectToFragmentsApp() {
  try {
    const wsUrl = `ws://localhost:${FRAGMENTS_WS_PORT}`;
    console.log(`Connecting to fragments app at ${wsUrl}`);
    
    fragmentsWs = new WebSocket(wsUrl);
    
    fragmentsWs.on('open', () => {
      console.log('Connected to fragments app');
    });
    
    fragmentsWs.on('error', (error) => {
      console.error('Fragments WebSocket error:', error);
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

// Connect to Machine 2
async function connectToMachine2() {
  try {
    if (!discoveredMachine2) {
      await discoverMachine2();
    }
    
    const wsUrl = `ws://${discoveredMachine2.ip}:${discoveredMachine2.port}`;
    console.log(`Connecting to Machine 2 at ${wsUrl}`);
    
    ws = new WebSocket(wsUrl);
    
    ws.on('open', () => {
      console.log('Connected to Machine 2');
    });
    
    ws.on('error', (error) => {
      console.error('WebSocket error:', error);
    });
    
    ws.on('message', async (data) => {
      try {
        const message = JSON.parse(data.toString());
        console.log('Received message from Machine 2:', message);
        
        // Handle textual data messages and copy to clipboard
        if (message.type === 'text' || message.type === 'clipboard') {
          const textContent = message.content || message.text || message.data;
          if (textContent && typeof textContent === 'string') {
            await clipboardy.write(textContent);
            console.log(`📋 Copied to clipboard: "${textContent}"`);
            console.log('✅ Ready to paste anywhere!');
            
            // Also send to fragments app
            sendToFragmentsApp({
              type: 'text',
              content: textContent,
              timestamp: new Date().toISOString(),
              source: 'machine2_clipboard'
            });
          }
        }
        // Handle screenshot messages
        else if (message.type === 'screenshot') {
          console.log(`📸 Screenshot received from Machine 2`);
          
          // Send to fragments app
          sendToFragmentsApp({
            type: 'screenshot',
            content: message.content,
            filename: message.filename,
            timestamp: new Date().toISOString(),
            source: 'machine2_screenshot'
          });
        }
        // Handle any other message types that might contain text
        else if (message.content && typeof message.content === 'string') {
          await clipboardy.write(message.content);
          console.log(`📋 Copied to clipboard: "${message.content}"`);
          console.log('✅ Ready to paste anywhere!');
          
          // Also send to fragments app
          sendToFragmentsApp({
            type: 'text',
            content: message.content,
            timestamp: new Date().toISOString(),
            source: 'machine2_other'
          });
        }
      } catch (error) {
        console.error('Error processing message from Machine 2:', error);
        // Try to handle as plain text if JSON parsing fails
        try {
          const plainText = data.toString();
          if (plainText && plainText.trim() !== '') {
            await clipboardy.write(plainText);
            console.log(`📋 Copied plain text to clipboard: "${plainText}"`);
            console.log('✅ Ready to paste anywhere!');
          }
        } catch (clipboardError) {
          console.error('Error copying to clipboard:', clipboardError);
        }
      }
    });

    ws.on('close', () => {
      console.log('Connection to Machine 2 closed. Attempting to reconnect...');
      discoveredMachine2 = null; // Reset discovery
      setTimeout(connectToMachine2, 3000);
    });
    
  } catch (error) {
    console.error('Failed to connect to Machine 2:', error);
    console.log('Retrying discovery in 5 seconds...');
    setTimeout(connectToMachine2, 5000);
  }
}

// Send message to fragments app via HTTP API
async function sendToFragmentsApp(message) {
  try {
    const response = await fetch('http://localhost:4000/api/receive-message', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(message)
    });

    if (response.ok) {
      const result = await response.json();
      console.log('✅ Message sent to fragments app via API:', message.type, '- ID:', result.messageId);
    } else {
      console.error('❌ Failed to send message to fragments app:', response.status, response.statusText);
    }
  } catch (error) {
    console.error('❌ Error sending message to fragments app:', error.message);
  }
}

// Send message to Machine 2 if connected
function sendToMachine2(message) {
  if (ws && ws.readyState === WebSocket.OPEN) {
    try {
      ws.send(JSON.stringify(message));
      console.log('📤 Sent to Machine 2:', message.type);
    } catch (error) {
      console.error('❌ Error sending to Machine 2:', error.message);
    }
  } else {
    console.log('⚠️ Machine 2 not connected, skipping send for:', message.type);
  }
}

// Monitor clipboard changes
let lastClipboardContent = '';
function monitorClipboard() {
  setInterval(async () => {
    try {
      const currentContent = await clipboardy.read();
      if (currentContent !== lastClipboardContent && currentContent.trim() !== '') {
        lastClipboardContent = currentContent;
        
        console.log('📋 Clipboard content detected:', currentContent);
        
        const message = {
          type: 'clipboard',
          content: currentContent,
          timestamp: new Date().toISOString(),
          source: 'clipboard_monitor'
        };

        // Send to Machine 2 (if connected)
        sendToMachine2(message);

        // Send to fragments app via API
        await sendToFragmentsApp(message);
      }
    } catch (error) {
      console.error('Error reading clipboard:', error);
    }
  }, 1000);
}

// Monitor screenshot directory for new image files
function monitorScreenshotDirectory() {
  // Check if directory exists, create if it doesn't
  if (!fs.existsSync(SCREENSHOT_DIR)) {
    console.log(`Creating screenshot directory: ${SCREENSHOT_DIR}`);
    fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
  }

  // Keep track of existing files
  let existingFiles = new Set();
  
  // Get initial file list
  try {
    const files = fs.readdirSync(SCREENSHOT_DIR);
    files.forEach(file => {
      if (isImageFile(file)) {
        existingFiles.add(file);
      }
    });
    console.log(`Monitoring ${SCREENSHOT_DIR} for new image files...`);
    console.log(`Found ${existingFiles.size} existing image files`);
  } catch (error) {
    console.error('Error reading screenshot directory:', error);
    return;
  }

  // Watch directory for changes
  fs.watch(SCREENSHOT_DIR, { persistent: true }, (eventType, filename) => {
    if (eventType === 'rename' && filename && isImageFile(filename)) {
      const filePath = path.join(SCREENSHOT_DIR, filename);
      
      // Check if file exists (new file) and wasn't already tracked
      if (fs.existsSync(filePath) && !existingFiles.has(filename)) {
        existingFiles.add(filename);
        console.log(`New image detected: ${filename}`);
        
        // Wait a bit for file to be fully written
        setTimeout(() => {
          sendImageFile(filePath, filename);
        }, 1000);
      }
    }
  });
}

// Check if file is an image
function isImageFile(filename) {
  const imageExtensions = ['.png', '.jpg', '.jpeg', '.gif', '.bmp', '.webp', '.tiff'];
  const ext = path.extname(filename).toLowerCase();
  return imageExtensions.includes(ext);
}

// Send image file to receiver
async function sendImageFile(filePath, filename) {
  try {
    if (!fs.existsSync(filePath)) {
      console.error(`File not found: ${filePath}`);
      return;
    }

    const imageBuffer = fs.readFileSync(filePath);
    const base64Image = imageBuffer.toString('base64');
    
    const message = {
      type: 'screenshot',
      content: base64Image,
      filename: filename,
      filepath: filePath,
      timestamp: new Date().toISOString(),
      source: 'file_monitor'
    };

    // Send to Machine 2 (if connected)
    sendToMachine2(message);

    // Send to fragments app via API
    await sendToFragmentsApp(message);

    console.log(`Image file sent: ${filename} (size: ${base64Image.length} bytes)`);
  } catch (error) {
    console.error(`Error sending image file ${filename}:`, error);
  }
}

// API endpoint to send screenshot
app.post('/send-screenshot', async (req, res) => {
  try {
    const imgBuffer = await screenshot();
    const base64Image = imgBuffer.toString('base64');
    
    const message = {
      type: 'screenshot',
      content: base64Image,
      timestamp: new Date().toISOString(),
      source: 'api_endpoint'
    };

    // Send to Machine 2 (if connected)
    sendToMachine2(message);

    // Send to fragments app via API
    await sendToFragmentsApp(message);

    console.log('Screenshot sent (size:', base64Image.length, 'bytes)');
    res.json({ success: true, message: 'Screenshot sent successfully' });
  } catch (error) {
    console.error('Error taking screenshot:', error);
    res.status(500).json({ success: false, message: 'Error taking screenshot' });
  }
});

// API endpoint to get connection status
app.get('/api/status', (req, res) => {
  res.json({
    connected: ws && ws.readyState === WebSocket.OPEN,
    discoveredMachine2: discoveredMachine2,
    localIP: getLocalIP()
  });
});

// Get local IP address
function getLocalIP() {
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const net of interfaces[name]) {
      if (net.family === 'IPv4' && !net.internal) {
        return net.address;
      }
    }
  }
  return 'localhost';
}
app.post('/send-message', express.json(), async (req, res) => {
  const { message } = req.body;
  
  const messageData = {
    type: 'message',
    content: message,
    timestamp: new Date().toISOString(),
    source: 'api_endpoint'
  };

  // Send to Machine 2 (if connected)
  sendToMachine2(messageData);

  // Send to fragments app via API
  await sendToFragmentsApp(messageData);

  console.log('Message sent:', message);
  res.json({ success: true, message: 'Message sent successfully' });
});

// Serve the HTML interface
app.get('/', (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html>
    <head>
        <title>Machine 1 - Sender</title>
        <style>
            body { font-family: Arial, sans-serif; margin: 20px; }
            .container { max-width: 600px; margin: 0 auto; }
            .status { padding: 10px; margin: 10px 0; border-radius: 5px; }
            .connected { background-color: #d4edda; color: #155724; }
            .disconnected { background-color: #f8d7da; color: #721c24; }
            button { padding: 10px 20px; margin: 10px 0; background-color: #007bff; color: white; border: none; border-radius: 5px; cursor: pointer; }
            button:hover { background-color: #0056b3; }
            input[type="text"] { width: 100%; padding: 10px; margin: 10px 0; border: 1px solid #ddd; border-radius: 5px; }
            .log { background-color: #f8f9fa; padding: 15px; border-radius: 5px; margin: 10px 0; max-height: 300px; overflow-y: auto; }
        </style>
    </head>
    <body>
        <div class="container">
            <h1>Machine 1 - Sender</h1>
            <div id="status" class="status disconnected">Discovering Machine 2...</div>
            
            <div id="networkInfo" style="margin: 10px 0; padding: 10px; background: #e9ecef; border-radius: 5px;">
                <strong>Network Info:</strong>
                <div>Local IP: <span id="localIP">-</span></div>
                <div>Machine 2: <span id="machine2IP">Not discovered</span></div>
            </div>
            
            <h3>Manual Actions:</h3>
            <button onclick="sendScreenshot()">Send Screenshot</button>
            <br>
            <input type="text" id="messageInput" placeholder="Enter custom message">
            <button onclick="sendMessage()">Send Message</button>
            
            <h3>Automatic Clipboard Monitoring:</h3>
            <p>Clipboard is being monitored automatically. Copy anything and it will be sent to Machine 2.</p>
            
            <h3>Activity Log:</h3>
            <div id="log" class="log"></div>
        </div>

        <script>
            function updateStatus(connected) {
                const statusDiv = document.getElementById('status');
                if (connected) {
                    statusDiv.className = 'status connected';
                    statusDiv.textContent = 'Connected to Machine 2';
                } else {
                    statusDiv.className = 'status disconnected';
                    statusDiv.textContent = 'Disconnected from Machine 2';
                }
            }

            function addLog(message) {
                const logDiv = document.getElementById('log');
                const timestamp = new Date().toLocaleTimeString();
                logDiv.innerHTML += '<div><strong>' + timestamp + ':</strong> ' + message + '</div>';
                logDiv.scrollTop = logDiv.scrollHeight;
            }

            async function sendScreenshot() {
                try {
                    const response = await fetch('/send-screenshot', { method: 'POST' });
                    const result = await response.json();
                    addLog(result.message);
                } catch (error) {
                    addLog('Error sending screenshot: ' + error.message);
                }
            }

            async function sendMessage() {
                const messageInput = document.getElementById('messageInput');
                const message = messageInput.value.trim();
                
                if (!message) {
                    alert('Please enter a message');
                    return;
                }

                try {
                    const response = await fetch('/send-message', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ message })
                    });
                    const result = await response.json();
                    addLog('Message sent: ' + message);
                    messageInput.value = '';
                } catch (error) {
                    addLog('Error sending message: ' + error.message);
                }
            }

            // Check connection status periodically
            setInterval(async () => {
                try {
                    const response = await fetch('/api/status');
                    const status = await response.json();
                    
                    updateStatus(status.connected);
                    document.getElementById('localIP').textContent = status.localIP;
                    
                    if (status.discoveredMachine2) {
                        document.getElementById('machine2IP').textContent = 
                            status.discoveredMachine2.ip + ':' + status.discoveredMachine2.port;
                    } else {
                        document.getElementById('machine2IP').textContent = 'Not discovered';
                    }
                } catch (error) {
                    updateStatus(false);
                }
            }, 2000);

            // Allow Enter key to send message
            document.getElementById('messageInput').addEventListener('keypress', function(e) {
                if (e.key === 'Enter') {
                    sendMessage();
                }
            });
        </script>
    </body>
    </html>
  `);
});

// Start server
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Machine 1 (Sender) running on http://0.0.0.0:${PORT}`);
  console.log(`Local IP: ${getLocalIP()}`);
  console.log(`🔗 Using HTTP API to communicate with fragments app`);
  
  // Test connection to fragments app
  setTimeout(async () => {
    try {
      const response = await fetch('http://localhost:4000/api/receive-message', {
        method: 'GET'
      });
      if (response.ok) {
        console.log('✅ Fragments app API is reachable');
      } else {
        console.log('⚠️ Fragments app API returned:', response.status);
      }
    } catch (error) {
      console.log('❌ Cannot reach fragments app API:', error.message);
    }
  }, 2000);
  
  // Start monitoring after a short delay
  setTimeout(() => {
    console.log('📋 Starting clipboard monitoring...');
    monitorClipboard();
    monitorScreenshotDirectory();
  }, 3000);
  
  // Enable Machine 2 connection
  setTimeout(() => {
    connectToMachine2();
  }, 5000);
});

// Handle graceful shutdown
process.on('SIGINT', () => {
  console.log('\nShutting down gracefully...');
  if (ws) {
    ws.close();
  }
  if (fragmentsWs) {
    fragmentsWs.close();
  }
  process.exit(0);
});