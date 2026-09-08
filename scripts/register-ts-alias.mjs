// Entry hook for `node --import ./scripts/register-ts-alias.mjs`.
import {register} from 'node:module';

register('./ts-alias-loader.mjs', import.meta.url);
