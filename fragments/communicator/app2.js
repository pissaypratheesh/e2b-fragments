const express = require('express');
const WebSocket = require('ws');
let clipboardy; // Declare clipboardy here
(async () => {
    clipboardy = await import('clipboardy'); // Dynamically import
})();
const fs = require('fs');
const path = require('path');
const os = require('os');
const dgram = require('dgram');

const app = express();
const PORT = 3002;
const WEBSOCKET_PORT = 3003;
const DISCOVERY_PORT = 3005;
const SERVICE_NAME = 'clipboard-share-receiver';

// Serve static files
app.use(express.static('public'));

// Create WebSocket server
const wss = new WebSocket.Server({ port: WEBSOCKET_PORT });

// WebSocket client to send messages back to Machine 1
let clientWs = null;
let machine1Connection = null;

// Store received data
let receivedData = [];

// UDP Discovery server
const discoveryServer = dgram.createSocket('udp4');

discoveryServer.on('message', (msg, remote) => {
  try {
    const request = JSON.parse(msg.toString());
    if (request.type === 'discover' && request.service === SERVICE_NAME) {
      console.log(`Discovery request from ${remote.address}`);
      
      // Send response
      const response = JSON.stringify({
        service: SERVICE_NAME,
        port: WEBSOCKET_PORT,
        ip: getLocalIP()
      });
      
      discoveryServer.send(response, remote.port, remote.address, (err) => {
        if (err) {
          console.error('Discovery response error:', err);
        } else {
          console.log(`Discovery response sent to ${remote.address}:${remote.port}`);
        }
      });
    }
  } catch (error) {
    // Ignore invalid messages
  }
});

discoveryServer.on('error', (err) => {
  console.error('Discovery server error:', err);
});

discoveryServer.bind(DISCOVERY_PORT, () => {
  console.log(`Discovery server listening on port ${DISCOVERY_PORT}`);
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

// WebSocket server to receive from Machine 1
wss.on('connection', (ws) => {
  console.log('Machine 1 connected');
  machine1Connection = ws; // Store the connection for sending messages back
  
  ws.on('message', async (message) => {
    try {
      const data = JSON.parse(message);
      console.log('Received:', data.type, 'at', data.timestamp);
      
      // Store the received data
      receivedData.unshift({
        ...data,
        id: Date.now()
      });
      
      // Keep only last 50 items
      if (receivedData.length > 50) {
        receivedData = receivedData.slice(0, 50);
      }
      
      switch (data.type) {
        case 'clipboard':
          // Set clipboard content
          await clipboardy.default.write(data.content);
          console.log('Clipboard updated with:', data.content);
          break;
          
        case 'screenshot':
          // Save screenshot
          const screenshotPath = path.join(__dirname, 'screenshots', `screenshot_${Date.now()}.png`);
          const imageBuffer = Buffer.from(data.content, 'base64');
          
          // Create screenshots directory if it doesn't exist
          if (!fs.existsSync(path.join(__dirname, 'screenshots'))) {
            fs.mkdirSync(path.join(__dirname, 'screenshots'));
          }
          
          fs.writeFileSync(screenshotPath, imageBuffer);
          console.log('Screenshot saved to:', screenshotPath);
          break;
          
        case 'message':
          console.log('Message received:', data.content);
          break;
      }
      
      // Broadcast to all web clients
      broadcastToWebClients(data);
      
    } catch (error) {
      console.error('Error processing message:', error);
    }
  });
  
  ws.on('close', () => {
    console.log('Machine 1 disconnected');
    machine1Connection = null; // Clear the connection reference
  });
  
  ws.on('error', (error) => {
    console.error('WebSocket error:', error);
  });
});

// WebSocket server for web interface
const webWss = new WebSocket.Server({ port: 3004 });
const webClients = new Set();

webWss.on('connection', (ws) => {
  webClients.add(ws);
  
  // Send existing data to new client
  ws.send(JSON.stringify({
    type: 'history',
    data: receivedData
  }));
  
  ws.on('close', () => {
    webClients.delete(ws);
  });
});

function broadcastToWebClients(data) {
  webClients.forEach(client => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify({
        type: 'new_data',
        data: data
      }));
    }
  });
}

// Function to send text message to Machine 1 (which will copy to its clipboard)
function sendTextToMachine1(textContent) {
  if (machine1Connection && machine1Connection.readyState === WebSocket.OPEN) {
    const message = {
      type: 'text',
      content: textContent,
      timestamp: new Date().toISOString(),
      source: 'machine2'
    };
    
    machine1Connection.send(JSON.stringify(message));
    console.log('Text message sent to Machine 1:', textContent);
    return true;
  } else {
    console.log('Cannot send message - Machine 1 not connected');
    return false;
  }
}

