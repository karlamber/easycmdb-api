#!/bin/sh

# Run lint-staged first
npx lint-staged

npx tsc --noEmit
npm run prettier-format
npm run lint:arch

# Then, stage the files
git add .
