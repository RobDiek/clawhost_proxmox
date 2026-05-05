/**
 * Stage: positioning — mission, positioning statement, value props,
 * archetype, voice/tone, brand promise, anti-positioning. Universal stage.
 *
 * NEW prompt (was implicit in old stage 4). Splitting this out lets the user
 * review/edit positioning *before* generating the channel strategy — old
 * single-shot strategy locked positioning + channels into one bundle without
 * a checkpoint. Reads competitor_landscape + audience_personas as inputs.
 *
 * Output is the structured input that Brand-Deep will pre-populate from in
 * the gating step (design doc §12).
 */

import type { Context } from 'hono'
import { runStageGeneric } from './_runStageGeneric'

export async function run(c: Context): Promise<Response> {
    return runStageGeneric(c, 'positioning')
}