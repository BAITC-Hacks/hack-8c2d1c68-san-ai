import type { NextConfig } from "next";
const config: NextConfig = {
  serverExternalPackages: ["@electric-sql/pglite", "pg", "unpdf"],
  poweredByHeader: false,
  agentRules: false,
};
export default config;
