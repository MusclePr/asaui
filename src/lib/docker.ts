import Docker from 'dockerode';
import { ContainerStatus } from '@/types';
import { getServers } from './config';
import { getMapDisplayName } from './maps';

const docker = new Docker({ socketPath: '/var/run/docker.sock' });

export async function getContainers(): Promise<ContainerStatus[]> {
  const containers = await docker.listContainers({ all: true });
  const definedServers = getServers();

  return Promise.all(definedServers.map(async server => {
    // Find container by container_name (usually includes service name)
    const container = containers.find(c => 
      c.Names.some(name => name === `/${server.containerName}` || name === `/${server.id}`)
    );

    if (container) {
      // Extract health from status string: "Up X hours (healthy)"
      let health: string | undefined = undefined;
      const healthMatch = container.Status.match(/\((healthy|unhealthy|starting)\)/);
      if (healthMatch) {
        health = healthMatch[1];
      }

      let isStopping = false;
      if (container.State === 'running') {
        try {
          // Check for shutdown signal in recent logs
          const c = docker.getContainer(container.Id);
          // tail 20 to be safe, no timestamps to keep it clean
          const logBuffer = await c.logs({
            stdout: true,
            stderr: true,
            tail: 20
          }) as unknown as Buffer;
          
          const logText = logBuffer.toString('utf-8');
          // Match the exact message from start.sh: LogWarn "Received shutdown signal. Exiting..."
          // We search for the text part as ANSI codes might be present
          if (logText.includes("Received shutdown signal. Exiting...")) {
            isStopping = true;
          }
        } catch (e) {
          // Ignore log fetch errors but log to console
          console.warn(`Failed to check logs for stopping state on ${server.id}:`, e);
        }
      }

      return {
        id: container.Id,
        name: server.containerName,
        image: container.Image,
        state: container.State,
        status: container.Status,
        health,
        isStopping,
        map: getMapDisplayName(server.map),
        mapRaw: server.map,
        sessionName: server.sessionName,
        isManaged: true
      };
    } else {
      return {
        id: server.id, // Use service ID as fallback
        name: server.containerName,
        image: "(not created)",
        state: "not_created",
        status: "Not created",
        map: getMapDisplayName(server.map),
        mapRaw: server.map,
        sessionName: server.sessionName,
        isManaged: true
      };
    }
  }));
}

export async function manageContainer(id: string, action: string) {
  const container = docker.getContainer(id);
  switch (action) {
    case "start": await container.start(); break;
    case "stop": await container.stop(); break;
    case "restart": await container.restart(); break;
  }
}

export async function execRcon(containerIdOrName: string, command: string): Promise<string> {
  const container = docker.getContainer(containerIdOrName);
  const exec = await container.exec({
    Cmd: ['manager', 'rcon', command],
    AttachStdout: true,
    AttachStderr: true,
    Tty: false // Multiplexed stream preserves output integrity
  });

  const stream = await exec.start({});
  return new Promise((resolve, reject) => {
    let output = "";
    
    // Using a simple state machine to demux without external dependencies
    // Docker multiplexed header is 8 bytes: [type, 0, 0, 0, size1, size2, size3, size4]
    let buffer = Buffer.alloc(0);

    stream.on('data', (chunk: Buffer) => {
      buffer = Buffer.concat([buffer, chunk]);
      
      while (buffer.length >= 8) {
        const type = buffer[0];
        const size = buffer.readUInt32BE(4);
        
        if (buffer.length >= 8 + size) {
          const content = buffer.subarray(8, 8 + size).toString('utf-8');
          output += content;
          buffer = buffer.subarray(8 + size);
        } else {
          break; // Wait for more data
        }
      }
    });

    stream.on('end', () => {
      // If there's anything left in output or buffer (in case Tty was actually true)
      if (output === "" && buffer.length > 0) {
        output = buffer.toString('utf-8');
      }
      resolve(output.trim());
    });
    stream.on('error', reject);
  });
}

export async function getContainerLogsStream(id: string) {
  const container = docker.getContainer(id);
  const containerInfo = await container.inspect();
  const isTty = containerInfo.Config.Tty;

  return await container.logs({
    stdout: true,
    stderr: true,
    follow: true,
    tail: 1000,
    timestamps: true
  });
}
