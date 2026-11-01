import {describe,it,expect} from 'vitest';
// @ts-expect-error The release CLI is native JavaScript, shared with CI.
import {hasSecret} from '../scripts/release-check.mjs';
describe('release secret detection',()=>{
 it('rejects secret and service-role keys, while allowing public keys',()=>{
  expect(hasSecret('sb_'+'secret_'+'a'.repeat(24))).toBe(true);
  const token=(role:string)=>['eyJhbGciOiJIUzI1NiJ9',btoa(JSON.stringify({role})).replaceAll('=','').replaceAll('+','-').replaceAll('/','_'),'signature'].join('.');
  expect(hasSecret(token('service_role'))).toBe(true);
  expect(hasSecret(token('anon'))).toBe(false);
  expect(hasSecret('sb_publishable_'+'a'.repeat(24))).toBe(false);
 });
});
