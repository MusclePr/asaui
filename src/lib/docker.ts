import Docker from 'dockerode';
import { ContainerStatus } from '@/types';
import { getServers } from './config';
import { getMapDisplayName } from './maps';

const docker = new Docker({ socketPath: '/var/run/docker.sock' });

export async function getContainers(): Promise<ContainerStatus[]> {
  const containers = await docker.listContainers({ all: true });
  const definedServers = getServers();

  return definedServers.map(server => {
    // Find container by container_name (usually includes service name)
    const container = containers.find(c => 
      c.Names.some(name => name === `/${server.containerName}` || name === `/${server.id}`)
    );

    if (container) {
      return {
        id: container.Id,
        name: server.containerName,
        image: container.Image,
        state: container.State,
        status: container.Status,
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
  });
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
  // Use docker exec to run rcon command inside the container
  // Assuming the container has 'manager' or or similar RCON tool
  const container = docker.getContainer(containerIdOrName);
  const exec = await container.exec({
    Cmd: ['manager', 'rcon', command],
    AttachStdout: true,
    AttachStderr: true
  });

  const stream = await exec.start({});
  return new Promise((resolve, reject) => {
    let output = "";
    stream.on('data', (chunk) => output += chunk.toString());
    stream.on('end', () => resolve(output));
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
