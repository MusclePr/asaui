export interface ContainerStatus {
  id: string;
  name: string;
  image: string;
  state: string;
  status: string;
  map?: string;
}

export interface PlayerInfo {
  name: string;
  steamId: string;
  lastLogin: string;
  isWhitelisted: boolean;
}
