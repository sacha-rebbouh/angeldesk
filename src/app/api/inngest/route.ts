/**
 * Inngest API Route
 *
 * Endpoint pour Inngest - gère les événements et exécute les fonctions
 */

import { serve } from 'inngest/next'
import { inngest, functions } from '@/lib/inngest'

// Inngest executes long-running analysis steps through this route. Without an
// explicit Vercel duration, thesis/deep-dive runs can be killed mid-step and
// leave Analysis rows stuck RUNNING with partial progress.
export const maxDuration = 300;

export const { GET, POST, PUT } = serve({
  client: inngest,
  functions,
})
