import fs from 'node:fs';
import path from 'node:path';
import { CLUSTER_DIR } from './cluster';

const SERVER_DIR = path.join(CLUSTER_DIR, 'server');

export function getServerConfigPath(filename: string): string {
  // Only allow specific files for security
  if (filename !== 'GameUserSettings.ini' && filename !== 'Game.ini') {
    throw new Error('Invalid config filename');
  }
  return path.join(SERVER_DIR, filename);
}

const ADMIN_PASSWORD_REGEX = /^ServerAdminPassword=.*$/m;

export function readServerConfig(filename: string): string {
  const filePath = getServerConfigPath(filename);
  if (!fs.existsSync(filePath)) {
    return '';
  }

  let content = fs.readFileSync(filePath, 'utf-8');

  if (filename === 'GameUserSettings.ini') {
    // Remove ServerAdminPassword line for security
    content = content.replace(ADMIN_PASSWORD_REGEX, '');
  }

  return content;
}

export function writeServerConfig(filename: string, newContent: string): void {
  const filePath = getServerConfigPath(filename);
  
  if (filename === 'GameUserSettings.ini') {
    let originalContent = '';
    if (fs.existsSync(filePath)) {
      originalContent = fs.readFileSync(filePath, 'utf-8');
    }

    // Extract original password line
    const match = originalContent.match(ADMIN_PASSWORD_REGEX);
    const originalPasswordLine = match ? match[0] : '';

    // Remove any password line from new content (user might have tried to add one)
    let cleanedContent = newContent.replace(ADMIN_PASSWORD_REGEX, '');

    // If we had an original password, restore it
    if (originalPasswordLine) {
      if (cleanedContent.includes('[ServerSettings]')) {
        // Insert after [ServerSettings] header
        cleanedContent = cleanedContent.replace('[ServerSettings]', `[ServerSettings]\n${originalPasswordLine}`);
      } else {
        // Append at the end if section not found (unlikely for a valid GUS.ini)
        cleanedContent += `\n\n[ServerSettings]\n${originalPasswordLine}\n`;
      }
    }
    
    fs.writeFileSync(filePath, cleanedContent, 'utf-8');
  } else {
    // For Game.ini or others, just write directly
    fs.writeFileSync(filePath, newContent, 'utf-8');
  }
}
