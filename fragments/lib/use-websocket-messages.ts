'use client'

import { useEffect, useState, useCallback, useRef } from 'react'

export interface WebSocketMessage {
  type: 'text' | 'screenshot' | 'clipboard'
  content: string
  filename?: string
  timestamp: string
  source: string
}

export function useWebSocketMessages() {
  const [lastMessage, setLastMessage] = useState<WebSocketMessage | null>(null)
  const [isConnected, setIsConnected] = useState(false)
  const wsRef = useRef<WebSocket | null>(null)
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null)

  const connect = useCallback(() => {
    try {
      // Connect directly to the WebSocket server for real-time messages
      const ws = new WebSocket('ws://localhost:3006')
      wsRef.current = ws

      ws.onopen = () => {
        console.log('Connected to WebSocket server for real-time messages')
        setIsConnected(true)
      }

      ws.onmessage = (event) => {
        try {
          const message: WebSocketMessage = JSON.parse(event.data)
          console.log('Received real-time message:', message)
          setLastMessage(message)
        } catch (error) {
          console.error('Error parsing WebSocket message:', error)
        }
      }

      ws.onclose = () => {
        console.log('WebSocket connection closed, attempting to reconnect...')
        setIsConnected(false)
        wsRef.current = null
        
        // Reconnect after 3 seconds
        reconnectTimeoutRef.current = setTimeout(connect, 3000)
      }

      ws.onerror = (error) => {
        console.error('WebSocket error:', error)
        setIsConnected(false)
      }

    } catch (error) {
      console.error('Failed to connect to WebSocket:', error)
      // Retry connection after 5 seconds
      reconnectTimeoutRef.current = setTimeout(connect, 5000)
    }
  }, [])

  useEffect(() => {
    connect()

    return () => {
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current)
      }
      if (wsRef.current) {
        wsRef.current.close()
      }
    }
  }, [connect])

  return {
    lastMessage,
    isConnected,
  }
}