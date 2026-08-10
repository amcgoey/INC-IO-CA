import * as vitest from 'vitest';

const testFn: any = vitest.test;
Object.assign(testFn, vitest);

export default testFn;
export const test = vitest.test;
export const describe = vitest.describe;
export const it = vitest.it;
export const beforeEach = vitest.beforeEach;
export const afterEach = vitest.afterEach;
export const before = vitest.beforeAll;
export const after = vitest.afterAll;
