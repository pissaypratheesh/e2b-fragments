import { useEffect, useState, useCallback, useRef } from 'react'

export interface ApiMessage {
  id: string
  type: 'text' | 'screenshot' | 'clipboard'
  content: string
  filename?: string
  timestamp: string
  source: string
}

export function useApiMessages() {
  const [lastMessage, setLastMessage] = useState<ApiMessage | null>(null)
  const [isConnected, setIsConnected] = useState(false)
  const processedMessageIds = useRef<Set<string>>(new Set())
  const pollingIntervalRef = useRef<NodeJS.Timeout | null>(null)
  const lastPollTime = useRef<string>(new Date().toISOString())

  const pollForMessages = useCallback(async () => {
    try {
      const response = await fetch(`/api/receive-message?since=${lastPollTime.current}&limit=10`)
      
      if (response.ok) {
        const data = await response.json()
        setIsConnected(true)
        
        if (data.messages && data.messages.length > 0) {
          // Process new messages
          for (const message of data.messages) {
            if (!processedMessageIds.current.has(message.id)) {
              console.log('📥 New message received via API:', message)
              setLastMessage(message)
              processedMessageIds.current.add(message.id)
              
              // Update last poll time to the latest message timestamp
              lastPollTime.current = message.timestamp
            }
          }
        }
      } else {
        console.warn('Failed to poll for messages:', response.status)
        setIsConnected(false)
      }
    } catch (error) {
      console.error('Error polling for messages:', error)
      setIsConnected(false)
    }
  }, [])

  useEffect(() => {
    // Start polling every 2 seconds
    pollingIntervalRef.current = setInterval(pollForMessages, 2000)
    
    // Initial poll
    pollForMessages()

    return () => {
      if (pollingIntervalRef.current) {
        clearInterval(pollingIntervalRef.current)
      }
    }
  }, [pollForMessages])

  const clearProcessedMessages = useCallback(() => {
    processedMessageIds.current.clear()
  }, [])

  return {
    lastMessage,
    isConnected,
    clearProcessedMessages,
  }
}