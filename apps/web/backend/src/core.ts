import { createCoreServices, type CoreServices } from '@contour/core/services';
import type { CoreRuntimeConfig } from '@contour/core/runtime';

/** @deprecated Create a WebHostContext instead of importing a host singleton. */
export function createWebCoreServices(config: CoreRuntimeConfig): CoreServices {
  return createCoreServices(config);
}

export type WebCoreServices = ReturnType<typeof createWebCoreServices>;
