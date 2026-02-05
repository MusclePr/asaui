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

const ADMIN_PASSWORD_REGEX = /^ServerAdminPassword=.*\r?\n/m;
const ADMIN_PASSWORD_EOF_REGEX = /^ServerAdminPassword=.*$/m;

export function readServerConfig(filename: string): string {
  const filePath = getServerConfigPath(filename);
  if (!fs.existsSync(filePath)) {
    return '';
  }

  let content = fs.readFileSync(filePath, 'utf-8');

  if (filename === 'GameUserSettings.ini') {
    // Remove ServerAdminPassword line for security, including the newline
    content = content.replace(ADMIN_PASSWORD_REGEX, '');
    // Also check for the case where it might be at the end of the file without a trailing newline
    content = content.replace(ADMIN_PASSWORD_EOF_REGEX, '');
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

    // Extract original password line (including newline if present)
    const match = originalContent.match(ADMIN_PASSWORD_REGEX) || originalContent.match(ADMIN_PASSWORD_EOF_REGEX);
    let originalPasswordLine = match ? match[0] : '';
    
    // Ensure it ends with at least one newline for proper insertion if it was at EOF
    if (originalPasswordLine && !originalPasswordLine.endsWith('\n')) {
      originalPasswordLine += '\n';
    }

    // Remove any password line from new content
    let cleanedContent = newContent.replace(ADMIN_PASSWORD_REGEX, '');
    cleanedContent = cleanedContent.replace(ADMIN_PASSWORD_EOF_REGEX, '');

    // If we had an original password, restore it
    if (originalPasswordLine) {
      if (cleanedContent.includes('[ServerSettings]')) {
        // Insert after [ServerSettings] header
        cleanedContent = cleanedContent.replace('[ServerSettings]', `[ServerSettings]\n${originalPasswordLine.trimEnd()}`);
      } else {
        // Append at the end if section not found
        cleanedContent = cleanedContent.trimEnd() + `\n\n[ServerSettings]\n${originalPasswordLine.trimEnd()}\n`;
      }
    }
    
    fs.writeFileSync(filePath, cleanedContent, 'utf-8');
  } else {
    // For Game.ini or others, just write directly
    fs.writeFileSync(filePath, newContent, 'utf-8');
  }
}
