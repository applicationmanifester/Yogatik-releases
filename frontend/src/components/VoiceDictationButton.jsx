import React, { useState, useEffect, useRef } from 'react'
import { Mic, MicOff, AlertCircle } from 'lucide-react'

/**
 * Real-time Voice Dictation Orb with live audio animation.
 * Streams speech-to-text directly into composer input.
 */
export function VoiceDictationButton({
  onTranscript,
  disabled = false,
}) {
  const [isListening, setIsListening] = useState(false)
  const [supported, setSupported] = useState(true)
  const recognitionRef = useRef(null)

  useEffect(() => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition
    if (!SpeechRecognition) {
      setSupported(false)
      return
    }

    try {
      const recognition = new SpeechRecognition()
      recognition.continuous = true
      recognition.interimResults = true
      recognition.lang = navigator.language || 'en-US'

      recognition.onresult = (event) => {
        let interimTranscript = ''
        let finalTranscript = ''

        for (let i = event.resultIndex; i < event.results.length; ++i) {
          if (event.results[i].isFinal) {
            finalTranscript += event.results[i][0].transcript
          } else {
            interimTranscript += event.results[i][0].transcript
          }
        }

        const text = finalTranscript || interimTranscript
        if (text) {
          onTranscript?.(text, !!finalTranscript)
        }
      }

      recognition.onerror = (e) => {
        if (e.error !== 'no-speech') {
          setIsListening(false)
        }
      }

      recognition.onend = () => {
        setIsListening(false)
      }

      recognitionRef.current = recognition
    } catch {
      setSupported(false)
    }

    return () => {
      try {
        recognitionRef.current?.stop()
      } catch {}
    }
  }, [onTranscript])

  const toggleListening = () => {
    if (!supported || disabled) return

    if (isListening) {
      try {
        recognitionRef.current?.stop()
      } catch {}
      setIsListening(false)
    } else {
      try {
        recognitionRef.current?.start()
        setIsListening(true)
      } catch {
        setIsListening(false)
      }
    }
  }

  if (!supported) return null

  return (
    <button
      type="button"
      className={`voice-dictation-btn ${isListening ? 'listening' : ''}`}
      onClick={toggleListening}
      disabled={disabled}
      title={isListening ? 'Stop voice recording' : 'Dictate with voice (Speech-to-Text)'}
      aria-label={isListening ? 'Stop voice dictation' : 'Start voice dictation'}
      aria-pressed={isListening}
    >
      {isListening ? (
        <div className="voice-active-cluster">
          <span className="voice-pulse-orb" />
          <div className="voice-wave-bars">
            <span className="wave-bar bar-1" />
            <span className="wave-bar bar-2" />
            <span className="wave-bar bar-3" />
          </div>
          <MicOff size={14} className="mic-icon" />
        </div>
      ) : (
        <Mic size={15} className="mic-icon" />
      )}
    </button>
  )
}
