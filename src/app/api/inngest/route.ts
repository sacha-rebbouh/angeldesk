/**
 * Inngest API Route
 *
 * Endpoint pour Inngest - gère les événements et exécute les fonctions
 */

import { serve } from 'inngest/next'
import { inngest, functions } from '@/lib/inngest'

export const { GET, POST, PUT } = serve({
  client: inngest,
  functions,
})
