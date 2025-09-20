import { NextRequest, NextResponse } from 'next/server'

// Store messages in memory for now (in production, you'd use a database)
let messageQueue: Array<{
  id: string
  type: 'text' | 'screenshot' | 'clipboard'
  content: string
  filename?: string
  timestamp: string
  source: string
}> = []

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { type, content, filename, source } = body

    if (!type || !content) {
      return NextResponse.json({ error: 'Missing required fields: type, content' }, { status: 400 })
    }

    // Create message with unique ID
    const message = {
      id: Date.now().toString() + Math.random().toString(36).substr(2, 9),
      type,
      content,
      filename,
      timestamp: new Date().toISOString(),
      source: source || 'app1.js'
    }

    // Add to queue
    messageQueue.push(message)
    
    console.log('📨 Received message from app1.js:', { type, source, contentLength: content.length })

    return NextResponse.json({ 
      success: true, 
      message: 'Message received successfully',
      messageId: message.id
    })

  } catch (error) {
    console.error('Error processing message:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const since = searchParams.get('since')
    const limit = parseInt(searchParams.get('limit') || '10')

    let messages = messageQueue

    // Filter by timestamp if 'since' parameter is provided
    if (since) {
      const sinceDate = new Date(since)
      messages = messages.filter(msg => new Date(msg.timestamp) > sinceDate)
    }

    // Limit results
    messages = messages.slice(-limit)

    return NextResponse.json({
      success: true,
      messages,
      totalCount: messageQueue.length
    })

  } catch (error) {
    console.error('Error retrieving messages:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// Clear all messages (for testing)
export async function DELETE() {
  messageQueue = []
  return NextResponse.json({ success: true, message: 'All messages cleared' })
}