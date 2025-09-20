# Communicator Integration

This directory contains the communicator apps that enable cross-machine communication with the fragments app.

## Setup

### Prerequisites
Install dependencies for the communicator apps:

```bash
cd communicator
npm install express ws clipboardy screenshot-desktop
```

### Machine Setup

#### Machine 1 (Sender) - app1.js
- Runs on the machine where you want to send messages FROM
- Connects to Machine 2 (receiver) via WebSocket
- Connects to the local fragments app on port 3006
- Monitors clipboard changes and screenshot directory
- Sends all received messages to both Machine 2 and the fragments app

#### Machine 2 (Receiver) - app2.js  
- Runs on the remote machine that receives messages
- Provides a WebSocket server for Machine 1 to connect to
- Has a web interface to send messages back to Machine 1

## Running the Apps

### Start Machine 2 (Receiver) first:
```bash
cd communicator
node app2.js
```
- Web interface: http://localhost:3002
- WebSocket server: port 3003
- Discovery server: port 3005

### Start Machine 1 (Sender):
```bash
cd communicator  
node app1.js
```
- Web interface: http://localhost:3001
- Connects to fragments app on port 3006

### Start Fragments App:
```bash
npm run dev
```
- Runs on port 4000
- WebSocket server for communicator runs on port 3006

## Integration Flow

1. **Message from Machine 2 → Machine 1**: 
   - Machine 2 sends text/screenshot via WebSocket
   - Machine 1 receives and copies to clipboard
   - Machine 1 forwards to fragments app via WebSocket

2. **Fragments App Processing**:
   - Receives message via WebSocket API
   - Creates pre-prompt with context
   - Automatically adds message to chat
   - Submits to AI for processing
   - AI analyzes and responds

3. **Message Types Supported**:
   - **Text/Clipboard**: Questions, code, data analysis
   - **Screenshots**: Image analysis and problem solving

## Configuration

### app1.js Configuration:
- `FRAGMENTS_WS_PORT`: Port for fragments WebSocket (default: 3006)
- `SCREENSHOT_DIR`: Directory to monitor for new screenshots
- Machine 2 IP: Currently hardcoded to `192.168.1.189:3003`

### Fragments App:
- WebSocket server runs on port 3006
- Real-time message delivery (no polling needed)
- Auto-processes messages when not busy with other AI requests

## Troubleshooting

1. **Connection Issues**: 
   - Ensure all apps are running
   - Check firewall settings
   - Verify port availability

2. **Message Not Processing**:
   - Check WebSocket connection status
   - Ensure user is logged in to fragments app
   - Check browser console for errors

3. **Auto-discovery Issues**:
   - Update Machine 2 IP in app1.js if needed
   - Ensure both machines are on same network