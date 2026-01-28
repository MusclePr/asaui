/** @type {import('next').NextConfig} */
const nextConfig = {
  serverExternalPackages: ["dockerode", "ssh2"],
  output: 'standalone',
  basePath: process.env.NEXT_PUBLIC_BASE_PATH && process.env.NEXT_PUBLIC_BASE_PATH !== '/' 
    ? process.env.NEXT_PUBLIC_BASE_PATH 
    : '',
};

export default nextConfig;
