import { NextRequest } from 'next/server'
import { WebSocketServer } from 'ws'

const port = 3006
let wss: WebSocketServer | null = null

// Store connected clients - separate sets for different types
const communicatorClients = new Set<any>() // app1.js connections
const browserClients = new Set<any>() // browser connections from fragments app

// Initialize WebSocket server only once
if (!wss) {
  try {
    wss = new WebSocketServer({ port })
    console.log(`WebSocket server listening on port ${port}`)

    wss.on('connection', (ws, req) => {
      const userAgent = req.headers['user-agent'] || ''
      const isBrowser = userAgent.includes('Mozilla') || userAgent.includes('Chrome') || userAgent.includes('Safari')
      
      if (isBrowser) {
        console.log('New WebSocket connection from browser (fragments app)')
        browserClients.add(ws)
      } else {
        console.log('New WebSocket connection from communicator')
        communicatorClients.add(ws)
      }

      ws.on('message', (data) => {
        try {
          const message = JSON.parse(data.toString())
          console.log('Received message:', message)
          
          // If message is from communicator, broadcast to all browser clients
          if (communicatorClients.has(ws)) {
            console.log('Broadcasting message to browser clients:', browserClients.size)
            browserClients.forEach(browserWs => {
              if (browserWs.readyState === 1) { // OPEN
                browserWs.send(JSON.stringify(message))
              }
            })
          }
        } catch (error) {
          console.error('Error parsing WebSocket message:', error)
        }
      })

      ws.on('close', () => {
        console.log('WebSocket connection closed')
        communicatorClients.delete(ws)
        browserClients.delete(ws)
      })

      ws.on('error', (error) => {
        console.error('WebSocket error:', error)
        communicatorClients.delete(ws)
        browserClients.delete(ws)
      })
    })

    wss.on('error', (error) => {
      console.error('WebSocket server error:', error)
    })
  } catch (error) {
    console.error('Failed to create WebSocket server:', error)
  }
}

// API endpoint to register message handlers and get messages
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const action = searchParams.get('action')

  if (action === 'status') {
    return Response.json({
      running: !!wss,
      communicatorClientsConnected: communicatorClients.size,
      browserClientsConnected: browserClients.size,
      port: port
    })
  }

  return Response.json({ error: 'Unknown action' }, { status: 400 })
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { action } = body

    if (action === 'status') {
      return Response.json({
        running: !!wss,
        communicatorClientsConnected: communicatorClients.size,
        browserClientsConnected: browserClients.size,
        port: port
      })
    }

    return Response.json({ error: 'Unknown action' }, { status: 400 })
  } catch (error) {
    console.error('Error in WebSocket API:', error)
    return Response.json({ error: 'Internal server error' }, { status: 500 })
  }
}