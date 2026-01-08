rm -rf node_modules dist 2> /dev/null ; pnpm install --frozen-lockfile
pnpm run build && pnpm run test