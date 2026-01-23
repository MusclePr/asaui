/** @type {import('next').NextConfig} */
const nextConfig = {
  serverExternalPackages: ["dockerode", "ssh2"],
  output: 'standalone',
};

export default nextConfig;
