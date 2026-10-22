# Operations

How to look after a running Fodr: the queries and checks an operator needs. Connect with `psql "$DATABASE_URL"` (locally
`docker compose exec postgres psql -U fodr -d fodr`).

## AI cost and usage

Every call to the model is a row in `ai_usage` (#31, ADR 0015): the user, the route (`analysis`, `profile`,
`explanation`, `journal`), the model, the tokens, the estimated cost in SEK and how the call went. The cost is estimated
from `AI_PRICE_SEK_PER_MTOK_INPUT` and `AI_PRICE_SEK_PER_MTOK_OUTPUT`, so it is only as right as those prices; check them
against the provider's price list when the model or the exchange rate changes. The budget is about 300 kr per month
(spec, decision log).

Two gaps make the totals a lower bound. A reply that failed for a reason the provider did not report tokens with (a
reply that does not match the schema, an error from the SDK itself) is a `failed` row with 0 tokens and 0 kr, though
the provider may have billed it; many such rows mean something is wrong and the real cost is higher. And a user's rows
are deleted with the user, so a month's total shrinks when an account is deleted later.

### Monthly cost

The cost per calendar month in Sweden, with the number of calls and how many failed:

```sql
select date_trunc('month', created_at at time zone 'Europe/Stockholm') as month,
       count(*)                                        as calls,
       count(*) filter (where status = 'failed')       as failed,
       sum(input_tokens)                               as input_tokens,
       sum(output_tokens)                              as output_tokens,
       round(sum(cost_sek), 2)                         as cost_sek
from ai_usage
group by 1
order by 1 desc;
```

### This month by route and user

Where the money goes, to tune the quota or a prompt:

```sql
select route, count(*) as calls, round(sum(cost_sek), 2) as cost_sek
from ai_usage
where created_at >= date_trunc('month', now() at time zone 'Europe/Stockholm') at time zone 'Europe/Stockholm'
group by route
order by cost_sek desc;

select u.email, count(*) as calls, round(sum(a.cost_sek), 2) as cost_sek
from ai_usage a join users u on u.id = a.user_id
where a.created_at >= date_trunc('month', now() at time zone 'Europe/Stockholm') at time zone 'Europe/Stockholm'
group by u.email
order by cost_sek desc
limit 20;
```

### The daily quota

Each user may make `AI_DAILY_CALLS_PER_USER` calls per calendar day in Sweden; over it every AI call answers 429
`ai.quota_exceeded` and nothing reaches the model; each refusal is logged as `ai quota used` with its route. Calls that
may have reached the model count, failed or not, a timeout too; a call refused before it (a malformed request, no API
key, a key the provider rejects) does not. A row left `pending` is a call whose result could not be recorded;
it still counts for that day.

## The extraction eval in CI

CI's `eval` job (#34) reads every test report in `testdata/Testdata-from-other-dev/krubba-testdata-v2` with the real
model and compares it with the answer key, on any PR that changes the prompts or schemas, the provider interface, the
scoring, the model default (`DEFAULT_AI_MODEL` in `apps/api/src/config.ts`), the eval script, its command in
`apps/api/package.json`, its test data or the workflow (`scripts/ci/eval-needed.sh`); other PRs skip it, and so do
Dependabot's, which get no secrets and only bump versions. It checks the report reading only: the profile,
explanation and journal prompts are not evaluated. It fails on an invented value, the reference report read as an analysis, a failed call, or fewer than
`EVAL_THRESHOLD` (95 %) of the values right; the job summary shows each file. The baseline when the gate was added was
126 of 128 values right, the two misses being copper in B06, which the report rounds.

- **The key.** The job needs the repository secret `ANTHROPIC_API_KEY` (Settings > Secrets and variables > Actions)
  and fails without it. A key of its own with a monthly spend limit keeps CI's cost apart from the app's. A run is
  about 11 calls with PDFs and images, a few kronor.
- **The model.** The repository variable `AI_MODEL`, when set, is the model the eval uses, so it can match what the
  API is deployed with; otherwise the code's default.
- **Blocking merges.** A skipped job counts as passed, so `eval` can be a required status check in the branch
  protection rules (Settings > Branches): then a PR that breaks the reading cannot be merged, and other PRs are not
  held up.
- **Not covered.** An upgrade of the Anthropic SDK, zod or tsx in `package-lock.json` does not run the eval, as that
  would run it on every dependency change; run `npm run eval:analysis -w apps/api` by hand for such an upgrade.
- **A broken detection.** If the `ai-changes` job fails, `eval` runs anyway rather than being skipped.