// API endpoints
app.get('/api/data', (req, res) => {
  res.json(receivedData);
});

app.get('/api/status', (req, res) => {
  res.json({
    localIP: getLocalIP(),
    websocketPort: WEBSOCKET_PORT,
    discoveryPort: DISCOVERY_PORT,
    connectedClients: wss.clients.size
  });
});

app.get('/api/screenshot/:filename', (req, res) => {
  const filename = req.params.filename;
  const filepath = path.join(__dirname, 'screenshots', filename);
  
  if (fs.existsSync(filepath)) {
    res.sendFile(filepath);
  } else {
    res.status(404).json({ error: 'Screenshot not found' });
  }
});

// API endpoint to send text message to Machine 1
app.use(express.json()); // Add JSON body parser
app.post('/api/send-to-machine1', (req, res) => {
  const { text } = req.body;
  
  if (!text || typeof text !== 'string' || text.trim() === '') {
    return res.status(400).json({ 
      success: false, 
      message: 'Text content is required' 
    });
  }
  
  const success = sendTextToMachine1(text);
  
  if (success) {
    res.json({ 
      success: true, 
      message: 'Text sent to Machine 1 successfully - it will be copied to Machine 1\'s clipboard' 
    });
  } else {
    res.status(500).json({ 
      success: false, 
      message: 'Machine 1 is not connected' 
    });
  }
});

