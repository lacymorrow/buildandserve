import * as migration_20250310_042923 from './20250310_042923';
import * as migration_20250310_054114 from './20250310_054114';

export const migrations = [
  {
    up: migration_20250310_042923.up,
    down: migration_20250310_042923.down,
    name: '20250310_042923',
  },
  {
    up: migration_20250310_054114.up,
    down: migration_20250310_054114.down,
    name: '20250310_054114'
  },
];
