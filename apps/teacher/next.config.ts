import type { NextConfig } from "next";

const config: NextConfig = {
  reactStrictMode: true,
  transpilePackages: [
    "@hakivo/ai",
    "@hakivo/billing",
    "@hakivo/congress",
    "@hakivo/db",
    "@hakivo/packet",
    "@hakivo/referral",
    "@hakivo/standards",
  ],
};

export default config;
