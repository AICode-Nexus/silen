const state = globalThis as typeof globalThis & {
  __silenConfigEvaluationCount__?: number
}

state.__silenConfigEvaluationCount__ =
  (state.__silenConfigEvaluationCount__ ?? 0) + 1

export default {
  title: `Load ${state.__silenConfigEvaluationCount__}`,
}
