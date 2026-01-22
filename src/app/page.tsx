"use client";

import { useEffect, useState } from "react";
import AppLayout from "@/components/AppLayout";
import { Play, Square, RotateCcw, FileText } from "lucide-react";
import { ContainerStatus } from "@/types";

export default function Dashboard() {
  const [containers, setContainers] = useState<ContainerStatus[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchStatus = async () => {
    try {
      const res = await fetch("/api/containers");
      const data = await res.json();
      if (Array.isArray(data)) {
        setContainers(data);
      } else {
        console.error("Data is not an array:", data);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStatus();
    const interval = setInterval(fetchStatus, 10000);
    return () => clearInterval(interval);
  }, []);

  const handleAction = async (id: string, action: string) => {
    try {
      await fetch(`/api/containers/${id}`, {
        method: "POST",
        body: JSON.stringify({ action }),
      });
      fetchStatus();
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <AppLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h2 className="text-3xl font-bold tracking-tight">サーバー状況</h2>
          <button 
            onClick={fetchStatus}
            className="px-4 py-2 bg-secondary text-secondary-foreground rounded text-sm hover:bg-secondary/80"
          >
            更新
          </button>
        </div>

        {loading ? (
          <div>Loading servers...</div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {containers.map((c) => (
              <div key={c.id} className="p-6 bg-card border rounded-lg space-y-4">
                <div className="flex justify-between items-start">
                  <div>
                    <h3 className="font-bold text-lg">{c.name}</h3>
                    <p className="text-sm text-muted-foreground">{c.image}</p>
                  </div>
                  <span className={`px-2 py-1 rounded-full text-xs font-semibold ${
                    c.state === 'running' ? 'bg-green-500/10 text-green-500' : 
                    c.state === 'exited' ? 'bg-red-500/10 text-red-500' : 
                    'bg-yellow-500/10 text-yellow-500'
                  }`}>
                    {c.state.toUpperCase()}
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div>
                    <p className="text-muted-foreground">Map</p>
                    <p>{c.map || 'N/A'}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Status</p>
                    <p className="truncate">{c.status}</p>
                  </div>
                </div>

                <div className="flex gap-2 pt-2">
                  {c.state !== 'running' ? (
                    <button
                      onClick={() => handleAction(c.id, 'start')}
                      className="flex-1 flex items-center justify-center gap-1 py-2 bg-primary text-primary-foreground rounded text-sm font-medium hover:bg-primary/90"
                    >
                      <Play className="h-4 w-4" /> Start
                    </button>
                  ) : (
                    <button
                      onClick={() => handleAction(c.id, 'stop')}
                      className="flex-1 flex items-center justify-center gap-1 py-2 bg-destructive text-destructive-foreground rounded text-sm font-medium hover:bg-destructive/90"
                    >
                      <Square className="h-4 w-4" /> Stop
                    </button>
                  )}
                  <button
                    onClick={() => handleAction(c.id, 'restart')}
                    className="p-2 bg-secondary text-secondary-foreground rounded hover:bg-secondary/80"
                    title="Restart"
                  >
                    <RotateCcw className="h-4 w-4" />
                  </button>
                  <button
                    className="p-2 bg-secondary text-secondary-foreground rounded hover:bg-secondary/80"
                    title="Logs"
                  >
                    <FileText className="h-4 w-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </AppLayout>
  );
}
