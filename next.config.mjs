/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    serverComponentsExternalPackages: ["dockerode", "ssh2"],
  },
  output: 'standalone',
};

export default nextConfig;
