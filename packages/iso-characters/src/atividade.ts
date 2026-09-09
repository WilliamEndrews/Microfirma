/**
 * Activity do mundo -> animacao Klimmos.
 */

import type { Activity, ActorPose } from '@microfirma/contracts';
import type { AnimacaoKlimmos } from './folha.js';

export function atividadeParaAnim(
  activity: Activity,
  pose: ActorPose = 'standing',
): AnimacaoKlimmos {
  if (activity === 'walking') return 'Walk';
  if (pose === 'seated') return 'Sit';
  return 'Idle';
}
