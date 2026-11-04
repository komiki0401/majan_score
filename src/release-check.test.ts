import {describe,it,expect} from 'vitest';
// @ts-expect-error The release CLI is native JavaScript, shared with CI.
import {hasSecret,git} from '../scripts/release-check.mjs';
describe('release Git execution',()=>{
 it('reads the real release source list through asynchronous Git execution',async()=>{
  const files=(await git('ls-files','-z')).split('\0');
  expect(files).toContain('package.json');
  expect(files).toContain('scripts/release-check.mjs');
 });
 it('propagates Git failures instead of treating failed checks as successful',async()=>{
  await expect(git('--janroku-invalid-option')).rejects.toThrow();
 });
});
describe('release secret detection',()=>{
 it('rejects secret and service-role keys, while allowing public keys',()=>{
  expect(hasSecret('sb_'+'secret_'+'a'.repeat(24))).toBe(true);
  const token=(role:string)=>['eyJhbGciOiJIUzI1NiJ9',btoa(JSON.stringify({role})).replaceAll('=','').replaceAll('+','-').replaceAll('/','_'),'signature'].join('.');
  expect(hasSecret(token('service_role'))).toBe(true);
  expect(hasSecret(token('anon'))).toBe(false);
  expect(hasSecret('sb_publishable_'+'a'.repeat(24))).toBe(false);
 });
});
