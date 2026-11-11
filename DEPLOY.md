# Deploying the backend API to the VPS

Two GitHub Actions workflows live in `.github/workflows/`:

| File | Runs on | Does |
| --- | --- | --- |
| `ci.yml` | pull requests and any branch except main | lint, tests and build, to catch problems early |
| `deploy.yml` | push to main, or "Run workflow" by hand | lint, tests, build, upload a release over SSH, switch to it with pm2, roll back if it does not answer |

## What happens on a deploy, in plain words

1. You push to `main`. GitHub starts a temporary Linux machine and checks that the code is healthy: lint, the tests, and a build. If any of these fail, nothing is deployed.
2. GitHub logs in to your VPS over SSH with a deploy key. If it can't log in, it stops and says why.
3. It uploads the built app into a new folder, `releases/<commit>`. The running site is not touched yet.
4. On the VPS it installs the production dependencies for that new folder. If this fails, it stops here and the old version keeps running.
5. It links two things from the shared folder into the new release: the `.env` settings file and the `uploads` folder with product photos. That is why photos and settings survive every deploy.
6. It points `current` at the new release and restarts the app with pm2.
7. It waits up to 40 seconds for the app to answer. If it answers, the deploy is done and old releases are cleaned up (the 3 newest are kept). If it does not answer, it switches `current` back to the previous release, restarts, and marks the deploy as failed.

## GitHub settings

The deploy job runs in the GitHub Environment named `bmback-prod`, so values can be stored there
(Settings > Environments > bmback-prod) or at repository level (Settings > Secrets and variables > Actions).
Names may only use letters, numbers and underscores.

Secrets:

- `SSH_HOST`: the server's IP address or domain, nothing else (no `user@`, no `ssh://`)
- `SSH_USER`: the login user on the server, for example `bongomaker`
- `SSH_PRIVATE_KEY`: the private half of a key made only for deploys (see below)
- `APP_PATH`: the folder on the server where releases live, for example `/var/www/bongomaker/ecom/back-app`
- `SSH_PORT` (optional, default 22)
- `SSH_KNOWN_HOSTS` (optional): pins the server's key. Get it with `ssh-keyscan -t ed25519 your-host` run on the VPS itself.

Variables (optional):

- `BACK_PORT` (default 3034): only used if `PORT` is missing from the server's `.env`
- `PM2_APP_NAME` (default `bmback-prod`): the process name in pm2

## Making the deploy key

On your own computer:

```bash
ssh-keygen -t ed25519 -f deploy_bmback -N ""
```

Put the contents of `deploy_bmback` (the private key, the whole file) in the `SSH_PRIVATE_KEY` secret. Add the single line from `deploy_bmback.pub` to `~/.ssh/authorized_keys` on the VPS for the deploy user. Then delete both files from your computer.

## One-time server setup

The deploy user needs Node 22 and pm2 (`npm i -g pm2`), then:

```bash
mkdir -p /var/www/bongomaker/ecom/back-app/shared/uploads
# Copy the settings from the app that runs today
cp /path/of/current/backend/.env /var/www/bongomaker/ecom/back-app/shared/.env
# Copy the photos that were already uploaded
cp -r /path/of/current/backend/uploads/. /var/www/bongomaker/ecom/back-app/shared/uploads/
```

The first deploy replaces the old hand-started pm2 process with one that runs from `current`.
The port the app listens on comes from `PORT` in `shared/.env`; make sure nginx points at it.

## Good to know

- By default the app updates the database tables itself when it starts (`DB_SYNCHRONIZE=true`). A deploy that changes the data model will change the production database. Back up first, or turn `DB_SYNCHRONIZE` off once the schema is stable. To require a human to approve each deploy, add "Required reviewers" to the `bmback-prod` environment.
- To roll back by hand: `ln -sfn releases/<older> current && pm2 reload bmback-prod`.
- The admin System health page looks for the process named in `PM2_BACK_NAME` in the backend `.env`; set it to `bmback-prod`.
