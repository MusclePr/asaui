import Docker from 'dockerode';
import { ContainerStatus } from '@/types';
import { SERVERS } from './config';

const docker = new Docker({ socketPath: '/var/run/docker.sock' });

export async function getContainers(): Promise<ContainerStatus[]> {
  const containers = await docker.listContainers({ all: true });
  return containers
    .filter(c => c.Names.some(name => SERVERS.some(s => name.includes(s.id))))
    .map(c => {
      const name = c.Names[0].replace(/^\//, "");
      const serverConfig = SERVERS.find(s => name.includes(s.id));
      return {
        id: c.Id,
        name: name,
        image: c.Image,
        state: c.State,
        status: c.Status,
        map: serverConfig?.map || ""
      };
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
  // Assuming the container has 'arkmanager' or or similar RCON tool
  const container = docker.getContainer(containerIdOrName);
  const exec = await container.exec({
    Cmd: ['arkmanager', 'rcon', command],
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
