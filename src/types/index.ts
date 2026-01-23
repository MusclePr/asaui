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
  displayName?: string;
  eosId: string;
  lastLogin: string;
  isWhitelisted: boolean;
  isBypassed: boolean;
}
