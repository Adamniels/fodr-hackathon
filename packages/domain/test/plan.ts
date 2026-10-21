import { skapaPlan, type Plan } from '../src/plan'

/** The plan for input a test knows is valid; invalid input fails the test with the errors (#13). */
export function planFor(...args: Parameters<typeof skapaPlan>): Plan {
  const result = skapaPlan(...args)
  if ('errors' in result) throw new Error(`Invalid input: ${JSON.stringify(result.errors)}`)
  return result.plan
}
