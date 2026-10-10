import { defineConfig } from '@playwright/test';
export default defineConfig({
 testDir:'./tests/browser',timeout:30000,workers:1,
 use:{baseURL:'http://127.0.0.1:18765',headless:true},
 webServer:{command:'node tests/harness/server.mjs',url:'http://127.0.0.1:18765',reuseExistingServer:false}
});
