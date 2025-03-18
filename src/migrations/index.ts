import * as migration_20250314_043303 from './20250314_043303';

export const migrations = [
  {
    up: migration_20250314_043303.up,
    down: migration_20250314_043303.down,
    name: '20250314_043303'
  },
];
