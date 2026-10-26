import { schemas, indexSpecs } from './schema.js';
import { phase2Schemas, phase2IndexSpecs } from './phase2-schema.js';

function freeze<T>(value:T):T {
  if(value && typeof value==='object') {Object.values(value).forEach(freeze);Object.freeze(value);}
  return value;
}
// Fixed compile-time registries only. No environment, collection-count or client-selected modes.
export const baselineRegistry=freeze({mode:'baseline' as const,schemas,indexSpecs});
export const phase2Registry=freeze({mode:'phase2' as const,schemas:phase2Schemas,indexSpecs:phase2IndexSpecs});
