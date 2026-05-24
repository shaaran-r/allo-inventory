#!/usr/bin/env node
import { execSync } from "child_process";

const token = process.env.GITHUB_TOKEN;
if (!token) {
  console.error("GITHUB_TOKEN is not set");
  process.exit(1);
}

const repo = "https://shaaran-r:TOKEN@github.com/shaaran-r/allo-inventory.git".replace("TOKEN", token);

function run(cmd, opts = {}) {
  console.log(`$ ${cmd.replace(token, "***")}`);
  return execSync(cmd, { stdio: "inherit", ...opts });
}

// Set remote URL (update if exists)
try {
  run(`git remote set-url origin "${repo}"`);
} catch {
  run(`git remote add origin "${repo}"`);
}

// Push all branches and tags
run("git push -u origin main --force");

console.log("\nDone! Code pushed to https://github.com/shaaran-r/allo-inventory");
