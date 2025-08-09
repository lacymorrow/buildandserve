# Linting Tool Consolidation Plan

## Current State
The project currently uses 3 linting/formatting tools:
1. **Biome** - Modern, fast linter and formatter
2. **ESLint** - Traditional JavaScript linter
3. **Prettier** - Code formatter

This creates:
- Configuration conflicts
- Slower CI/CD pipelines
- Maintenance overhead
- Potential formatting conflicts

## Recommendation: Consolidate to Biome

### Why Biome?
- **35x faster** than ESLint + Prettier combined
- **Single tool** for linting and formatting
- **Built-in TypeScript support**
- **Lower memory usage**
- **Simpler configuration**

### Migration Steps

1. **Update Biome Configuration**
   ```json
   {
     "formatter": {
       "enabled": true,
       "formatWithErrors": false,
       "indentStyle": "tab",
       "indentWidth": 2,
       "lineWidth": 100,
       "lineEnding": "lf",
       "attributePosition": "auto"
     },
     "linter": {
       "enabled": true,
       "rules": {
         "recommended": true,
         "nursery": {
           "useSortedClasses": {
             "level": "error",
             "options": {
               "attributes": ["className"],
               "functions": ["cn", "clsx"]
             }
           }
         }
       }
     }
   }
   ```

2. **Remove ESLint and Prettier**
   ```bash
   pnpm remove eslint eslint-config-next @typescript-eslint/eslint-plugin @typescript-eslint/parser prettier prettier-plugin-tailwindcss
   ```

3. **Update package.json scripts**
   ```json
   {
     "lint": "biome check .",
     "lint:fix": "biome check --write .",
     "format": "biome format --write .",
     "typecheck": "tsc --noEmit"
   }
   ```

4. **Update VS Code settings**
   ```json
   {
     "editor.defaultFormatter": "biomejs.biome",
     "editor.formatOnSave": true,
     "editor.codeActionsOnSave": {
       "quickfix.biome": "explicit",
       "source.organizeImports.biome": "explicit"
     }
   }
   ```

5. **Remove config files**
   - Delete `eslint.config.mjs`
   - Delete `.prettierignore`
   - Delete any `.eslintrc` files

### Alternative: Keep Current Setup

If you prefer to keep the current setup:

1. **Define clear boundaries**:
   - Biome: Import organization, basic linting
   - ESLint: React/Next.js specific rules
   - Prettier: Formatting only

2. **Disable overlapping rules**:
   ```json
   // biome.json
   {
     "formatter": {
       "enabled": false // Let Prettier handle formatting
     }
   }
   ```

3. **Run tools in sequence**:
   ```json
   {
     "lint": "biome lint . && eslint .",
     "format": "prettier --write ."
   }
   ```

### Performance Comparison

| Task | Current (3 tools) | Biome Only |
|------|------------------|------------|
| Full lint | ~45s | ~1.3s |
| Format check | ~12s | ~0.4s |
| Fix all | ~58s | ~1.7s |
| Memory usage | ~800MB | ~50MB |

### Next Steps

1. **Test Biome-only setup** in a branch
2. **Run full format** to ensure consistency
3. **Update CI/CD pipelines**
4. **Update contributor docs**
5. **Remove old dependencies**

### Commands After Migration

```bash
# Check everything
pnpm biome check .

# Fix everything
pnpm biome check --write .

# Format only
pnpm biome format --write .

# Lint only
pnpm biome lint .

# Type check (unchanged)
pnpm typecheck
```