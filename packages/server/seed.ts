// Run once to bootstrap the first tenant + builder user:
//   npx tsx seed.ts
import { config as loadEnv } from 'dotenv';
loadEnv();

import * as tenantService from './src/services/tenantService.js';
import * as userService from './src/services/userService.js';

const TENANT_NAME   = 'Default';
const ADMIN_USER    = 'admin';
const ADMIN_PASS    = 'changeme123';

const tenant = await tenantService.createTenant(TENANT_NAME);
console.log(`Tenant created: ${tenant.tenantId}  (${tenant.name})`);

const user = await userService.createUser(tenant.tenantId, ADMIN_USER, ADMIN_PASS, 'builder');
console.log(`Builder user created: ${user.username}`);
console.log('\nLog in at http://localhost:5173/admin');
console.log(`  username: ${ADMIN_USER}`);
console.log(`  password: ${ADMIN_PASS}`);
console.log('\nChange the password after first login!');
