"use client";

import { useState } from "react";
import AppLayout from "@/components/AppLayout";
import { Send, Terminal as TerminalIcon, AlertCircle } from "lucide-react";

export default function RconPage() {
  const [command, setCommand] = useState("");
  const [output, setOutput] = useState<{ type: 'cmd' | 'res' | 'err', text: string }[]>([]);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!command.trim() || loading) return;

    const cmd = command.trim();
    setCommand("");
    setLoading(true);
    setOutput(prev => [...prev, { type: 'cmd', text: cmd }]);

    try {
      const res = await fetch("/api/rcon", {
        method: "POST",
        body: JSON.stringify({ command: cmd }),
      });
      const data = await res.json();
      
      if (res.ok) {
        setOutput(prev => [...prev, { type: 'res', text: data.output || "(No output)" }]);
      } else {
        setOutput(prev => [...prev, { type: 'err', text: data.error || "Failed to execute command" }]);
      }
    } catch (err) {
      setOutput(prev => [...prev, { type: 'err', text: "Network error occurred" }]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <AppLayout>
      <div className="flex flex-col h-[calc(100vh-12rem)] space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-3xl font-bold tracking-tight">RCON コマンド</h2>
        </div>

        <div className="flex-1 bg-black rounded-lg border p-4 font-mono text-sm overflow-y-auto space-y-2">
          {output.map((line, i) => (
            <div key={i} className={`flex gap-2 ${
              line.type === 'cmd' ? 'text-primary' : 
              line.type === 'err' ? 'text-destructive' : 
              'text-green-400'
            }`}>
              <span className="shrink-0">
                {line.type === 'cmd' ? '>' : line.type === 'err' ? '!' : '#'}
              </span>
              <span className="whitespace-pre-wrap">{line.text}</span>
            </div>
          ))}
          {output.length === 0 && (
            <div className="text-muted-foreground italic">
              コマンドを入力して実行してください (例: ListPlayers, ServerChat Hello)
            </div>
          )}
        </div>

        <form onSubmit={handleSubmit} className="flex gap-2">
          <div className="relative flex-1">
            <TerminalIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <input
              type="text"
              placeholder="コマンドを入力..."
              className="w-full pl-10 pr-4 py-2 bg-card border rounded-md focus:outline-none focus:ring-2 focus:ring-primary"
              value={command}
              onChange={(e) => setCommand(e.target.value)}
              disabled={loading}
            />
          </div>
          <button
            type="submit"
            disabled={loading || !command.trim()}
            className="px-4 py-2 bg-primary text-primary-foreground rounded-md flex items-center gap-2 disabled:opacity-50"
          >
            <Send className="h-4 w-4" /> 実行
          </button>
        </form>

        <div className="flex items-start gap-2 p-3 bg-muted rounded-md text-xs text-muted-foreground">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <p>
            注意: コマンドは `ARK_MAP_MAIN` で指定されたプライマリサーバーで実行されます。
            応答に時間がかかる場合があります。
          </p>
        </div>
      </div>
    </AppLayout>
  );
}
