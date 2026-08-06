import { createCoreServices } from '@contour/core/services';
import type { CoreRuntimeConfig } from '@contour/core/runtime';

/** @deprecated Create a WebHostContext instead of importing a host singleton. */
export function createWebCoreServices(config: CoreRuntimeConfig) {
  return createCoreServices(config);
}

export type WebCoreServices = ReturnType<typeof createWebCoreServices>;
