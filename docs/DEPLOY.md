# Hosting this

## Vercel

Works, with one thing you have to accept.

```bash
npx vercel          # first run links the project
npx vercel --prod
```

Set `AWS_BEARER_TOKEN_BEDROCK`, `AWS_REGION` and optionally `GEMINI_KEY` in
the project's environment settings.

**The catch.** Vercel mounts the deployment read-only, so the database lives in
`/tmp`. That directory belongs to one instance and is wiped when it recycles,
which means:

- Notices, classification, routing and posters all work normally
- Human decisions and the precedent table survive only while an instance stays
  warm; a cold start silently starts over
- Two instances running at once have two different databases

For a demo driven by one person that is usually invisible. For anything where
somebody's approval has to still be there tomorrow, it is wrong, and the fix
is a real database — see *Making decisions survive*.

The generated-poster cache is also per-instance there, so a cold start can
re-spend on an image that was already made.

## Containers

The app is a container. Anything that runs one will run it — the two paths
below are the shortest on AWS and GCP.

## Before you pick: the one thing that decides it

**The database is a file.** `data/pipeline.db` is SQLite, sitting on the
container's local disk. Containers on App Runner and Cloud Run get a *fresh*
disk on every restart and every deploy.

That means human decisions and the precedent table are lost when the container
restarts. Everything else survives, because everything else is regenerable:
the notices reseed from `data/events.json`, and the classifier is a JSON file
of weights.

For a demo that is fine, and arguably desirable — every session starts clean.
For anything a person is expected to rely on, see *Making decisions survive*
at the bottom.

## AWS App Runner

Recommended if you stay on AWS, because Bedrock is already there: the model
calls never leave the account, and there is no cross-cloud egress to explain
to anyone.

```bash
# 1. Build and push
aws ecr create-repository --repository-name emergent
aws ecr get-login-password --region us-west-2 \
  | docker login --username AWS --password-stdin <ACCOUNT>.dkr.ecr.us-west-2.amazonaws.com

docker build -t emergent .
docker tag emergent:latest <ACCOUNT>.dkr.ecr.us-west-2.amazonaws.com/emergent:latest
docker push <ACCOUNT>.dkr.ecr.us-west-2.amazonaws.com/emergent:latest

# 2. Create the service (console is easier the first time)
#    - Source: the ECR image above
#    - Port: 8080
#    - Environment: AWS_REGION, and either a Bedrock key or an instance role
```

Give the service an **instance role** with `bedrock:InvokeModel` rather than
pasting a key into the environment. Keys expire and end up in screenshots;
a role does neither.

## GCP Cloud Run

Simpler to get running, and fine even with Bedrock on AWS — it is one
outbound HTTPS call.

```bash
gcloud run deploy emergent \
  --source . \
  --region us-central1 \
  --port 8080 \
  --allow-unauthenticated \
  --set-env-vars AWS_REGION=us-west-2
```

`--source` builds the Dockerfile for you, so there is no registry step.

For the Bedrock key, use Secret Manager rather than `--set-env-vars`:

```bash
echo -n "$KEY" | gcloud secrets create bedrock-key --data-file=-
gcloud run services update emergent \
  --update-secrets AWS_BEARER_TOKEN_BEDROCK=bedrock-key:latest
```

## The trap that will bite you

`better-sqlite3` and `sharp` are **native addons**. They compile against the
platform they are installed on.

If you build the image in a way that copies `node_modules` from your Windows
checkout, the container gets Windows binaries and fails at startup with what
looks like a missing module — the error names the package, not the
architecture, so it reads as a dependency problem for about an hour.

The Dockerfile avoids this by running `npm ci` inside a Linux stage. Keep it
that way, and keep `node_modules` in `.dockerignore`.

## Environment

| Variable | Needed for | If absent |
|---|---|---|
| `AWS_BEARER_TOKEN_BEDROCK` | Executive summaries, period reports | Those features return an error; classification and posters still work |
| `AWS_REGION` | Bedrock endpoint | Defaults to `us-west-2` |
| `GEMINI_KEY` | The "Drawn by AI" poster engine | That engine returns 503; the rendered engine is unaffected |

**The classifier needs none of them.** It runs from `src/lib/model/weights.json`
locally, so categories and routing work with no network at all.

## Making decisions survive

Only worth doing when people start relying on the precedent table.

- **AWS**: run on ECS Fargate with an **EFS** volume mounted at `/app/data`.
  App Runner cannot mount one.
- **GCP**: Cloud Run with a **Filestore** or GCS FUSE mount at `/app/data`.
- **Either**: move the four tables to Postgres (RDS or Cloud SQL). The schema
  is in `src/lib/schema.sql` and is small — four tables, no stored procedures.
  This is the right answer if more than one instance ever runs at once, since
  two containers with two SQLite files silently diverge.

## Health check

`GET /` returns 200 once the server is up. It does not touch Bedrock, so it
stays green when the model is unreachable — which is what you want from a
health check.
