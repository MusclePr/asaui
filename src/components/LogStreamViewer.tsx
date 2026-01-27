"use client";

import React, { useEffect, useRef, useState, useMemo } from 'react';
import { Terminal } from 'lucide-react';
import Convert from 'ansi-to-html';

interface LogEntry {
  text: string;
  html: string;
  timestamp?: string;
}

interface LogStreamViewerProps {
  containerId: string;
  containerName: string;
  maxLines?: number;
}

export default function LogStreamViewer({
  containerId,
  containerName,
  maxLines = 1000
}: LogStreamViewerProps) {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [autoScroll, setAutoScroll] = useState(true);

  const converter = useMemo(() => new Convert({
    newline: false,
    escapeXML: true,
    stream: true
  }), []);

  useEffect(() => {
    let eventSource: EventSource | null = null;

    const connectStream = () => {
      setIsConnected(false);
      setError(null);
      
      eventSource = new EventSource(`/api/containers/${containerId}/logs`);

      eventSource.onopen = () => {
        setIsConnected(true);
      };

      eventSource.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.error === 'Container not found') {
            setError('コンテナが見つかりません（停止中または削除済み）');
            setIsConnected(false);
            eventSource?.close();
            return;
          }
          if (data.text) {
            // Docker timestamps usually look like: 2026-01-27T03:02:21.142824289Z
            // We split by newline and filter out actual empty lines
            const rawLines = data.text.replace(/\r/g, '').split('\n');
            
            const entries: LogEntry[] = rawLines
              .filter((line: string) => line.length > 0)
              .map((line: string) => {
                // Regex to match Docker timestamp at the start
                const tsMatch = line.match(/^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d+Z)\s?(.*)$/);
                
                if (tsMatch) {
                  const [_, timestamp, message] = tsMatch;
                  return {
                    text: message,
                    html: converter.toHtml(message),
                    timestamp: timestamp
                  };
                }
                
                return {
                  text: line,
                  html: converter.toHtml(line)
                };
              });
            
            setLogs(prev => {
              const updated = [...prev, ...entries];
              if (updated.length > maxLines) {
                return updated.slice(updated.length - maxLines);
              }
              return updated;
            });
          }
        } catch (err) {
          console.error('Error parsing log data:', err);
        }
      };

      eventSource.onerror = (err) => {
        // Don't log as error if it's just a closure
        if (eventSource?.readyState === EventSource.CLOSED) {
          return;
        }
        
        console.error('EventSource error:', err);
        setError('Connection lost. Reconnecting...');
        setIsConnected(false);
        eventSource?.close();
        
        // Retry connection after a delay
        setTimeout(connectStream, 3000);
      };
    };

    connectStream();

    return () => {
      if (eventSource) {
        eventSource.close();
      }
    };
  }, [containerId, maxLines]);

  // Auto-scroll logic
  useEffect(() => {
    if (autoScroll && scrollRef.current) {
      const scrollContainer = scrollRef.current;
      // Use requestAnimationFrame to ensure the DOM has updated and the scrollHeight is correct
      requestAnimationFrame(() => {
        scrollContainer.scrollTop = scrollContainer.scrollHeight;
      });
    }
  }, [logs, autoScroll]);

  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const target = e.currentTarget;
    const isAtBottom = Math.abs(target.scrollHeight - target.clientHeight - target.scrollTop) < 10;
    setAutoScroll(isAtBottom);
  };

  return (
    <div className="flex flex-col h-full w-full bg-black rounded-lg border border-gray-800 shadow-xl overflow-hidden font-mono text-sm leading-relaxed">
      <div className="flex items-center justify-between px-4 py-2 bg-gray-900 border-b border-gray-800 text-gray-400">
        <div className="flex items-center gap-2">
          <Terminal className="h-4 w-4" />
          <span className="font-semibold">{containerName} Logs</span>
          <span className={`h-2 w-2 rounded-full ${isConnected ? 'bg-green-500' : 'bg-red-500 animate-pulse'}`} />
        </div>
        <div className="flex items-center gap-4 text-xs">
          {error && <span className="text-yellow-500 font-bold">{error}</span>}
          <span>{logs.length} / {maxLines} lines</span>
          <button 
            onClick={() => setLogs([])}
            className="hover:text-white transition-colors"
          >
            Clear
          </button>
        </div>
      </div>
      
      <div 
        ref={scrollRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto p-4 text-gray-300 scrollbar-thin scrollbar-thumb-gray-800 scrollbar-track-transparent"
      >
        {logs.length === 0 && !error && (
          <div className="flex items-center justify-center h-full text-gray-600 italic">
            Waiting for logs...
          </div>
        )}
        {logs.map((entry, i) => (
          <div key={i} className="flex gap-4 hover:bg-gray-900 px-1 -mx-1 group min-w-0">
             <span 
               className={`text-gray-600 select-none group-hover:text-gray-500 w-12 shrink-0 text-right tabular-nums border-r border-gray-800 pr-2 ${entry.timestamp ? 'cursor-help' : ''}`}
               title={entry.timestamp ? new Date(entry.timestamp).toLocaleString() : undefined}
             >
               {i + 1}
             </span>
             <span 
               className="whitespace-pre-wrap break-all flex-1 min-w-0" 
               dangerouslySetInnerHTML={{ __html: entry.html }} 
             />
          </div>
        ))}
      </div>
      
      {!autoScroll && logs.length > 0 && (
        <button 
          onClick={() => setAutoScroll(true)}
          className="absolute bottom-20 left-1/2 -translate-x-1/2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-1 rounded-full text-xs shadow-lg transition-all"
        >
          Resume Auto-scroll
        </button>
      )}
    </div>
  );
}
