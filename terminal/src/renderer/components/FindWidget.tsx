import React, { useState, useEffect, useRef, useCallback } from 'react';
import { X, ChevronUp, ChevronDown, Search } from 'lucide-react';
import { Map as SessionMap } from '@shared/types';

interface FindWidgetProps {
  sessionId: string;
  onClose: () => void;
  sessions: SessionMap<any>;
}

export function FindWidget({ sessionId, onClose, sessions }: FindWidgetProps) {
  const [query, setQuery] = useState('');
  const [regex, setRegex] = useState(false);
  const [caseSensitive, setCaseSensitive] = useState(false);
  const [matches, setMatches] = useState<Array<{ line: number; col: number; length: number }>>([]);
  const [currentMatch, setCurrentMatch] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const terminalRef = useRef<any>(null);

  const session = sessions.get(sessionId);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    if (!session || !query) {
      setMatches([]);
      setCurrentMatch(0);
      return;
    }

    // Use terminal's search addon if available
    if (terminalRef.current && terminalRef.current.searchAddon) {
      // TODO: Use xterm search addon
    }
  }, [query, regex, caseSensitive, session]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      onClose();
    } else if (e.key === 'Enter') {
      if (e.shiftKey) {
        findPrev();
      } else {
        findNext();
      }
    }
  };

  const findNext = useCallback(() => {
    if (matches.length > 0) {
      setCurrentMatch(prev => (prev + 1) % matches.length);
    }
  }, [matches.length]);

  const findPrev = useCallback(() => {
    if (matches.length > 0) {
      setCurrentMatch(prev => (prev - 1 + matches.length) % matches.length);
    }
  }, [matches.length]);

  const handleQueryChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setQuery(e.target.value);
    setCurrentMatch(0);
  };

  return (
    <div className="find-widget" role="search" aria-label="Find in terminal">
      <div className="find-widget-header">
        <Search size={16} aria-hidden="true" />
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={handleQueryChange}
          onKeyDown={handleKeyDown}
          placeholder="Find..."
          className="find-input"
          autoComplete="off"
          spellCheck={false}
          aria-label="Find query"
        />
        <div className="find-options">
          <button
            className={`find-option ${regex ? 'active' : ''}`}
            onClick={() => setRegex(!regex)}
            title="Regular expression (Alt+R)"
            aria-pressed={regex}
          >
            .*
          </button>
          <button
            className={`find-option ${caseSensitive ? 'active' : ''}`}
            onClick={() => setCaseSensitive(!caseSensitive)}
            title="Case sensitive (Alt+C)"
            aria-pressed={caseSensitive}
          >
            Aa
          </button>
        </div>
        <div className="find-matches">
          {matches.length > 0 ? (
            <span>
              {currentMatch + 1} / {matches.length}
            </span>
          ) : (
            <span className="no-matches">No matches</span>
          )}
        </div>
        <div className="find-navigation">
          <button onClick={findPrev} disabled={matches.length === 0} aria-label="Previous match">
            <ChevronUp size={14} />
          </button>
          <button onClick={findNext} disabled={matches.length === 0} aria-label="Next match">
            <ChevronDown size={14} />
          </button>
        </div>
        <button className="find-close" onClick={onClose} aria-label="Close find">
          <X size={16} />
        </button>
      </div>
    </div>
  );
}