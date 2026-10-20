import { ref } from 'vue'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/composables/useAuth'

export type MatchRole = 'host' | 'guest'

export interface MatchRow {
  id: string
  code: string
  status: 'waiting' | 'playing' | 'finished'
  host_id: string
  host_name: string
  guest_id: string | null
  guest_name: string | null
  winner: string | null
  winner_name: string | null
}

/** Uppercase code, ambiguity-free alphabet (no O/0/I/1). */
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'

function generateCode(length = 6): string {
  let out = ''
  for (let i = 0; i < length; i++) {
    out += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)]
  }
  return out
}

/**
 * Create/join a PvP match row in `tcg_matches`, then wait for the opponent.
 *
 * The row is the durable record of the two seats, the shareable code, and the
 * final result. The live battle itself travels over a Supabase broadcast
 * channel (see {@link useOnlineController}); this composable only owns the
 * lobby lifecycle around that row.
 */
export function useOnlineMatch() {
  const { displayName } = useAuth()

  const match = ref<MatchRow | null>(null)
  const role = ref<MatchRole | null>(null)
  const waiting = ref(false)
  const error = ref('')
  const channel = ref<{ unsubscribe: () => void } | null>(null)

  function teardown() {
    if (channel.value) {
      channel.value.unsubscribe()
      channel.value = null
    }
  }

  /** Watch the match row until the opponent claims the free seat. */
  function watchForOpponent(matchId: string, onJoined: () => void) {
    teardown()
    const ch = supabase
      .channel(`tcg-lobby-${matchId}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'tcg_matches', filter: `id=eq.${matchId}` },
        (payload) => {
          const next = payload.new as MatchRow
          match.value = next
          if (next.guest_id) {
            waiting.value = false
            teardown()
            onJoined()
          }
        },
      )
      .subscribe()
    channel.value = ch
  }

  /** Host: create a waiting match and return its shareable code. */
  async function createMatch(onOpponentJoined: () => void): Promise<MatchRow | null> {
    error.value = ''
    waiting.value = true
    const { data: userData } = await supabase.auth.getUser()
    const uid = userData.user?.id
    if (!uid) {
      error.value = 'You must be signed in to create a match.'
      waiting.value = false
      return null
    }

    // Retry a few times in the unlikely event of a code collision.
    for (let attempt = 0; attempt < 5; attempt++) {
      const code = generateCode()
      const { data, error: insErr } = await supabase
        .from('tcg_matches')
        .insert({
          code,
          host_id: uid,
          host_name: displayName.value,
          status: 'waiting',
        })
        .select('id, code, status, host_id, host_name, guest_id, guest_name, winner, winner_name')
        .single()

      if (!insErr && data) {
        match.value = data as MatchRow
        role.value = 'host'
        watchForOpponent((data as MatchRow).id, onOpponentJoined)
        return match.value
      }
      // 23505 = unique_violation -> regenerate; anything else is fatal.
      if (insErr && insErr.code !== '23505') {
        error.value = insErr.message
        waiting.value = false
        return null
      }
    }

    error.value = 'Could not allocate a match code. Please try again.'
    waiting.value = false
    return null
  }

  /** Guest: claim a waiting match by code. */
  async function joinMatch(code: string): Promise<MatchRow | null> {
    error.value = ''
    const clean = code.trim().toUpperCase()
    if (clean.length < 4) {
      error.value = 'Enter the full match code.'
      return null
    }

    const { data, error: rpcErr } = await supabase.rpc('tcg_join_match', {
      p_code: clean,
      p_guest_name: displayName.value,
    })

    if (rpcErr) {
      error.value = rpcErr.message
      return null
    }

    const matchId = data as string
    const { data: row, error: selErr } = await supabase
      .from('tcg_matches')
      .select('id, code, status, host_id, host_name, guest_id, guest_name, winner, winner_name')
      .eq('id', matchId)
      .single()

    if (selErr || !row) {
      error.value = selErr?.message ?? 'Match not found.'
      return null
    }

    match.value = row as MatchRow
    role.value = 'guest'
    return match.value
  }

  return { match, role, waiting, error, createMatch, joinMatch, teardown }
}