// Serve the HTML interface
app.get('/', (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html>
    <head>
        <title>Machine 2 - Receiver</title>
        <style>
            body { font-family: Arial, sans-serif; margin: 20px; }
            .container { max-width: 800px; margin: 0 auto; }
            .status { padding: 10px; margin: 10px 0; border-radius: 5px; }
            .connected { background-color: #d4edda; color: #155724; }
            .disconnected { background-color: #f8d7da; color: #721c24; }
            .data-item { background-color: #f8f9fa; padding: 15px; margin: 10px 0; border-radius: 5px; border-left: 4px solid #007bff; }
            .clipboard { border-left-color: #28a745; }
            .screenshot { border-left-color: #ffc107; }
            .message { border-left-color: #6f42c1; }
            .timestamp { color: #6c757d; font-size: 0.9em; }
            .content { margin-top: 10px; }
            .screenshot-img { max-width: 100%; height: auto; margin-top: 10px; border: 1px solid #ddd; }
            .clear-btn { background-color: #dc3545; color: white; border: none; padding: 10px 20px; border-radius: 5px; cursor: pointer; }
            .clear-btn:hover { background-color: #c82333; }
            .stats { display: flex; justify-content: space-around; margin: 20px 0; }
            .stat { text-align: center; }
            .stat-number { font-size: 2em; font-weight: bold; color: #007bff; }
        </style>
    </head>
    <body>
        <div class="container">
            <h1>Machine 2 - Receiver</h1>
            <div id="status" class="status connected">Ready to receive from Machine 1</div>
            
            <div id="networkInfo" style="margin: 10px 0; padding: 10px; background: #e9ecef; border-radius: 5px;">
                <strong>Network Info:</strong>
                <div>Local IP: <span id="localIP">-</span></div>
                <div>WebSocket Port: <span id="wsPort">-</span></div>
                <div>Discovery Port: <span id="discoveryPort">-</span></div>
                <div>Connected Clients: <span id="connectedClients">0</span></div>
            </div>
            
            <div class="stats">
                <div class="stat">
                    <div class="stat-number" id="clipboardCount">0</div>
                    <div>Clipboard Items</div>
                </div>
                <div class="stat">
                    <div class="stat-number" id="screenshotCount">0</div>
                    <div>Screenshots</div>
                </div>
                <div class="stat">
                    <div class="stat-number" id="messageCount">0</div>
                    <div>Messages</div>
                </div>
            </div>
            
            <button class="clear-btn" onclick="clearData()">Clear All Data</button>
            
            <h3>Send Text to Machine 1:</h3>
            <div style="margin: 20px 0; padding: 15px; background: #e3f2fd; border-radius: 5px;">
                <textarea id="textToSend" placeholder="Enter text to send to Machine 1 (will be copied to its clipboard)" 
                    style="width: 100%; height: 80px; padding: 10px; border: 1px solid #ddd; border-radius: 5px; resize: vertical;"></textarea>
                <br>
                <button onclick="sendTextToMachine1()" style="margin-top: 10px; padding: 10px 20px; background-color: #4caf50; color: white; border: none; border-radius: 5px; cursor: pointer;">
                    Send to Machine 1 Clipboard
                </button>
                <div id="sendStatus" style="margin-top: 10px; font-weight: bold;"></div>
            </div>
            
            <h3>Received Data:</h3>
            <div id="dataContainer"></div>
        </div>

        <script>
            // Update network info
            function updateNetworkInfo() {
                fetch('/api/status')
                    .then(response => response.json())
                    .then(status => {
                        document.getElementById('localIP').textContent = status.localIP;
                        document.getElementById('wsPort').textContent = status.websocketPort;
                        document.getElementById('discoveryPort').textContent = status.discoveryPort;
                        document.getElementById('connectedClients').textContent = status.connectedClients;
                        
                        // Update status based on connected clients
                        const statusDiv = document.getElementById('status');
                        if (status.connectedClients > 0) {
                            statusDiv.className = 'status connected';
                            statusDiv.textContent = 'Connected - Receiving data from Machine 1';
                        } else {
                            statusDiv.className = 'status disconnected';
                            statusDiv.textContent = 'Waiting for Machine 1 to connect...';
                        }
                    })
                    .catch(error => {
                        console.error('Error updating network info:', error);
                    });
            }

            function connectWebSocket() {
                const ws = new WebSocket('ws://localhost:3004');
                
                ws.onopen = function() {
                    // No need to update status here, updateNetworkInfo will handle it
                };
                
                ws.onmessage = function(event) {
                    const message = JSON.parse(event.data);
                    
                    if (message.type === 'history') {
                        data = message.data;
                        renderData();
                    } else if (message.type === 'new_data') {
                        data.unshift(message.data);
                        if (data.length > 50) {
                            data = data.slice(0, 50);
                        }
                        renderData();
                    }
                };
                
                ws.onclose = function() {
                    // No need to update status here, updateNetworkInfo will handle it
                    setTimeout(connectWebSocket, 3000);
                };
                
                ws.onerror = function(error) {
                    console.error('WebSocket error:', error);
                };
            }

            let data = [];

            function renderData() {
                const container = document.getElementById('dataContainer');
                
                // Update stats
                const clipboardCount = data.filter(item => item.type === 'clipboard').length;
                const screenshotCount = data.filter(item => item.type === 'screenshot').length;
                const messageCount = data.filter(item => item.type === 'message').length;
                
                document.getElementById('clipboardCount').textContent = clipboardCount;
                document.getElementById('screenshotCount').textContent = screenshotCount;
                document.getElementById('messageCount').textContent = messageCount;
                
                // Render data items
                container.innerHTML = '';
                data.forEach(item => {
                    const div = document.createElement('div');
                    div.className = 'data-item ' + item.type;
                    
                    let content = '';
                    switch(item.type) {
                        case 'clipboard':
                            content = '<strong>📋 Clipboard:</strong><div class="content" onclick="copyContentDirectly(this)" data-content="' + escapeHtml(item.content) + '">' + escapeHtml(item.content) + '</div><button class="copy-btn" onclick="copyFromButton(this)">Copy</button>';
                            break;
                        case 'screenshot':
                            content = '<strong>📸 Screenshot:</strong><div class="content"><img class="screenshot-img" src="data:image/png;base64,' + item.content + '" alt="Screenshot"></div><button class="copy-btn" data-image="' + item.content + '" data-timestamp="' + item.timestamp + '" onclick="downloadImageFromButton(this)">Download</button>';
                            break;
                        case 'message':
                            content = '<strong>💬 Message:</strong><div class="content" onclick="copyContentDirectly(this)" data-content="' + escapeHtml(item.content) + '">' + escapeHtml(item.content) + '</div><button class="copy-btn" onclick="copyFromButton(this)">Copy</button>';
                            break;
                    }
                    
                    div.innerHTML = content + '<div class="timestamp">' + new Date(item.timestamp).toLocaleString() + '</div>';
                    container.appendChild(div);
                });
            }

            function escapeHtml(text) {
                const div = document.createElement('div');
                div.textContent = text;
                return div.innerHTML;
            }

            function copyContentDirectly(element) {
                const contentToCopy = element.dataset.content;
                if (contentToCopy) {
                    navigator.clipboard.writeText(contentToCopy)
                        .then(() => {
                            const originalText = element.innerHTML;
                            element.innerHTML = 'Copied!';
                            setTimeout(() => {
                                element.innerHTML = originalText;
                            }, 1500);
                        })
                        .catch(err => {
                            console.error('Failed to copy: ', err);
                        });
                }
            }

            function copyFromButton(buttonElement) {
                const contentDiv = buttonElement.previousElementSibling;
                if (contentDiv) {
                    const contentToCopy = contentDiv.dataset.content;
                    navigator.clipboard.writeText(contentToCopy)
                        .then(() => {
                            const originalButtonText = buttonElement.textContent;
                            buttonElement.textContent = 'Copied!';
                            setTimeout(() => {
                                buttonElement.textContent = originalButtonText;
                            }, 1500);
                        })
                        .catch(err => {
                            console.error('Failed to copy: ', err);
                        });
                }
            }

            function downloadImageFromButton(buttonElement) {
                try {
                    const base64Data = buttonElement.dataset.image;
                    const timestamp = buttonElement.dataset.timestamp;
                    
                    // Create a blob from base64 data
                    const byteCharacters = atob(base64Data);
                    const byteNumbers = new Array(byteCharacters.length);
                    for (let i = 0; i < byteCharacters.length; i++) {
                        byteNumbers[i] = byteCharacters.charCodeAt(i);
                    }
                    const byteArray = new Uint8Array(byteNumbers);
                    const blob = new Blob([byteArray], { type: 'image/png' });
                    
                    // Create download link
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = 'screenshot_' + timestamp + '.png';
                    document.body.appendChild(a);
                    a.click();
                    document.body.removeChild(a);
                    URL.revokeObjectURL(url);
                    
                    // Update button text temporarily
                    const originalText = buttonElement.textContent;
                    buttonElement.textContent = 'Downloaded!';
                    setTimeout(() => {
                        buttonElement.textContent = originalText;
                    }, 1500);
                } catch (error) {
                    console.error('Error downloading image:', error);
                }
            }

            function clearData() {
                if (confirm('Are you sure you want to clear all received data?')) {
                    data = [];
                    renderData();
                }
            }

            // Function to send text to Machine 1
            async function sendTextToMachine1() {
                const textarea = document.getElementById('textToSend');
                const statusDiv = document.getElementById('sendStatus');
                const text = textarea.value.trim();
                
                if (!text) {
                    statusDiv.style.color = '#dc3545';
                    statusDiv.textContent = 'Please enter some text to send';
                    return;
                }
                
                try {
                    statusDiv.style.color = '#007bff';
                    statusDiv.textContent = 'Sending...';
                    
                    const response = await fetch('/api/send-to-machine1', {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json'
                        },
                        body: JSON.stringify({ text: text })
                    });
                    
                    const result = await response.json();
                    
                    if (result.success) {
                        statusDiv.style.color = '#28a745';
                        statusDiv.textContent = '✅ Text sent to Machine 1 clipboard successfully!';
                        textarea.value = ''; // Clear the textarea
                    } else {
                        statusDiv.style.color = '#dc3545';
                        statusDiv.textContent = '❌ ' + result.message;
                    }
                } catch (error) {
                    statusDiv.style.color = '#dc3545';
                    statusDiv.textContent = '❌ Error sending text: ' + error.message;
                }
                
                // Clear status message after 5 seconds
                setTimeout(() => {
                    statusDiv.textContent = '';
                }, 5000);
            }

            // Allow Enter key (with Ctrl/Cmd) to send text
            document.addEventListener('DOMContentLoaded', function() {
                const textarea = document.getElementById('textToSend');
                textarea.addEventListener('keydown', function(e) {
                    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
                        e.preventDefault();
                        sendTextToMachine1();
                    }
                });
            });

            // Initialize
            updateNetworkInfo();
            setInterval(updateNetworkInfo, 3000);
            connectWebSocket();
        </script>
    </body>
    </html>
  `);
});

// Start server
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Machine 2 (Receiver) running on http://0.0.0.0:${PORT}`);
  console.log(`Local IP: ${getLocalIP()}`);
  console.log(`WebSocket server listening on port ${WEBSOCKET_PORT} for Machine 1`);
  console.log(`Discovery server listening on port ${DISCOVERY_PORT}`);
  console.log(`Web interface WebSocket server listening on port 3004`);
  console.log(`\nMachine 1 will automatically discover this machine on the network.`);
});

console.log('Ready to accept connections from Machine 1...');