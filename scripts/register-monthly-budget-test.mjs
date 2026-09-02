// Loader setup for the monthly budget tests: the `@/*` alias plus an
// in-memory AsyncStorage, since the real package only runs on a device.
import {register} from 'node:module';

// Force UTC before the module graph loads, so the Asia/Bangkok assertions in
// the suite prove the budget uses Bangkok time rather than the machine clock.
process.env.TZ = 'UTC';

register('./ts-alias-loader.mjs', import.meta.url);
register('./async-storage-stub-loader.mjs', import.meta.url);
