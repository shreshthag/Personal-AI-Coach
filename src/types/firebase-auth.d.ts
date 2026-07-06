// firebase/auth ships `getReactNativePersistence` only in its React Native build
// (index.rn.js); the default type definitions omit it. Metro resolves the RN build
// at runtime, so we augment the module's types to match what actually loads on device.
// The top-level import keeps this file a module so `declare module` augments rather
// than replaces firebase/auth's own types.
import type { Persistence } from "firebase/auth";

declare module "firebase/auth" {
  export function getReactNativePersistence(storage: unknown): Persistence;
}
